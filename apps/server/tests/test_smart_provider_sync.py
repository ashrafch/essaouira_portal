from fastapi.testclient import TestClient

from app.core.auth import create_access_token
from app.main import app


def _headers(username: str = "owner", role: str = "owner", tenant_id: str = "default"):
    token = create_access_token(username, role=role, tenant_id=tenant_id)
    return {"Authorization": f"Bearer {token}"}


def test_provider_debug_and_catalog_sync_idempotent():
    with TestClient(app) as client:
        headers = _headers()

        debug = client.get("/smart/providers/debug?provider=mock", headers=headers)
        assert debug.status_code == 200
        payload = debug.json()
        assert payload["provider_name"] == "mock"
        assert payload["supports_catalog_sync"] is True
        assert payload["supports_webhook_ingest"] is True

        first_sync = client.post("/smart/providers/sync?provider=mock", headers=headers)
        assert first_sync.status_code == 200
        first_data = first_sync.json()
        assert (first_data["imported_devices"] + first_data["updated_devices"]) >= 1
        assert first_data["synced_states"] >= 1

        second_sync = client.post("/smart/providers/sync?provider=mock", headers=headers)
        assert second_sync.status_code == 200
        second_data = second_sync.json()
        assert second_data["imported_devices"] == 0
        assert second_data["updated_devices"] >= 1

        devices = client.get("/smart/devices", headers=headers)
        assert devices.status_code == 200
        assert len(devices.json()) >= 1


def test_provider_webhook_placeholder_ingestion():
    with TestClient(app) as client:
        headers = _headers()

        sync = client.post("/smart/providers/sync?provider=mock", headers=headers)
        assert sync.status_code == 200

        devices = client.get("/smart/devices", headers=headers).json()
        mock_devices = [d for d in devices if d.get("provider") == "mock"]
        assert len(mock_devices) >= 1
        target = mock_devices[0]

        ingest = client.post(
            "/smart/providers/mock/webhook",
            headers=headers,
            json={
                "payload": {
                    "external_id": target["external_id"],
                    "event_type": "contact_opened",
                    "severity": "warning",
                    "payload": {"opened": True},
                }
            },
        )
        assert ingest.status_code == 200
        ingest_payload = ingest.json()
        assert ingest_payload["accepted"] is True
        assert ingest_payload["event_id"] is not None

        invalid = client.post(
            "/smart/providers/mock/webhook",
            headers=headers,
            json={"payload": {"event_type": "missing_external_id"}},
        )
        assert invalid.status_code == 200
        assert invalid.json()["accepted"] is False

