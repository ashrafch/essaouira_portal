from fastapi.testclient import TestClient

from app.core.auth import create_access_token
from app.main import app


def _headers(username: str = "owner", role: str = "owner", tenant_id: str = "default"):
    token = create_access_token(username, role=role, tenant_id=tenant_id)
    return {"Authorization": f"Bearer {token}"}


def _create_device(
    client: TestClient,
    headers: dict[str, str],
    *,
    category: str,
    external_id: str,
    name: str,
) -> int:
    response = client.post(
        "/smart/devices",
        headers=headers,
        json={
            "provider": "mock",
            "external_id": external_id,
            "name": name,
            "category": category,
            "is_active": True,
            "health_status": "healthy",
        },
    )
    assert response.status_code == 200
    return response.json()["id"]


def test_device_command_lifecycle_for_relay_and_climate():
    with TestClient(app) as client:
        headers = _headers()
        relay_id = _create_device(
            client,
            headers,
            category="smart_relay",
            external_id="cmd-relay-1",
            name="Relay Cmd 1",
        )
        climate_id = _create_device(
            client,
            headers,
            category="climate_controller",
            external_id="cmd-climate-1",
            name="Climate Cmd 1",
        )

        relay_cmd = client.post(
            f"/smart/devices/{relay_id}/commands",
            headers=headers,
            json={"command_type": "power_on", "payload": {}},
        )
        assert relay_cmd.status_code == 200
        relay_payload = relay_cmd.json()
        assert relay_payload["status"] == "executed"
        assert relay_payload["executed_at"] is not None

        climate_cmd = client.post(
            f"/smart/devices/{climate_id}/commands",
            headers=headers,
            json={"command_type": "climate_set_mode", "payload": {"mode": "eco"}},
        )
        assert climate_cmd.status_code == 200
        climate_payload = climate_cmd.json()
        assert climate_payload["status"] == "executed"

        list_cmds = client.get(f"/smart/devices/{relay_id}/commands", headers=headers)
        assert list_cmds.status_code == 200
        assert any(c["id"] == relay_payload["id"] for c in list_cmds.json())

        get_cmd = client.get(
            f"/smart/devices/{relay_id}/commands/{relay_payload['id']}",
            headers=headers,
        )
        assert get_cmd.status_code == 200
        assert get_cmd.json()["command_type"] == "power_on"


def test_device_command_scope_validation():
    with TestClient(app) as client:
        headers = _headers()
        sensor_id = _create_device(
            client,
            headers,
            category="motion_sensor",
            external_id="cmd-sensor-1",
            name="Motion Sensor Cmd",
        )

        invalid_cmd = client.post(
            f"/smart/devices/{sensor_id}/commands",
            headers=headers,
            json={"command_type": "power_on", "payload": {}},
        )
        assert invalid_cmd.status_code == 400


def test_device_command_forbidden_for_operator():
    with TestClient(app) as client:
        owner_headers = _headers(username="owner", role="owner", tenant_id="default")
        operator_headers = _headers(username="operator", role="operator", tenant_id="default")
        relay_id = _create_device(
            client,
            owner_headers,
            category="smart_relay",
            external_id="cmd-relay-op-1",
            name="Relay For Operator Test",
        )

        response = client.post(
            f"/smart/devices/{relay_id}/commands",
            headers=operator_headers,
            json={"command_type": "power_off", "payload": {}},
        )
        assert response.status_code == 403


def test_device_command_tenant_isolation():
    with TestClient(app) as client:
        headers_tenant_a = _headers(username="owner-a", role="owner", tenant_id="tenant_a")
        headers_tenant_b = _headers(username="owner-b", role="owner", tenant_id="tenant_b")
        relay_id = _create_device(
            client,
            headers_tenant_a,
            category="smart_relay",
            external_id="cmd-tenant-a-1",
            name="Tenant A Relay",
        )

        cmd = client.post(
            f"/smart/devices/{relay_id}/commands",
            headers=headers_tenant_a,
            json={"command_type": "power_on", "payload": {}},
        )
        assert cmd.status_code == 200
        command_id = cmd.json()["id"]

        get_foreign = client.get(
            f"/smart/devices/{relay_id}/commands/{command_id}",
            headers=headers_tenant_b,
        )
        assert get_foreign.status_code == 404
