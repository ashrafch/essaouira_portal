import json
import uuid

from fastapi.testclient import TestClient

from app.core.auth import create_access_token
from app.db import SessionLocal
from app.main import app
from app.models.unit import Unit


def _headers(username: str = "owner", role: str = "owner", tenant_id: str = "default"):
    token = create_access_token(username, role=role, tenant_id=tenant_id)
    return {"Authorization": f"Bearer {token}"}


def _create_device(client: TestClient, unit_id: int) -> int:
    external_id = f"telemetry-{uuid.uuid4().hex[:10]}"
    payload = {
        "provider": "mock",
        "external_id": external_id,
        "name": f"Telemetry Device {external_id[-4:]}",
        "category": "temperature_humidity_sensor",
        "unit_id": unit_id,
    }
    res = client.post("/smart/devices", headers=_headers(), json=payload)
    assert res.status_code == 200
    return res.json()["id"]


def test_device_telemetry_ingestion_and_series_query():
    with TestClient(app) as client:
        unit_id = client.get("/units", headers=_headers()).json()[0]["id"]
        device_id = _create_device(client, unit_id=unit_id)

        first = client.put(
            f"/smart/devices/{device_id}/state",
            headers=_headers(),
            json={
                "online": True,
                "temperature_c": "22.1",
                "humidity_pct": "53.0",
                "energy_w": "410.4",
                "motion_detected": False,
                "contact_open": True,
                "signal_rssi": -62,
                "raw_payload_json": json.dumps({"battery_level": 67, "energy_kwh": 1.2}),
            },
        )
        assert first.status_code == 200

        second = client.put(
            f"/smart/devices/{device_id}/state",
            headers=_headers(),
            json={
                "online": True,
                "temperature_c": "23.0",
                "humidity_pct": "55.1",
                "energy_w": "520.0",
                "motion_detected": True,
                "contact_open": False,
                "signal_rssi": -59,
                "raw_payload_json": json.dumps({"battery_level": 66, "energy_kwh": 1.4}),
            },
        )
        assert second.status_code == 200

        telemetry = client.get(
            f"/smart/telemetry/device/{device_id}",
            headers=_headers(),
            params={"interval": "1h"},
        )
        assert telemetry.status_code == 200
        payload = telemetry.json()
        assert payload["scope_type"] == "device"
        assert payload["scope_id"] == device_id

        metric_names = {s["metric_type"] for s in payload["series"]}
        assert {"temperature", "humidity", "power", "battery", "signal", "energy"}.issubset(metric_names)

        energy_series = next(s for s in payload["series"] if s["metric_type"] == "energy")
        assert len(energy_series["points"]) >= 1
        assert float(energy_series["points"][0]["sum_value"]) > 0


def test_unit_and_property_telemetry_aggregation():
    with TestClient(app) as client:
        props = client.get("/properties", headers=_headers()).json()
        if props:
            property_id = props[0]["id"]
        else:
            created = client.post(
                "/properties",
                headers=_headers(),
                json={"name": "Telemetry Property", "code": "telemetry-property", "timezone": "Africa/Casablanca"},
            )
            assert created.status_code == 200
            property_id = created.json()["id"]

        unit_id = client.get("/units", headers=_headers()).json()[0]["id"]
        db = SessionLocal()
        try:
            unit = db.query(Unit).filter(Unit.id == unit_id).first()
            assert unit is not None
            unit.property_id = property_id
            db.commit()
        finally:
            db.close()

        device_id = _create_device(client, unit_id=unit_id)
        state = client.put(
            f"/smart/devices/{device_id}/state",
            headers=_headers(),
            json={
                "online": True,
                "temperature_c": "24.0",
                "humidity_pct": "51.0",
                "energy_w": "300.0",
                "signal_rssi": -65,
                "raw_payload_json": json.dumps({"battery_level": 72, "energy_kwh": 2.8}),
            },
        )
        assert state.status_code == 200

        unit_telemetry = client.get(
            f"/smart/telemetry/unit/{unit_id}",
            headers=_headers(),
            params={"metric_type": "temperature", "interval": "1h"},
        )
        assert unit_telemetry.status_code == 200
        unit_payload = unit_telemetry.json()
        assert unit_payload["scope_type"] == "unit"
        assert unit_payload["scope_id"] == unit_id
        assert len(unit_payload["series"]) == 1
        assert unit_payload["series"][0]["metric_type"] == "temperature"

        property_telemetry = client.get(
            f"/smart/telemetry/property/{property_id}",
            headers=_headers(),
            params={"metric_type": "energy", "interval": "1h"},
        )
        assert property_telemetry.status_code == 200
        prop_payload = property_telemetry.json()
        assert prop_payload["scope_type"] == "property"
        assert prop_payload["scope_id"] == property_id
        assert len(prop_payload["series"]) == 1
        assert prop_payload["series"][0]["metric_type"] == "energy"


def test_telemetry_tenant_isolation():
    with TestClient(app) as client:
        unit_id = client.get("/units", headers=_headers()).json()[0]["id"]
        device_id = _create_device(client, unit_id=unit_id)

        upsert = client.put(
            f"/smart/devices/{device_id}/state",
            headers=_headers(),
            json={
                "online": True,
                "temperature_c": "21.2",
                "humidity_pct": "48.0",
                "energy_w": "210.0",
                "signal_rssi": -66,
                "raw_payload_json": json.dumps({"battery_level": 75}),
            },
        )
        assert upsert.status_code == 200

        own = client.get(f"/smart/telemetry/device/{device_id}", headers=_headers())
        assert own.status_code == 200
        assert own.json()["series"]

        other = client.get(
            f"/smart/telemetry/device/{device_id}",
            headers=_headers(tenant_id="other"),
        )
        assert other.status_code == 404
