from fastapi.testclient import TestClient

from app.core.auth import create_access_token
from app.main import app


def _headers(username: str = "owner", role: str = "owner", tenant_id: str = "default"):
    token = create_access_token(username, role=role, tenant_id=tenant_id)
    return {"Authorization": f"Bearer {token}"}


def _get_first_unit_id(client: TestClient, headers: dict[str, str]) -> int:
    units_res = client.get("/units", headers=headers)
    assert units_res.status_code == 200
    units = units_res.json()
    assert len(units) >= 1
    return units[0]["id"]


def test_smart_unit_timeline_aggregates_smart_and_ops_events():
    with TestClient(app) as client:
        headers = _headers()
        unit_id = _get_first_unit_id(client, headers)

        booking_res = client.post(
            "/bookings",
            headers=headers,
            json={
                "unit_id": unit_id,
                "guest_name": "Timeline Guest",
                "guest_email": "timeline@example.com",
                "guest_phone": "+39000000000",
                "num_adults": 2,
                "num_children": 0,
                "estimated_arrival_time": "16:30",
                "source": "direct",
                "checkin_date": "2026-09-10",
                "checkout_date": "2026-09-12",
                "notes": "Timeline test booking",
                "nightly_rate": 100,
                "total_price": 200,
                "cleaning_fee": 10,
                "city_tax": 4,
                "channel_fee": 0,
                "currency": "EUR",
                "is_paid": False,
                "has_late_checkout": False,
            },
        )
        assert booking_res.status_code == 200
        booking_id = booking_res.json()["id"]

        task_res = client.post(
            "/staff-tasks",
            headers=headers,
            json={
                "date": "2026-09-11",
                "time": "10:00",
                "task_type": "cleaning",
                "assignee_name": "Fatima",
                "estimated_hours": 1.5,
                "status": "planned",
                "notes": "Pulizia deep",
                "cost": 15,
                "currency": "EUR",
                "booking_id": booking_id,
                "unit_id": unit_id,
            },
        )
        assert task_res.status_code == 200
        task_id = task_res.json()["id"]

        maintenance_res = client.post(
            "/maintenance",
            headers=headers,
            json={
                "title": "Timeline maintenance ticket",
                "description": "Verifica condizionatore",
                "unit_id": unit_id,
                "status": "in_progress",
                "priority": "medium",
                "ticket_type": "repair",
                "cost": 20,
                "currency": "EUR",
            },
        )
        assert maintenance_res.status_code == 200
        maintenance_id = maintenance_res.json()["id"]

        device_res = client.post(
            "/smart/devices",
            headers=headers,
            json={
                "unit_id": unit_id,
                "provider": "mock",
                "external_id": "timeline-relay-1",
                "name": "Timeline Relay",
                "category": "smart_relay",
                "is_active": True,
                "health_status": "healthy",
            },
        )
        assert device_res.status_code == 200
        device_id = device_res.json()["id"]

        command_res = client.post(
            f"/smart/devices/{device_id}/commands",
            headers=headers,
            json={"command_type": "power_on", "payload": {}},
        )
        assert command_res.status_code == 200
        command_id = command_res.json()["id"]

        alert_res = client.post(
            "/smart/alerts",
            headers=headers,
            json={
                "unit_id": unit_id,
                "device_id": device_id,
                "alert_type": "battery_low",
                "severity": "warning",
                "title": "Timeline smart alert",
                "description": "Sotto soglia batteria",
            },
        )
        assert alert_res.status_code == 200
        alert_id = alert_res.json()["id"]

        timeline_res = client.get(
            f"/smart/units/{unit_id}/timeline?limit=120",
            headers=headers,
        )
        assert timeline_res.status_code == 200
        payload = timeline_res.json()

        assert payload["unit"]["id"] == unit_id
        assert payload["limit"] == 120
        assert isinstance(payload["has_more"], bool)
        assert isinstance(payload["items"], list)
        assert len(payload["items"]) >= 1

        items = payload["items"]
        assert any(item["source"].startswith("smart.event") for item in items)
        assert any(item["source"] == "smart.alert" and item.get("alert_id") == alert_id for item in items)
        assert any(item["source"].startswith("smart.command") and item.get("command_id") == command_id for item in items)
        assert any(item["source"] == "pms.booking" and item.get("booking_id") == booking_id for item in items)
        assert any(item["source"] == "ops.staff_task" and item.get("task_id") == task_id for item in items)
        assert any(item["source"] == "ops.maintenance" and item.get("maintenance_id") == maintenance_id for item in items)

        first_before = payload.get("next_before")
        if payload["has_more"] and first_before:
            older_res = client.get(
                f"/smart/units/{unit_id}/timeline?limit=20&before={first_before}",
                headers=headers,
            )
            assert older_res.status_code == 200


def test_smart_unit_timeline_tenant_isolated():
    with TestClient(app) as client:
        owner_default = _headers(username="owner-default", role="owner", tenant_id="default")
        owner_foreign = _headers(username="owner-foreign", role="owner", tenant_id="tenant_x")
        unit_id = _get_first_unit_id(client, owner_default)

        res = client.get(f"/smart/units/{unit_id}/timeline", headers=owner_foreign)
        assert res.status_code == 404
