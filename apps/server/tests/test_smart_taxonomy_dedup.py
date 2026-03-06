from fastapi.testclient import TestClient

from app.core.auth import create_access_token
from app.main import app


def _headers(username: str = "owner", role: str = "owner", tenant_id: str = "default"):
    token = create_access_token(username, role=role, tenant_id=tenant_id)
    return {"Authorization": f"Bearer {token}"}


def _unit_id(client: TestClient, headers: dict[str, str]) -> int:
    res = client.get("/units", headers=headers)
    assert res.status_code == 200
    payload = res.json()
    assert payload
    return payload[0]["id"]


def _relay_id(client: TestClient, headers: dict[str, str], unit_id: int, external_id: str) -> int:
    res = client.post(
        "/smart/devices",
        headers=headers,
        json={
            "unit_id": unit_id,
            "provider": "mock",
            "external_id": external_id,
            "name": f"Relay {external_id}",
            "category": "smart_relay",
            "is_active": True,
            "health_status": "healthy",
        },
    )
    assert res.status_code == 200
    return res.json()["id"]


def test_taxonomy_aliases_are_normalized_to_canonical_values():
    with TestClient(app) as client:
        headers = _headers()
        unit_id = _unit_id(client, headers)
        relay_id = _relay_id(client, headers, unit_id, "taxonomy-relay-1")

        cmd = client.post(
            f"/smart/devices/{relay_id}/commands",
            headers=headers,
            json={"command_type": "power_on", "payload": {}},
        )
        assert cmd.status_code == 200
        assert cmd.json()["command_type"] == "device.power.on"

        alert = client.post(
            "/smart/alerts",
            headers=headers,
            json={
                "unit_id": unit_id,
                "alert_type": "leak_detected",
                "severity": "warning",
                "title": "Leak alias",
            },
        )
        assert alert.status_code == 200
        assert alert.json()["alert_type"] == "sensor.leak_detected"

        scene = client.post(
            "/smart/scenes",
            headers=headers,
            json={"name": "Alias Scene", "description": "alias", "is_active": True},
        )
        assert scene.status_code == 200
        scene_id = scene.json()["id"]

        action = client.post(
            f"/smart/scenes/{scene_id}/actions",
            headers=headers,
            json={
                "position": 1,
                "action_type": "device_command",
                "target_device_id": relay_id,
                "payload": {"command_type": "power_off", "payload": {}},
                "is_active": True,
            },
        )
        assert action.status_code == 200
        assert action.json()["action_type"] == "action.dispatch_device_command"

        rule = client.post(
            "/smart/automation-rules",
            headers=headers,
            json={
                "name": "Alias Rule",
                "trigger_type": "booking_checked_in",
                "action_type": "create_alert",
                "target_unit_id": unit_id,
                "payload": {"title": "Alias rule alert"},
                "is_active": True,
            },
        )
        assert rule.status_code == 200
        assert rule.json()["trigger_type"] == "booking.checked_in"
        assert rule.json()["action_type"] == "action.create_alert"


def test_trigger_mismatch_is_rejected_but_manual_support_remains():
    with TestClient(app) as client:
        headers = _headers()
        unit_id = _unit_id(client, headers)

        rule = client.post(
            "/smart/automation-rules",
            headers=headers,
            json={
                "name": "Mismatch guard",
                "trigger_type": "booking.checked_in",
                "action_type": "create_alert",
                "target_unit_id": unit_id,
                "payload": {"title": "Mismatch alert"},
                "is_active": True,
            },
        )
        assert rule.status_code == 200
        rule_id = rule.json()["id"]

        mismatch = client.post(
            f"/smart/automation-rules/{rule_id}/trigger",
            headers=headers,
            json={
                "trigger_type": "alert.raised",
                "trigger_source": "auto.alert",
                "context": {"alert_id": 1001, "unit_id": unit_id},
            },
        )
        assert mismatch.status_code == 400

        manual = client.post(
            f"/smart/automation-rules/{rule_id}/trigger",
            headers=headers,
            json={
                "trigger_type": "manual",
                "trigger_source": "manual.api",
                "context": {"unit_id": unit_id},
            },
        )
        assert manual.status_code == 200
        assert manual.json()["trigger_type"] == "booking.checked_in"


def test_automatic_dedup_returns_existing_execution_for_same_trigger_context():
    with TestClient(app) as client:
        headers = _headers()
        unit_id = _unit_id(client, headers)

        rule = client.post(
            "/smart/automation-rules",
            headers=headers,
            json={
                "name": "Dedup Rule",
                "trigger_type": "booking.checked_out",
                "action_type": "create_alert",
                "target_unit_id": unit_id,
                "payload": {"title": "Dedup alert"},
                "is_active": True,
            },
        )
        assert rule.status_code == 200
        rule_id = rule.json()["id"]

        trigger_payload = {
            "trigger_type": "booking.checked_out",
            "trigger_source": "auto.booking",
            "context": {"booking_id": 77, "unit_id": unit_id},
        }
        first = client.post(f"/smart/automation-rules/{rule_id}/trigger", headers=headers, json=trigger_payload)
        assert first.status_code == 200
        first_id = first.json()["id"]
        assert first.json()["dedup_key"]

        second = client.post(f"/smart/automation-rules/{rule_id}/trigger", headers=headers, json=trigger_payload)
        assert second.status_code == 200
        assert second.json()["id"] == first_id


def test_correlation_id_propagates_to_execution_and_command_side_effect():
    with TestClient(app) as client:
        headers = _headers()
        unit_id = _unit_id(client, headers)
        relay_id = _relay_id(client, headers, unit_id, "taxonomy-relay-2")

        rule = client.post(
            "/smart/automation-rules",
            headers=headers,
            json={
                "name": "Correlation Rule",
                "trigger_type": "manual",
                "action_type": "device_command",
                "target_device_id": relay_id,
                "payload": {"command_type": "power_on", "payload": {}},
                "is_active": True,
            },
        )
        assert rule.status_code == 200
        rule_id = rule.json()["id"]

        trigger = client.post(
            f"/smart/automation-rules/{rule_id}/trigger",
            headers=headers,
            json={
                "trigger_type": "manual",
                "trigger_source": "manual.api",
                "correlation_id": "corr-test-001",
                "context": {"unit_id": unit_id},
            },
        )
        assert trigger.status_code == 200
        execution = trigger.json()
        assert execution["correlation_id"] == "corr-test-001"

        commands = client.get(f"/smart/devices/{relay_id}/commands", headers=headers)
        assert commands.status_code == 200
        assert commands.json()[0]["correlation_id"] == "corr-test-001"
