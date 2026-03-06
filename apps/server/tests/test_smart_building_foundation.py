from fastapi.testclient import TestClient

from app.core.auth import create_access_token
from app.main import app


def _headers(username: str = "owner", role: str = "owner", tenant_id: str = "default"):
    token = create_access_token(username, role=role, tenant_id=tenant_id)
    return {"Authorization": f"Bearer {token}"}


def test_smart_device_foundation_flow():
    with TestClient(app) as client:
        headers = _headers()
        units = client.get("/units", headers=headers)
        assert units.status_code == 200
        unit_id = units.json()[0]["id"]

        create_device = client.post(
            "/smart/devices",
            headers=headers,
            json={
                "unit_id": unit_id,
                "zone_name": "Unit A - Living",
                "provider": "mock",
                "external_id": "mock-device-001",
                "name": "Sensore soggiorno",
                "category": "temperature_humidity_sensor",
                "model": "MockTH-1",
                "manufacturer": "Mock Inc",
                "is_active": True,
                "health_status": "healthy",
                "battery_level": 95,
            },
        )
        assert create_device.status_code == 200
        device_id = create_device.json()["id"]

        list_devices = client.get("/smart/devices", headers=headers)
        assert list_devices.status_code == 200
        assert any(d["id"] == device_id for d in list_devices.json())

        update_state = client.put(
            f"/smart/devices/{device_id}/state",
            headers=headers,
            json={
                "online": True,
                "power_state": "on",
                "temperature_c": 24.5,
                "humidity_pct": 51.2,
                "signal_rssi": -61,
            },
        )
        assert update_state.status_code == 200
        assert update_state.json()["online"] is True

        sync = client.post(f"/smart/devices/{device_id}/simulate-sync", headers=headers)
        assert sync.status_code == 200

        events = client.get("/smart/events", headers=headers)
        assert events.status_code == 200
        assert len(events.json()) >= 1

        overview = client.get("/smart/overview", headers=headers)
        assert overview.status_code == 200
        assert overview.json()["total_devices"] >= 1


def test_smart_tenant_isolation():
    with TestClient(app) as client:
        headers_tenant_a = _headers(username="owner-a", role="owner", tenant_id="tenant_a")
        headers_tenant_b = _headers(username="owner-b", role="owner", tenant_id="tenant_b")

        create_in_a = client.post(
            "/smart/devices",
            headers=headers_tenant_a,
            json={
                "provider": "mock",
                "external_id": "tenant-a-device",
                "name": "Device A",
                "category": "motion_sensor",
                "is_active": True,
                "health_status": "unknown",
            },
        )
        assert create_in_a.status_code == 200
        device_id = create_in_a.json()["id"]

        list_in_b = client.get("/smart/devices", headers=headers_tenant_b)
        assert list_in_b.status_code == 200
        assert all(d["id"] != device_id for d in list_in_b.json())

        get_in_b = client.get(f"/smart/devices/{device_id}", headers=headers_tenant_b)
        assert get_in_b.status_code == 404


def test_smart_write_forbidden_for_operator():
    with TestClient(app) as client:
        operator_headers = _headers(username="operator", role="operator", tenant_id="default")
        response = client.post(
            "/smart/devices",
            headers=operator_headers,
            json={
                "provider": "mock",
                "external_id": "op-device",
                "name": "Op Device",
                "category": "relay",
                "is_active": True,
                "health_status": "unknown",
            },
        )
        assert response.status_code == 403

