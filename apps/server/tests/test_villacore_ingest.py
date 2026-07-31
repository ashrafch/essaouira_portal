"""Inbound VillaCore events: authentication, mapping, and loop prevention."""

import os
from unittest.mock import patch

from fastapi.testclient import TestClient

from app.core.auth import create_access_token
from app.main import app
from tests.test_villacore_link import (
    _FakeHomeAssistant,
    _bind_zone_map,
    _patch_ha,
    _unit_id,
    _villacore_env,
)

INGEST_TOKEN = "test-ingest-secret-value"


def _headers(username: str = "owner", role: str = "owner", tenant_id: str = "default"):
    token = create_access_token(username, role=role, tenant_id=tenant_id)
    return {"Authorization": f"Bearer {token}"}


def _ingest_env():
    return patch.dict(os.environ, {"SMART_INGEST_TOKEN": INGEST_TOKEN}, clear=False)


def _event(event: str, entity_id: str, **extra):
    payload = {
        "schema": "villacore.event.v1",
        "site": "dev",
        "event": event,
        "entity_id": entity_id,
        "occurred_at": "2026-07-31T10:00:00+00:00",
    }
    payload.update(extra)
    return payload


def _synced_client(client, headers):
    unit_id = _unit_id(client, headers)
    _bind_zone_map(client, headers, unit_id)
    client.post("/smart/providers/sync?provider=villacore", headers=headers)
    return unit_id


def test_ingest_accepts_the_shared_secret_without_a_portal_login():
    fake = _FakeHomeAssistant()
    with _villacore_env(), _ingest_env(), _patch_ha(fake):
        with TestClient(app) as client:
            _synced_client(client, _headers())

            response = client.post(
                "/smart/link/events",
                headers={"X-Smart-Ingest-Token": INGEST_TOKEN},
                json=_event("unit.checkin.completed", "script.a1_check_in", booking_ref="BK-9"),
            )
            assert response.status_code == 200, response.text
            body = response.json()
            assert body["accepted"] is True
            assert body["event"] == "unit.checkin.completed"
            assert body["event_id"] is not None


def test_ingest_rejects_a_wrong_secret_and_requires_authentication():
    fake = _FakeHomeAssistant()
    with _villacore_env(), _ingest_env(), _patch_ha(fake):
        with TestClient(app) as client:
            _synced_client(client, _headers())
            event = _event("unit.ready", "script.a1_mark_ready")

            wrong = client.post(
                "/smart/link/events",
                headers={"X-Smart-Ingest-Token": "not-the-secret"},
                json=event,
            )
            assert wrong.status_code == 401

            anonymous = client.post("/smart/link/events", json=event)
            assert anonymous.status_code == 401


def test_safety_stop_event_raises_an_alert_with_the_reason():
    fake = _FakeHomeAssistant()
    with _villacore_env(), _ingest_env(), _patch_ha(fake):
        with TestClient(app) as client:
            headers = _headers()
            _synced_client(client, headers)

            response = client.post(
                "/smart/link/events",
                headers={"X-Smart-Ingest-Token": INGEST_TOKEN},
                json=_event(
                    "facility.safety_stop",
                    "sensor.pool_filtration_state",
                    severity="critical",
                    reason="no_flow",
                    zone="pool",
                ),
            )
            assert response.status_code == 200, response.text
            body = response.json()
            assert body["accepted"] is True
            assert body["alert_id"] is not None

            alerts = client.get("/smart/alerts?status=open", headers=headers).json()
            alert = next(a for a in alerts if a["id"] == body["alert_id"])
            assert alert["alert_type"] == "facility.safety_stop"
            assert alert["severity"] == "critical"
            # The operator must be able to read *why* it stopped.
            assert "assenza di flusso" in alert["description"]


def test_recovery_event_closes_the_alert_the_failure_opened():
    fake = _FakeHomeAssistant()
    with _villacore_env(), _ingest_env(), _patch_ha(fake):
        with TestClient(app) as client:
            headers = _headers()
            _synced_client(client, headers)
            ingest_headers = {"X-Smart-Ingest-Token": INGEST_TOKEN}

            raised = client.post(
                "/smart/link/events",
                headers=ingest_headers,
                json=_event(
                    "facility.devices.unavailable",
                    "binary_sensor.pool_devices_available",
                    severity="critical",
                    zone="pool",
                ),
            ).json()
            assert raised["alert_id"] is not None

            recovered = client.post(
                "/smart/link/events",
                headers=ingest_headers,
                json=_event(
                    "facility.devices.recovered",
                    "binary_sensor.pool_devices_available",
                    zone="pool",
                ),
            ).json()
            assert recovered["accepted"] is True
            assert recovered["resolved_alerts"] >= 1

            open_alerts = client.get("/smart/alerts?status=open", headers=headers).json()
            assert raised["alert_id"] not in {a["id"] for a in open_alerts}


def test_event_echoing_our_own_command_is_recorded_but_does_not_re_trigger_rules():
    fake = _FakeHomeAssistant()
    with _villacore_env(), _ingest_env(), _patch_ha(fake):
        with TestClient(app) as client:
            headers = _headers()
            unit_id = _synced_client(client, headers)

            # The portal asks for a check-in and keeps the correlation id...
            dispatched = client.post(
                f"/smart/units/{unit_id}/workflow/checkin", headers=headers, json={}
            )
            assert dispatched.status_code == 200, dispatched.text
            correlation_id = dispatched.json()["correlation_id"]

            # ...VillaCore executes it and echoes that id back.
            echoed = client.post(
                "/smart/link/events",
                headers={"X-Smart-Ingest-Token": INGEST_TOKEN},
                json=_event(
                    "unit.checkin.completed",
                    "script.a1_check_in",
                    correlation_id=correlation_id,
                ),
            )
            assert echoed.status_code == 200, echoed.text
            body = echoed.json()
            assert body["accepted"] is True
            # Recognised as our own action: recorded for the timeline, but it
            # must not start a second round of automation.
            assert body["echo_of_portal_command"] is True

            foreign = client.post(
                "/smart/link/events",
                headers={"X-Smart-Ingest-Token": INGEST_TOKEN},
                json=_event(
                    "unit.checkin.completed",
                    "script.a1_check_in",
                    correlation_id="manual-from-ha-dashboard",
                ),
            ).json()
            assert foreign["echo_of_portal_command"] is False


def test_unknown_entity_is_refused_with_a_useful_reason():
    fake = _FakeHomeAssistant()
    with _villacore_env(), _ingest_env(), _patch_ha(fake):
        with TestClient(app) as client:
            _synced_client(client, _headers())

            response = client.post(
                "/smart/link/events",
                headers={"X-Smart-Ingest-Token": INGEST_TOKEN},
                json=_event("state.changed", "sensor.brand_new_thing"),
            )
            assert response.status_code == 200
            body = response.json()
            assert body["accepted"] is False
            assert "provider sync" in body["reason"]


def test_unsupported_or_malformed_envelopes_are_refused_not_crashed():
    fake = _FakeHomeAssistant()
    with _villacore_env(), _ingest_env(), _patch_ha(fake):
        with TestClient(app) as client:
            _synced_client(client, _headers())
            ingest_headers = {"X-Smart-Ingest-Token": INGEST_TOKEN}

            unsupported = client.post(
                "/smart/link/events",
                headers=ingest_headers,
                json=_event("something.we.never.defined", "script.a1_check_in"),
            )
            assert unsupported.status_code == 200
            assert unsupported.json()["accepted"] is False

            not_an_envelope = client.post(
                "/smart/link/events",
                headers=ingest_headers,
                json={"hello": "world"},
            )
            assert not_an_envelope.status_code == 200
            assert not_an_envelope.json()["accepted"] is False


def test_event_carrying_state_updates_the_device():
    fake = _FakeHomeAssistant()
    with _villacore_env(), _ingest_env(), _patch_ha(fake):
        with TestClient(app) as client:
            headers = _headers()
            _synced_client(client, headers)

            devices = client.get("/smart/devices", headers=headers).json()
            stay = next(
                d
                for d in devices
                if d["external_id"] == "input_select.a1_stay_status"
                and d["provider"] == "villacore"
            )

            response = client.post(
                "/smart/link/events",
                headers={"X-Smart-Ingest-Token": INGEST_TOKEN},
                json=_event(
                    "unit.checkin.completed",
                    "input_select.a1_stay_status",
                    state={"state": "Occupato", "attributes": {}},
                ),
            )
            assert response.status_code == 200, response.text
            assert response.json()["accepted"] is True

            state = client.get(f"/smart/devices/{stay['id']}/state", headers=headers).json()
            assert state["online"] is True


def test_reconcile_reimports_and_repolls():
    fake = _FakeHomeAssistant()
    with _villacore_env(), _patch_ha(fake):
        with TestClient(app) as client:
            headers = _headers()
            _synced_client(client, headers)

            response = client.post("/smart/link/reconcile?provider=villacore", headers=headers)
            assert response.status_code == 200, response.text
            body = response.json()
            assert body["provider_name"] == "villacore"
            assert body["polled_devices"] >= 1
            assert body["updated_states"] >= 1
            # `errors` is not asserted to be zero on purpose: a device that has
            # disappeared from Home Assistant is expected to fail its poll and be
            # marked offline, which is exactly what reconciliation is for.
            assert body["reconciled_at"]
