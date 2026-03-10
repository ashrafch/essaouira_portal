import uuid

from fastapi.testclient import TestClient

from app.core.auth import create_access_token
from app.main import app


def _headers(username: str = "owner", role: str = "owner", tenant_id: str = "default"):
    token = create_access_token(username, role=role, tenant_id=tenant_id)
    return {"Authorization": f"Bearer {token}"}


def _create_device(client: TestClient, unit_id: int):
    response = client.post(
        "/smart/devices",
        headers=_headers(),
        json={
            "provider": "mock",
            "external_id": f"freshness-{uuid.uuid4().hex[:8]}",
            "name": "Freshness Device",
            "category": "temperature_humidity_sensor",
            "unit_id": unit_id,
        },
    )
    assert response.status_code == 200
    return response.json()


def test_devices_and_alerts_include_freshness_fields():
    with TestClient(app) as client:
        units = client.get("/units", headers=_headers()).json()
        unit_id = units[0]["id"]
        device = _create_device(client, unit_id)
        state_res = client.put(
            f"/smart/devices/{device['id']}/state",
            headers=_headers(),
            json={"online": True, "temperature_c": 22, "humidity_pct": 40},
        )
        assert state_res.status_code == 200

        alert_res = client.post(
            "/smart/alerts",
            headers=_headers(),
            json={
                "unit_id": unit_id,
                "device_id": device["id"],
                "alert_type": "custom.alert",
                "severity": "warning",
                "title": "Freshness Alert",
                "description": "freshness test",
            },
        )
        assert alert_res.status_code == 200

        devices = client.get("/smart/devices?include_freshness=true", headers=_headers())
        assert devices.status_code == 200
        device_rows = [row for row in devices.json() if row["id"] == device["id"]]
        assert device_rows
        assert device_rows[0]["last_updated_at"] is not None
        assert device_rows[0]["data_freshness_status"] in {"fresh", "stale", "offline"}

        alerts = client.get("/smart/alerts?include_freshness=true", headers=_headers())
        assert alerts.status_code == 200
        alert_rows = [row for row in alerts.json() if row["title"] == "Freshness Alert"]
        assert alert_rows
        assert alert_rows[0]["last_updated_at"] is not None
        assert alert_rows[0]["data_freshness_status"] in {"fresh", "stale", "offline"}


def test_telemetry_and_views_expose_freshness():
    with TestClient(app) as client:
        units = client.get("/units", headers=_headers()).json()
        unit_id = units[0]["id"]
        device = _create_device(client, unit_id)

        put_res = client.put(
            f"/smart/devices/{device['id']}/state",
            headers=_headers(),
            json={"online": True, "temperature_c": 23, "humidity_pct": 41, "energy_w": 9},
        )
        assert put_res.status_code == 200

        telemetry = client.get(f"/smart/telemetry/device/{device['id']}", headers=_headers())
        assert telemetry.status_code == 200
        telemetry_payload = telemetry.json()
        assert "last_updated_at" in telemetry_payload
        assert telemetry_payload["data_freshness_status"] in {"fresh", "stale", "offline"}

        dashboard = client.get("/smart/dashboard", headers=_headers())
        assert dashboard.status_code == 200
        assert dashboard.json()["last_updated_at"] is not None
        assert dashboard.json()["data_freshness_status"] in {"fresh", "stale", "offline"}

        operations = client.get("/smart/operations", headers=_headers())
        assert operations.status_code == 200
        assert operations.json()["last_updated_at"] is not None
        assert operations.json()["data_freshness_status"] in {"fresh", "stale", "offline"}

        unit_detail = client.get(f"/smart/units/{unit_id}", headers=_headers())
        assert unit_detail.status_code == 200
        assert unit_detail.json()["last_updated_at"] is not None
        assert unit_detail.json()["data_freshness_status"] in {"fresh", "stale", "offline"}
