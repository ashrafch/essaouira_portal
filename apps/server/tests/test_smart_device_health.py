from datetime import datetime, timedelta, timezone
import uuid

from fastapi.testclient import TestClient

from app.core.auth import create_access_token
from app.db import SessionLocal
from app.main import app
from app.models.smart_building import Device


def _headers(username: str = "owner", role: str = "owner", tenant_id: str = "default"):
    token = create_access_token(username, role=role, tenant_id=tenant_id)
    return {"Authorization": f"Bearer {token}"}


def _create_device(client: TestClient, unit_id: int | None = None) -> int:
    external_id = f"health-{uuid.uuid4().hex[:10]}"
    payload = {
        "provider": "mock",
        "external_id": external_id,
        "name": f"Health Device {external_id[-4:]}",
        "category": "smart_relay",
        "unit_id": unit_id,
    }
    res = client.post("/smart/devices", headers=_headers(), json=payload)
    assert res.status_code == 200
    return res.json()["id"]


def test_device_health_offline_detection_by_last_seen_timeout():
    with TestClient(app) as client:
        unit_id = client.get("/units", headers=_headers()).json()[0]["id"]
        device_id = _create_device(client, unit_id=unit_id)

        upsert = client.put(
            f"/smart/devices/{device_id}/state",
            headers=_headers(),
            json={
                "online": True,
                "power_state": "on",
                "signal_rssi": -60,
                "raw_payload_json": "{\"battery_level\": 75}",
            },
        )
        assert upsert.status_code == 200

        db = SessionLocal()
        try:
            device = db.query(Device).filter(Device.id == device_id).first()
            assert device is not None
            device.last_seen_at = datetime.now(timezone.utc) - timedelta(hours=2)
            db.commit()
        finally:
            db.close()

        health = client.get(f"/smart/devices/{device_id}/health", headers=_headers())
        assert health.status_code == 200
        data = health.json()
        assert data["connectivity_status"] == "offline"
        assert data["health_status"] == "critical"


def test_device_health_aggregation_per_unit_and_property():
    with TestClient(app) as client:
        unit_id = client.get("/units", headers=_headers()).json()[0]["id"]
        online_device = _create_device(client, unit_id=unit_id)
        offline_device = _create_device(client, unit_id=unit_id)

        upsert_online = client.put(
            f"/smart/devices/{online_device}/state",
            headers=_headers(),
            json={
                "online": True,
                "power_state": "on",
                "signal_rssi": -55,
                "raw_payload_json": "{\"battery_level\": 81}",
            },
        )
        assert upsert_online.status_code == 200

        upsert_offline = client.put(
            f"/smart/devices/{offline_device}/state",
            headers=_headers(),
            json={
                "online": False,
                "power_state": "off",
                "signal_rssi": -90,
                "raw_payload_json": "{\"battery_level\": 9}",
            },
        )
        assert upsert_offline.status_code == 200

        unit_health = client.get(f"/smart/units/{unit_id}/device-health", headers=_headers())
        assert unit_health.status_code == 200
        summary = unit_health.json()["summary"]
        assert summary["total_devices"] >= 2
        assert summary["offline_devices"] >= 1
        assert summary["critical_devices"] >= 1

        property_health = client.get("/smart/device-health", headers=_headers())
        assert property_health.status_code == 200
        property_summary = property_health.json()["property_summary"]
        assert property_summary["total_devices"] >= summary["total_devices"]
        assert property_summary["critical_devices"] >= 1


def test_device_health_tenant_isolation():
    with TestClient(app) as client:
        unit_id = client.get("/units", headers=_headers()).json()[0]["id"]
        _ = _create_device(client, unit_id=unit_id)

        own = client.get("/smart/device-health", headers=_headers())
        assert own.status_code == 200
        assert own.json()["property_summary"]["total_devices"] >= 1

        other = client.get("/smart/device-health", headers=_headers(tenant_id="other"))
        assert other.status_code == 200
        assert other.json()["property_summary"]["total_devices"] == 0
        assert other.json()["devices"] == []
