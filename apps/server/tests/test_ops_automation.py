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


def test_message_template_render_and_send_now():
    with TestClient(app) as client:
        headers = _headers()
        tmpl = client.post(
            "/message-templates",
            headers=headers,
            json={
                "name": "WA checkin",
                "trigger_type": "checkin",
                "offset_hours": -24,
                "channel": "whatsapp",
                "subject": "Promemoria {{checkin_date_it}}",
                "body": "Ciao {{guest_name}}, arrivo {{checkin_date_it}} in {{unit_name}}",
                "is_active": True,
            },
        )
        assert tmpl.status_code == 200
        tmpl_id = tmpl.json()["id"]

        units = client.get("/units", headers=headers).json()
        unit_id = units[0]["id"]

        booking = client.post(
            "/bookings",
            headers=headers,
            json={
                "unit_id": unit_id,
                "guest_name": "Render User",
                "guest_email": "render@example.com",
                "guest_phone": "+212600000010",
                "num_adults": 2,
                "num_children": 0,
                "estimated_arrival_time": "16:00",
                "source": "direct",
                "checkin_date": "2026-06-20",
                "checkout_date": "2026-06-23",
                "notes": "",
                "nightly_rate": 100,
                "total_price": 300,
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

        rendered = client.post(
            "/message-templates/render",
            headers=headers,
            json={
                "booking_id": booking_id,
                "template_id": tmpl_id,
                "channel": "whatsapp",
            },
        )
        assert rendered.status_code == 200
        render_payload = rendered.json()
        assert "Render User" in render_payload["body"]
        assert render_payload["whatsapp_url"].startswith("https://wa.me/")

        sent_now = client.post(
            "/messages/send-now",
            headers=headers,
            json={
                "booking_id": booking_id,
                "template_id": tmpl_id,
                "channel": "whatsapp",
                "body_override": "Messaggio personalizzato",
            },
        )
        assert sent_now.status_code == 200
        assert "Messaggio personalizzato" in sent_now.json()["body"]


def test_dispatch_scheduled_message_job():
    with TestClient(app) as client:
        headers = _headers()
        tmpl = client.post(
            "/message-templates",
            headers=headers,
            json={
                "name": "Dispatch checkin",
                "trigger_type": "checkin",
                "offset_hours": -24,
                "channel": "email",
                "subject": "Dispatch",
                "body": "Hi {{guest_name}}",
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
                "guest_name": "Dispatch User",
                "guest_email": "dispatch@example.com",
                "guest_phone": "+212600000011",
                "num_adults": 2,
                "num_children": 0,
                "estimated_arrival_time": "15:30",
                "source": "direct",
                "checkin_date": "2026-07-10",
                "checkout_date": "2026-07-12",
                "notes": "",
                "nightly_rate": 110,
                "total_price": 220,
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
        booking_job = next((j for j in jobs.json() if j["booking_id"] == booking_id), None)
        assert booking_job is not None

        dispatched = client.post(f"/message-jobs/{booking_job['id']}/dispatch", headers=headers)
        assert dispatched.status_code == 200

        sent_jobs = client.get("/message-jobs?status=sent", headers=headers)
        assert sent_jobs.status_code == 200
        assert any(j["id"] == booking_job["id"] for j in sent_jobs.json())
