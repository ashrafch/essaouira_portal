from fastapi.testclient import TestClient

from app.core.auth import create_access_token
from app.main import app


def _headers(username: str = "owner", role: str = "owner", tenant_id: str = "default"):
    token = create_access_token(username, role=role, tenant_id=tenant_id)
    return {"Authorization": f"Bearer {token}"}


def test_message_template_generates_jobs_on_booking():
    with TestClient(app) as client:
        headers = _headers()
        tmpl = client.post(
            "/message-templates",
            headers=headers,
            json={
                "name": "Pre checkin",
                "trigger_type": "checkin",
                "offset_hours": -24,
                "channel": "email",
                "subject": "Benvenuto",
                "body": "Ciao {{guest_name}}",
                "is_active": True,
            },
        )
        assert tmpl.status_code == 200

        units = client.get("/units", headers=headers).json()
        unit_id = units[0]["id"]

        booking = client.post(
            "/bookings",
            headers=headers,
            json={
                "unit_id": unit_id,
                "guest_name": "Ops User",
                "guest_email": "ops@example.com",
                "guest_phone": "+212600000003",
                "num_adults": 2,
                "num_children": 0,
                "estimated_arrival_time": "15:30",
                "source": "direct",
                "checkin_date": "2026-05-10",
                "checkout_date": "2026-05-12",
                "notes": "",
                "nightly_rate": 100,
                "total_price": 200,
                "cleaning_fee": 20,
                "city_tax": 6,
                "channel_fee": 0,
                "currency": "EUR",
                "is_paid": False,
                "has_late_checkout": False,
            },
        )
        assert booking.status_code == 200
        booking_id = booking.json()["id"]

        jobs = client.get("/message-jobs?status=scheduled", headers=headers)
        assert jobs.status_code == 200
        assert any(j["booking_id"] == booking_id for j in jobs.json())


def test_housekeeping_checklist_flow():
    with TestClient(app) as client:
        headers = _headers()
        task = client.post(
            "/staff-tasks",
            headers=headers,
            json={
                "date": "2026-05-12",
                "task_type": "cleaning",
                "status": "planned",
                "currency": "EUR",
            },
        )
        assert task.status_code == 200
        task_id = task.json()["id"]

        create_item = client.post(
            f"/staff-tasks/{task_id}/checklist",
            headers=headers,
            json={"title": "Cambiare lenzuola", "notes": "camera 1"},
        )
        assert create_item.status_code == 200
        item_id = create_item.json()["id"]

        update_item = client.put(
            f"/staff-tasks/{task_id}/checklist/{item_id}",
            headers=headers,
            json={"is_done": True},
        )
        assert update_item.status_code == 200
        assert update_item.json()["is_done"] is True

        listing = client.get(f"/staff-tasks/{task_id}/checklist", headers=headers)
        assert listing.status_code == 200
        assert len(listing.json()) >= 1
