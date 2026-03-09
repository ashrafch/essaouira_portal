import os
from unittest.mock import patch

from fastapi.testclient import TestClient

from app.core.auth import create_access_token
from app.main import app


def _headers(username: str = "owner", role: str = "owner", tenant_id: str = "default"):
    token = create_access_token(username, role=role, tenant_id=tenant_id)
    return {"Authorization": f"Bearer {token}"}


def _ha_entity_states():
    return [
        {
            "entity_id": "switch.unit_a_lamp",
            "state": "off",
            "attributes": {
                "friendly_name": "Unit A Lamp",
                "device_class": "switch",
                "manufacturer": "Shelly",
                "model": "Plus1",
                "battery_level": 88,
            },
            "last_changed": "2026-03-09T09:00:00+00:00",
        },
        {
            "entity_id": "climate.unit_a_hvac",
            "state": "cool",
            "attributes": {
                "friendly_name": "Unit A HVAC",
                "current_temperature": 23.5,
                "current_humidity": 41,
                "manufacturer": "Daikin",
                "model": "AC-01",
            },
            "last_changed": "2026-03-09T09:01:00+00:00",
        },
    ]


def test_home_assistant_sync_and_command_mapping():
    calls: list[tuple[str, str]] = []

    def _fake_request(self, method: str, path: str, payload=None):  # noqa: ANN001
        calls.append((method, path))
        if method == "GET" and path == "/api/states":
            return _ha_entity_states()
        if method == "POST" and path == "/api/services/switch/turn_on":
            assert isinstance(payload, dict)
            assert payload.get("entity_id") == "switch.unit_a_lamp"
            return [{"context": {"id": "ha-cmd-1"}}]
        raise AssertionError(f"Unexpected HA API call: {method} {path}")

    with patch.dict(
        os.environ,
        {
            "SMART_PROVIDER_MODE": "home_assistant",
            "HOME_ASSISTANT_URL": "http://ha.local:8123",
            "HOME_ASSISTANT_TOKEN": "test-token",
        },
        clear=False,
    ):
        with patch(
            "app.domains.smart_building.providers.home_assistant.HomeAssistantProvider._request_json",
            autospec=True,
            side_effect=_fake_request,
        ):
            with TestClient(app) as client:
                headers = _headers()
                sync = client.post("/smart/providers/sync?provider=home_assistant", headers=headers)
                assert sync.status_code == 200
                data = sync.json()
                assert data["provider_name"] == "home_assistant"
                assert (data["imported_devices"] + data["updated_devices"]) >= 1
                assert data["synced_states"] >= 1

                devices = client.get("/smart/devices", headers=headers)
                assert devices.status_code == 200
                ha_devices = [d for d in devices.json() if d["provider"] == "home_assistant"]
                assert len(ha_devices) >= 1
                relay = next(d for d in ha_devices if d["external_id"] == "switch.unit_a_lamp")

                command = client.post(
                    f"/smart/devices/{relay['id']}/commands",
                    headers=headers,
                    json={"command_type": "device.power.on", "payload": {}},
                )
                assert command.status_code == 200
                command_data = command.json()
                assert command_data["provider"] == "home_assistant"
                assert command_data["status"] == "executed"
                assert command_data["provider_ref"] == "ha-cmd-1"

                other_tenant_devices = client.get("/smart/devices", headers=_headers(tenant_id="other"))
                assert other_tenant_devices.status_code == 200
                assert [d for d in other_tenant_devices.json() if d["provider"] == "home_assistant"] == []

    assert ("GET", "/api/states") in calls
    assert ("POST", "/api/services/switch/turn_on") in calls


def test_home_assistant_webhook_updates_state_and_emits_event():
    def _fake_request(self, method: str, path: str, payload=None):  # noqa: ANN001
        if method == "GET" and path == "/api/states":
            return _ha_entity_states()
        raise AssertionError(f"Unexpected HA API call: {method} {path}")

    with patch.dict(
        os.environ,
        {
            "SMART_PROVIDER_MODE": "home_assistant",
            "HOME_ASSISTANT_URL": "http://ha.local:8123",
            "HOME_ASSISTANT_TOKEN": "test-token",
        },
        clear=False,
    ):
        with patch(
            "app.domains.smart_building.providers.home_assistant.HomeAssistantProvider._request_json",
            autospec=True,
            side_effect=_fake_request,
        ):
            with TestClient(app) as client:
                headers = _headers()
                sync = client.post("/smart/providers/sync?provider=home_assistant", headers=headers)
                assert sync.status_code == 200

                devices = client.get("/smart/devices", headers=headers).json()
                relay = next(d for d in devices if d["provider"] == "home_assistant" and d["external_id"] == "switch.unit_a_lamp")

                webhook = client.post(
                    "/smart/providers/home_assistant/webhook",
                    headers=headers,
                    json={
                        "payload": {
                            "event": {
                                "event_type": "state_changed",
                                "data": {
                                    "entity_id": "switch.unit_a_lamp",
                                    "new_state": {
                                        "entity_id": "switch.unit_a_lamp",
                                        "state": "on",
                                        "attributes": {"friendly_name": "Unit A Lamp"},
                                    },
                                },
                            }
                        }
                    },
                )
                assert webhook.status_code == 200
                webhook_payload = webhook.json()
                assert webhook_payload["accepted"] is True
                assert webhook_payload["event_id"] is not None

                state = client.get(f"/smart/devices/{relay['id']}/state", headers=headers)
                assert state.status_code == 200
                assert state.json()["power_state"] == "on"

                events = client.get(f"/smart/events?device_id={relay['id']}&limit=20", headers=headers)
                assert events.status_code == 200
                event_types = {item["event_type"] for item in events.json()}
                assert "provider.webhook.ingested" in event_types


def test_home_assistant_poll_updates_device_state():
    def _fake_request(self, method: str, path: str, payload=None):  # noqa: ANN001
        if method == "GET" and path == "/api/states":
            return _ha_entity_states()
        if method == "GET" and path == "/api/states/switch.unit_a_lamp":
            return {
                "entity_id": "switch.unit_a_lamp",
                "state": "on",
                "attributes": {"friendly_name": "Unit A Lamp", "battery_level": 87},
                "last_changed": "2026-03-09T10:15:00+00:00",
            }
        if method == "GET" and path == "/api/states/climate.unit_a_hvac":
            return {
                "entity_id": "climate.unit_a_hvac",
                "state": "cool",
                "attributes": {
                    "friendly_name": "Unit A HVAC",
                    "current_temperature": 22.0,
                    "current_humidity": 45,
                },
                "last_changed": "2026-03-09T10:15:00+00:00",
            }
        raise AssertionError(f"Unexpected HA API call: {method} {path}")

    with patch.dict(
        os.environ,
        {
            "SMART_PROVIDER_MODE": "home_assistant",
            "HOME_ASSISTANT_URL": "http://ha.local:8123",
            "HOME_ASSISTANT_TOKEN": "test-token",
        },
        clear=False,
    ):
        with patch(
            "app.domains.smart_building.providers.home_assistant.HomeAssistantProvider._request_json",
            autospec=True,
            side_effect=_fake_request,
        ):
            with TestClient(app) as client:
                headers = _headers()
                sync = client.post("/smart/providers/sync?provider=home_assistant", headers=headers)
                assert sync.status_code == 200

                poll = client.post("/smart/providers/poll?provider=home_assistant", headers=headers)
                assert poll.status_code == 200
                poll_payload = poll.json()
                assert poll_payload["provider_name"] == "home_assistant"
                assert poll_payload["polled_devices"] >= 2
                assert poll_payload["updated_states"] >= 2

                devices = client.get("/smart/devices", headers=headers).json()
                relay = next(d for d in devices if d["provider"] == "home_assistant" and d["external_id"] == "switch.unit_a_lamp")
                state = client.get(f"/smart/devices/{relay['id']}/state", headers=headers)
                assert state.status_code == 200
                assert state.json()["power_state"] == "on"
