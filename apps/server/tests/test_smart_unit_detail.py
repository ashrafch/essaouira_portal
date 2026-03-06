from fastapi.testclient import TestClient

from app.core.auth import create_access_token
from app.main import app


def _headers(username: str = "owner", role: str = "owner", tenant_id: str = "default"):
    token = create_access_token(username, role=role, tenant_id=tenant_id)
    return {"Authorization": f"Bearer {token}"}


def _first_two_unit_ids(client: TestClient, headers: dict[str, str]) -> tuple[int, int]:
    units_res = client.get("/units", headers=headers)
    assert units_res.status_code == 200
    units = units_res.json()
    assert len(units) >= 2
    return units[0]["id"], units[1]["id"]


def test_smart_unit_detail_includes_devices_states_alerts_and_events():
    with TestClient(app) as client:
        headers = _headers()
        unit_id, _ = _first_two_unit_ids(client, headers)

        device_res = client.post(
            "/smart/devices",
            headers=headers,
            json={
                "unit_id": unit_id,
                "provider": "mock",
                "external_id": "unit-detail-main-1",
                "name": "Smart Plug Unit Main",
                "category": "smart_plug",
                "is_active": True,
                "health_status": "healthy",
            },
        )
        assert device_res.status_code == 200
        device_id = device_res.json()["id"]

        state_res = client.put(
            f"/smart/devices/{device_id}/state",
            headers=headers,
            json={"online": True, "power_state": "on", "signal_rssi": -55},
        )
        assert state_res.status_code == 200

        open_alert_res = client.post(
            "/smart/alerts",
            headers=headers,
            json={
                "unit_id": unit_id,
                "device_id": device_id,
                "alert_type": "battery_low",
                "severity": "warning",
                "title": "Batteria in calo",
                "description": "Sotto soglia del 20%",
            },
        )
        assert open_alert_res.status_code == 200

        to_ack_alert_res = client.post(
            "/smart/alerts",
            headers=headers,
            json={
                "unit_id": unit_id,
                "device_id": device_id,
                "alert_type": "contact_opened",
                "severity": "info",
                "title": "Contatto aperto",
                "description": "Evento test",
            },
        )
        assert to_ack_alert_res.status_code == 200
        ack_id = to_ack_alert_res.json()["id"]
        ack_res = client.put(f"/smart/alerts/{ack_id}/acknowledge", headers=headers)
        assert ack_res.status_code == 200

        event_res = client.post(
            f"/smart/devices/{device_id}/events",
            headers=headers,
            json={
                "event_type": "manual_check",
                "severity": "info",
                "source": "test-suite",
                "payload_json": "{\"ok\":true}",
            },
        )
        assert event_res.status_code == 200

        detail_res = client.get(f"/smart/units/{unit_id}", headers=headers)
        assert detail_res.status_code == 200
        payload = detail_res.json()

        assert payload["unit"]["id"] == unit_id
        assert payload["summary"]["total_devices"] >= 1
        assert payload["summary"]["online_devices"] >= 1
        assert payload["summary"]["open_alerts"] >= 1
        assert payload["summary"]["resolved_alerts"] >= 1
        assert any(d["id"] == device_id for d in payload["devices"])
        assert any(s["device_id"] == device_id for s in payload["states"])
        assert any(a["status"] == "open" for a in payload["alerts_open"])
        assert any(a["status"] != "open" for a in payload["alerts_resolved"])
        assert any(e["device_id"] == device_id for e in payload["events_recent"])


def test_smart_unit_detail_excludes_other_units_data():
    with TestClient(app) as client:
        headers = _headers()
        primary_unit_id, secondary_unit_id = _first_two_unit_ids(client, headers)

        primary_device_res = client.post(
            "/smart/devices",
            headers=headers,
            json={
                "unit_id": primary_unit_id,
                "provider": "mock",
                "external_id": "unit-detail-primary-only",
                "name": "Primary Device",
                "category": "motion_sensor",
                "is_active": True,
                "health_status": "healthy",
            },
        )
        assert primary_device_res.status_code == 200
        primary_device_id = primary_device_res.json()["id"]

        secondary_device_res = client.post(
            "/smart/devices",
            headers=headers,
            json={
                "unit_id": secondary_unit_id,
                "provider": "mock",
                "external_id": "unit-detail-secondary-only",
                "name": "Secondary Device",
                "category": "motion_sensor",
                "is_active": True,
                "health_status": "healthy",
            },
        )
        assert secondary_device_res.status_code == 200
        secondary_device_id = secondary_device_res.json()["id"]

        secondary_alert = client.post(
            "/smart/alerts",
            headers=headers,
            json={
                "unit_id": secondary_unit_id,
                "device_id": secondary_device_id,
                "alert_type": "leak_detected",
                "severity": "critical",
                "title": "Leak unit secondaria",
            },
        )
        assert secondary_alert.status_code == 200

        secondary_event = client.post(
            f"/smart/devices/{secondary_device_id}/events",
            headers=headers,
            json={
                "event_type": "secondary_event",
                "severity": "warning",
                "source": "test-suite",
            },
        )
        assert secondary_event.status_code == 200

        primary_event = client.post(
            f"/smart/devices/{primary_device_id}/events",
            headers=headers,
            json={
                "event_type": "primary_event",
                "severity": "info",
                "source": "test-suite",
            },
        )
        assert primary_event.status_code == 200

        detail_res = client.get(f"/smart/units/{primary_unit_id}", headers=headers)
        assert detail_res.status_code == 200
        payload = detail_res.json()

        assert any(d["id"] == primary_device_id for d in payload["devices"])
        assert all(d["id"] != secondary_device_id for d in payload["devices"])
        assert all(a["unit_id"] == primary_unit_id for a in payload["alerts_open"])
        assert len(payload["events_recent"]) >= 1
        assert all(e["unit_id"] == primary_unit_id for e in payload["events_recent"])


def test_smart_unit_detail_tenant_isolated():
    with TestClient(app) as client:
        owner_headers = _headers(username="owner-default", role="owner", tenant_id="default")
        foreign_headers = _headers(username="owner-b", role="owner", tenant_id="tenant_b")
        unit_id, _ = _first_two_unit_ids(client, owner_headers)

        detail_res = client.get(f"/smart/units/{unit_id}", headers=foreign_headers)
        assert detail_res.status_code == 404
