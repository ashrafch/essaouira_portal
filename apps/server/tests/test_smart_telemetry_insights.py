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
            "external_id": f"telemetry-{uuid.uuid4().hex[:8]}",
            "name": "Telemetry Sensor",
            "category": "temperature_humidity_sensor",
            "unit_id": unit_id,
        },
    )
    assert response.status_code == 200
    return response.json()


def test_telemetry_insight_generation_dedup_and_resolution():
    with TestClient(app) as client:
        units = client.get("/units", headers=_headers()).json()
        unit_id = units[0]["id"]
        device = _create_device(client, unit_id)

        abnormal = client.put(
            f"/smart/devices/{device['id']}/state",
            headers=_headers(),
            json={
                "online": True,
                "temperature_c": 35,
                "humidity_pct": 40,
                "energy_w": 10,
                "raw_payload_json": "{\"battery_level\": 80}",
            },
        )
        assert abnormal.status_code == 200

        duplicate_abnormal = client.put(
            f"/smart/devices/{device['id']}/state",
            headers=_headers(),
            json={
                "online": True,
                "temperature_c": 36,
                "humidity_pct": 42,
                "energy_w": 11,
                "raw_payload_json": "{\"battery_level\": 79}",
            },
        )
        assert duplicate_abnormal.status_code == 200

        open_insights = client.get(
            "/smart/telemetry-insights",
            headers=_headers(),
            params={"device_id": device["id"], "insight_type": "telemetry.temperature_abnormal", "status": "open"},
        )
        # device_id filter not supported on endpoint, keep compatibility by filtering client-side
        assert open_insights.status_code == 200
        open_rows = [row for row in open_insights.json() if row["device_id"] == device["id"] and row["insight_type"] == "telemetry.temperature_abnormal"]
        assert len(open_rows) == 1

        normalized = client.put(
            f"/smart/devices/{device['id']}/state",
            headers=_headers(),
            json={
                "online": True,
                "temperature_c": 24,
                "humidity_pct": 45,
                "energy_w": 9,
                "raw_payload_json": "{\"battery_level\": 78}",
            },
        )
        assert normalized.status_code == 200

        reopened = client.get(
            "/smart/telemetry-insights",
            headers=_headers(),
            params={"insight_type": "telemetry.temperature_abnormal", "status": "open"},
        )
        assert reopened.status_code == 200
        reopened_rows = [row for row in reopened.json() if row["device_id"] == device["id"]]
        assert reopened_rows == []

        resolved = client.get(
            "/smart/telemetry-insights",
            headers=_headers(),
            params={"insight_type": "telemetry.temperature_abnormal", "status": "resolved"},
        )
        assert resolved.status_code == 200
        resolved_rows = [row for row in resolved.json() if row["device_id"] == device["id"]]
        assert resolved_rows


def test_telemetry_energy_spike_and_not_reporting_insights():
    with TestClient(app) as client:
        units = client.get("/units", headers=_headers()).json()
        unit_id = units[0]["id"]
        device = _create_device(client, unit_id)

        for power in [10, 12, 11, 13, 12]:
            response = client.put(
                f"/smart/devices/{device['id']}/state",
                headers=_headers(),
                json={"online": True, "temperature_c": 22, "humidity_pct": 40, "energy_w": power},
            )
            assert response.status_code == 200

        spike = client.put(
            f"/smart/devices/{device['id']}/state",
            headers=_headers(),
            json={"online": True, "temperature_c": 23, "humidity_pct": 41, "energy_w": 40},
        )
        assert spike.status_code == 200

        spike_rows = client.get(
            "/smart/telemetry-insights",
            headers=_headers(),
            params={"insight_type": "telemetry.energy_spike", "status": "open"},
        )
        assert spike_rows.status_code == 200
        assert any(row["device_id"] == device["id"] for row in spike_rows.json())

        no_telemetry_device = _create_device(client, unit_id)
        not_reporting_rows = client.get(
            "/smart/telemetry-insights",
            headers=_headers(),
            params={"insight_type": "telemetry.device_not_reporting", "status": "open"},
        )
        assert not_reporting_rows.status_code == 200
        assert any(row["device_id"] == no_telemetry_device["id"] for row in not_reporting_rows.json())


def test_telemetry_insights_tenant_isolation():
    with TestClient(app) as client:
        units = client.get("/units", headers=_headers()).json()
        unit_id = units[0]["id"]
        device = _create_device(client, unit_id)

        response = client.put(
            f"/smart/devices/{device['id']}/state",
            headers=_headers(),
            json={"online": True, "temperature_c": 34, "humidity_pct": 90, "energy_w": 14},
        )
        assert response.status_code == 200

        default_rows = client.get("/smart/telemetry-insights", headers=_headers())
        assert default_rows.status_code == 200
        assert any(row["device_id"] == device["id"] for row in default_rows.json())

        other_tenant_rows = client.get("/smart/telemetry-insights", headers=_headers(tenant_id="other"))
        assert other_tenant_rows.status_code == 200
        assert other_tenant_rows.json() == []
