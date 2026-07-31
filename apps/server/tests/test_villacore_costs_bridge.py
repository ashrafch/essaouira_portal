"""Utility costs from telemetry, and the PMS -> building bridge."""

import os
from datetime import date, datetime, timedelta, timezone
from unittest.mock import patch

from fastapi.testclient import TestClient

from app.core.auth import create_access_token
from app.db import SessionLocal
from app.main import app
from app.models.smart_building import Device, DeviceTelemetry
from tests.test_villacore_link import (
    _FakeHomeAssistant,
    _bind_zone_map,
    _patch_ha,
    _unit_id,
    _villacore_env,
)


def _headers(username: str = "owner", role: str = "owner", tenant_id: str = "default"):
    token = create_access_token(username, role=role, tenant_id=tenant_id)
    return {"Authorization": f"Bearer {token}"}


def _seed_daily_energy(external_id: str, day_values: dict[int, str], month: int, year: int):
    """Write daily-counter samples the way the ingest would.

    Several samples per day with a rising value, so the aggregation has to pick
    each day's peak rather than summing every sample.
    """
    db = SessionLocal()
    try:
        device = (
            db.query(Device)
            .filter(Device.external_id == external_id, Device.provider == "villacore")
            .first()
        )
        assert device is not None, external_id
        for day, peak in day_values.items():
            base = datetime(year, month, day, 6, 0, tzinfo=timezone.utc)
            for step, factor in enumerate(("0.25", "0.60", "1.00")):
                db.add(
                    DeviceTelemetry(
                        tenant_id=device.tenant_id,
                        unit_id=device.unit_id,
                        device_id=device.id,
                        metric_type="energy",
                        value=float(peak) * float(factor),
                        unit="kWh",
                        recorded_at=base + timedelta(hours=step * 4),
                    )
                )
        db.commit()
        return device.id
    finally:
        db.close()


def test_capability_metric_becomes_telemetry_even_without_a_device_class():
    fake = _FakeHomeAssistant()
    with _villacore_env(), _patch_ha(fake):
        with TestClient(app) as client:
            headers = _headers()
            unit_id = _unit_id(client, headers)
            _bind_zone_map(client, headers, unit_id)
            client.post("/smart/providers/sync?provider=villacore", headers=headers)

            devices = client.get("/smart/devices", headers=headers).json()
            meter = next(
                d
                for d in devices
                if d["external_id"] == "sensor.energy_a1_daily" and d["provider"] == "villacore"
            )
            telemetry = client.get(
                f"/smart/telemetry/device/{meter['id']}?metric_type=energy", headers=headers
            )
            assert telemetry.status_code == 200, telemetry.text
            # The kWh reading is stored because `metric.energy_daily` says what
            # the number means; the HA device class alone would not be enough.
            series = telemetry.json()["series"]
            assert series and any(item["points"] for item in series)


def test_utility_cost_report_uses_the_tariff_published_by_villacore():
    fake = _FakeHomeAssistant()
    with _villacore_env(), _patch_ha(fake):
        with TestClient(app) as client:
            headers = _headers()
            unit_id = _unit_id(client, headers)
            _bind_zone_map(client, headers, unit_id)
            client.post("/smart/providers/sync?provider=villacore", headers=headers)

            year, month = 2026, 5
            _seed_daily_energy(
                "sensor.energy_a1_daily", {2: "4.0", 3: "6.0", 4: "5.0"}, month, year
            )

            response = client.get(
                f"/smart/utility-costs?year={year}&month={month}", headers=headers
            )
            assert response.status_code == 200, response.text
            report = response.json()
            # 0.24 EUR/kWh comes from input_number.energy_price_per_kwh.
            assert report["energy_price_eur_kwh"] == 0.24
            assert report["energy_price_source"] == "villacore"

            unit_row = next(r for r in report["rows"] if r["unit_id"] == unit_id)
            # Peak per day: 4 + 6 + 5 = 15 kWh, not the sum of all samples.
            assert unit_row["quantity"] == 15.0
            assert unit_row["amount"] == round(15.0 * 0.24, 2)
            assert unit_row["estimated"] is False
            assert unit_row["scope"] == "unit"


def test_posting_utility_costs_is_idempotent_and_lands_in_the_month_summary():
    fake = _FakeHomeAssistant()
    with _villacore_env(), _patch_ha(fake):
        with TestClient(app) as client:
            headers = _headers()
            unit_id = _unit_id(client, headers)
            _bind_zone_map(client, headers, unit_id)
            client.post("/smart/providers/sync?provider=villacore", headers=headers)

            year, month = 2026, 6
            _seed_daily_energy("sensor.energy_a1_daily", {10: "10.0"}, month, year)

            first = client.post(
                f"/smart/utility-costs/post?year={year}&month={month}", headers=headers
            )
            assert first.status_code == 200, first.text
            assert first.json()["created"] >= 1
            assert first.json()["updated"] == 0

            # Re-running a month must correct, never duplicate.
            second = client.post(
                f"/smart/utility-costs/post?year={year}&month={month}", headers=headers
            )
            assert second.status_code == 200
            assert second.json()["created"] == 0
            assert second.json()["updated"] >= 1

            costs = client.get("/cost-items", headers=headers).json()
            generated = [
                c
                for c in costs
                if (c.get("description") or "").startswith("[smart-utility]")
                and c["date"] == str(date(year, month, 30))
            ]
            assert len(generated) == 1
            assert generated[0]["category"] == "utilities"

            pnl = client.get(f"/analytics/month-pnl?year={year}&month={month}", headers=headers)
            assert pnl.status_code == 200, pnl.text
            body = pnl.json()
            assert body["costs_total"] >= generated[0]["amount"]
            # It reaches the P&L as a utilities line, next to cleaning and fees.
            assert any(
                row["category"] == "utilities" and row["total"] >= generated[0]["amount"]
                for row in body["costs_by_category"]
            )


def test_estimated_cost_is_labelled_when_a_plant_has_no_meter():
    fake = _FakeHomeAssistant()
    with _villacore_env(), _patch_ha(fake):
        with TestClient(app) as client:
            headers = _headers()
            client.post("/smart/providers/sync?provider=villacore", headers=headers)

            # The pool reports runtime but no kWh: the profile's rated power is
            # the only way to price it, and that must be visible as an estimate.
            db = SessionLocal()
            try:
                pool_state = (
                    db.query(Device)
                    .filter(
                        Device.external_id == "sensor.pool_filtration_state",
                        Device.provider == "villacore",
                    )
                    .first()
                )
                runtime_device = Device(
                    tenant_id=pool_state.tenant_id,
                    provider="villacore",
                    external_id="sensor.pool_pump_runtime",
                    name="Pool Pump Runtime",
                    category="runtime_meter",
                    zone_key="pool",
                    facility_key="pool",
                    capability_key="metric.runtime",
                )
                db.add(runtime_device)
                db.commit()
                for day, hours in ((5, 3.0), (6, 2.0)):
                    db.add(
                        DeviceTelemetry(
                            tenant_id=runtime_device.tenant_id,
                            device_id=runtime_device.id,
                            metric_type="runtime",
                            value=hours,
                            unit="h",
                            recorded_at=datetime(2026, 4, day, 20, 0, tzinfo=timezone.utc),
                        )
                    )
                db.commit()
            finally:
                db.close()

            report = client.get("/smart/utility-costs?year=2026&month=4", headers=headers).json()
            pool_row = next(r for r in report["rows"] if r["facility_key"] == "pool")
            assert pool_row["estimated"] is True
            assert "nessun contatore" in pool_row["estimate_basis"]
            # 5 h x 750 W = 3.75 kWh
            assert pool_row["quantity"] == 3.75
            assert report["has_estimates"] is True


def test_completing_a_checkin_task_dispatches_the_building_workflow():
    fake = _FakeHomeAssistant()
    with _villacore_env(), _patch_ha(fake):
        with TestClient(app) as client:
            headers = _headers()
            unit_id = _unit_id(client, headers)
            _bind_zone_map(client, headers, unit_id)
            client.post("/smart/providers/sync?provider=villacore", headers=headers)

            booking = client.post(
                "/bookings",
                headers=headers,
                json={
                    "unit_id": unit_id,
                    "guest_name": "Bridge Test",
                    "num_adults": 2,
                    "checkin_date": "2027-06-10",
                    "checkout_date": "2027-06-14",
                },
            )
            assert booking.status_code in {200, 201}, booking.text
            booking_id = booking.json()["id"]

            task = client.post(
                "/staff-tasks",
                headers=headers,
                json={
                    "unit_id": unit_id,
                    "booking_id": booking_id,
                    "date": "2027-06-10",
                    "task_type": "checkin",
                    "status": "planned",
                    "notes": "auto: arrivo ospite",
                },
            )
            assert task.status_code in {200, 201}, task.text
            task_id = task.json()["id"]

            before = len(fake.service_calls)
            done = client.put(
                f"/staff-tasks/{task_id}",
                headers=headers,
                json={
                    "unit_id": unit_id,
                    "booking_id": booking_id,
                    "date": "2027-06-10",
                    "task_type": "checkin",
                    "status": "done",
                    "notes": "auto: arrivo ospite",
                },
            )
            assert done.status_code == 200, done.text

            new_calls = fake.service_calls[before:]
            checkin_call = next(
                (c for c in new_calls if c[1].get("entity_id") == "script.a1_check_in"), None
            )
            assert checkin_call is not None, new_calls
            assert checkin_call[0] == "script/turn_on"
            # The booking context travels with it, so VillaCore can show who arrived.
            assert checkin_call[1]["variables"]["booking_ref"] == f"BK-{booking_id}"


def test_task_completion_still_succeeds_when_the_building_has_no_workflow():
    fake = _FakeHomeAssistant()
    with patch.dict(os.environ, {"SMART_PROVIDER_MODE": "mock"}, clear=False), _patch_ha(fake):
        with TestClient(app) as client:
            headers = _headers()
            unit_id = _unit_id(client, headers, name="Unit F")

            booking = client.post(
                "/bookings",
                headers=headers,
                json={
                    "unit_id": unit_id,
                    "guest_name": "No Smart",
                    "num_adults": 1,
                    "checkin_date": "2027-07-01",
                    "checkout_date": "2027-07-03",
                },
            )
            booking_id = booking.json()["id"]
            task = client.post(
                "/staff-tasks",
                headers=headers,
                json={
                    "unit_id": unit_id,
                    "booking_id": booking_id,
                    "date": "2027-07-01",
                    "task_type": "checkout",
                    "status": "planned",
                    "notes": "auto: partenza",
                },
            )
            task_id = task.json()["id"]

            # No capability on this unit: operations must not be blocked by it.
            done = client.put(
                f"/staff-tasks/{task_id}",
                headers=headers,
                json={
                    "unit_id": unit_id,
                    "booking_id": booking_id,
                    "date": "2027-07-01",
                    "task_type": "checkout",
                    "status": "done",
                    "notes": "auto: partenza",
                },
            )
            assert done.status_code == 200, done.text
            assert done.json()["status"] == "done"
