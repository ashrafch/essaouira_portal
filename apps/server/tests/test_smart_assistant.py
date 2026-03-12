from datetime import date, timedelta
import uuid

from fastapi.testclient import TestClient

from app.core.auth import create_access_token
from app.main import app


def _headers(username: str = "owner", role: str = "owner", tenant_id: str = "default"):
    token = create_access_token(username, role=role, tenant_id=tenant_id)
    return {"Authorization": f"Bearer {token}"}


def _create_property(client: TestClient, prefix: str = "Assistant"):
    response = client.post(
        "/properties",
        headers=_headers(),
        json={"name": f"{prefix} {uuid.uuid4().hex[:6]}", "timezone": "Africa/Casablanca"},
    )
    assert response.status_code == 200
    return response.json()


def _bind_unit_to_property(client: TestClient, unit_id: int, property_id: int):
    response = client.put(f"/units/{unit_id}", headers=_headers(), json={"property_id": property_id})
    assert response.status_code == 200


def _create_booking(
    client: TestClient,
    *,
    unit_id: int,
    guest_name: str,
    checkin_date: date,
    checkout_date: date,
    estimated_arrival_time: str = "15:00",
):
    for offset in range(0, 20):
        current_checkin = checkin_date + timedelta(days=offset * 7)
        current_checkout = checkout_date + timedelta(days=offset * 7)
        response = client.post(
            "/bookings",
            headers=_headers(),
            json={
                "unit_id": unit_id,
                "guest_name": guest_name,
                "guest_email": f"{guest_name.lower().replace(' ', '.')}@example.com",
                "guest_phone": "+212600000000",
                "num_adults": 2,
                "num_children": 0,
                "estimated_arrival_time": estimated_arrival_time,
                "source": "direct",
                "checkin_date": current_checkin.isoformat(),
                "checkout_date": current_checkout.isoformat(),
                "notes": "assistant test",
                "currency": "EUR",
                "is_paid": False,
                "has_late_checkout": False,
            },
        )
        if response.status_code == 200:
            return response.json()
    assert response.status_code == 200
    return response.json()


def _create_device(client: TestClient, unit_id: int, category: str, name: str):
    response = client.post(
        "/smart/devices",
        headers=_headers(),
        json={
            "provider": "mock",
            "external_id": f"{category}-{uuid.uuid4().hex[:8]}",
            "name": name,
            "category": category,
            "unit_id": unit_id,
        },
    )
    assert response.status_code == 200
    return response.json()


def _create_scene(client: TestClient, name: str):
    response = client.post(
        "/smart/scenes",
        headers=_headers(),
        json={"name": name, "description": "Assistant test scene", "is_active": True},
    )
    assert response.status_code == 200
    return response.json()


def test_checkin_assistant_projects_readiness_and_does_not_duplicate_tasks():
    with TestClient(app) as client:
        prop = _create_property(client, "Assistant Checkin")
        unit_id = client.get("/units", headers=_headers()).json()[0]["id"]
        _bind_unit_to_property(client, unit_id, prop["id"])

        today = date.today()
        booking = _create_booking(
            client,
            unit_id=unit_id,
            guest_name="Arrival Guest",
            checkin_date=today + timedelta(days=1),
            checkout_date=today + timedelta(days=4),
        )
        tasks_before = client.get(
            "/staff-tasks",
            headers=_headers(),
            params={"date": booking["checkin_date"]},
        ).json()

        device = _create_device(client, unit_id, "leak_sensor", "Checkin Leak")
        state = client.put(
            f"/smart/devices/{device['id']}/state",
            headers=_headers(),
            json={"online": False, "signal_rssi": -90, "raw_payload_json": "{\"battery_level\": 7}"},
        )
        assert state.status_code == 200
        alert = client.post(
            "/smart/alerts",
            headers=_headers(),
            json={
                "unit_id": unit_id,
                "device_id": device["id"],
                "alert_type": "leak.detected",
                "severity": "critical",
                "title": "Leak before arrival",
                "description": "assistant checkin test",
            },
        )
        assert alert.status_code == 200
        _create_scene(client, "Welcome Scene")

        response = client.get(
            "/smart/assistant/checkin",
            headers=_headers(),
            params={
                "property_id": prop["id"],
                "date_from": booking["checkin_date"],
                "date_to": booking["checkin_date"],
            },
        )
        assert response.status_code == 200
        rows = response.json()
        assert len(rows) == 1
        item = rows[0]
        assert item["booking"]["id"] == booking["id"]
        assert item["assistant_status"] == "BLOCKED"
        assert item["blocking_reasons"]
        assert any(action["action_type"] == "run_scene" for action in item["quick_actions"])
        assert any(action["action_type"] == "open_staff_tasks" for action in item["quick_actions"])

        tasks_after = client.get(
            "/staff-tasks",
            headers=_headers(),
            params={"date": booking["checkin_date"]},
        ).json()
        assert len(tasks_after) == len(tasks_before)


def test_checkout_assistant_flags_active_devices_and_supports_filters():
    with TestClient(app) as client:
        prop = _create_property(client, "Assistant Checkout")
        units = client.get("/units", headers=_headers()).json()
        unit_id = units[0]["id"]
        other_unit_id = units[1]["id"]
        _bind_unit_to_property(client, unit_id, prop["id"])
        _bind_unit_to_property(client, other_unit_id, prop["id"])

        today = date.today()
        booking = _create_booking(
            client,
            unit_id=unit_id,
            guest_name="Departure Guest",
            checkin_date=today + timedelta(days=20),
            checkout_date=today + timedelta(days=23),
            estimated_arrival_time="16:00",
        )
        _create_booking(
            client,
            unit_id=other_unit_id,
            guest_name="Other Booking",
            checkin_date=today + timedelta(days=21),
            checkout_date=today + timedelta(days=24),
            estimated_arrival_time="17:00",
        )
        device = _create_device(client, unit_id, "smart_light", "Departure Light")
        state = client.put(
            f"/smart/devices/{device['id']}/state",
            headers=_headers(),
            json={"online": True, "power_state": "on", "raw_payload_json": "{\"state\": \"on\"}"},
        )
        assert state.status_code == 200

        response = client.get(
            "/smart/assistant/checkout",
            headers=_headers(),
            params={
                "property_id": prop["id"],
                "unit_id": unit_id,
                "date_from": booking["checkout_date"],
                "date_to": booking["checkout_date"],
            },
        )
        assert response.status_code == 200
        rows = response.json()
        assert len(rows) == 1
        item = rows[0]
        assert item["booking"]["id"] == booking["id"]
        assert item["assistant_status"] in {"NEEDS_ATTENTION", "BLOCKED"}
        assert item["devices_still_active"]
        assert any(action["action_type"] == "open_unit_detail" for action in item["quick_actions"])


def test_assistant_single_booking_and_tenant_isolation():
    with TestClient(app) as client:
        prop = _create_property(client, "Assistant Isolation")
        unit_id = client.get("/units", headers=_headers()).json()[0]["id"]
        _bind_unit_to_property(client, unit_id, prop["id"])

        today = date.today()
        booking = _create_booking(
            client,
            unit_id=unit_id,
            guest_name="Isolation Guest",
            checkin_date=today + timedelta(days=2),
            checkout_date=today + timedelta(days=5),
        )
        response = client.get(
            f"/smart/assistant/checkin/{booking['id']}",
            headers=_headers(),
        )
        assert response.status_code == 200
        assert response.json()["booking"]["id"] == booking["id"]

        isolated = client.get(
            "/smart/assistant/checkin",
            headers=_headers(tenant_id="other"),
            params={"date_from": booking["checkin_date"], "date_to": booking["checkin_date"]},
        )
        assert isolated.status_code == 200
        assert isolated.json() == []

        isolated_single = client.get(
            f"/smart/assistant/checkin/{booking['id']}",
            headers=_headers(tenant_id="other"),
        )
        assert isolated_single.status_code == 404
