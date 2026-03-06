from fastapi.testclient import TestClient

from app.core.auth import create_access_token
from app.main import app


def _headers(role: str, tenant_id: str = "default", username: str | None = None):
    user = username or f"{role}_user"
    token = create_access_token(user, role=role, tenant_id=tenant_id)
    return {"Authorization": f"Bearer {token}"}


def test_manager_cannot_access_owner_only_users_endpoint():
    with TestClient(app) as client:
        resp = client.get("/users", headers=_headers("manager"))
        assert resp.status_code == 403


def test_operator_cannot_write_staff_members_or_pricing_defaults():
    with TestClient(app) as client:
        staff_member_resp = client.post(
            "/staff-members",
            headers=_headers("operator"),
            json={
                "name": "No Access Operator",
                "role": "housekeeping",
                "color_hex": "#0f766e",
                "hourly_cost": 5,
                "is_active": True,
            },
        )
        assert staff_member_resp.status_code == 403

        pricing_resp = client.put(
            "/pricing-defaults",
            headers=_headers("operator"),
            json={
                "default_cleaning_fee": 10,
                "default_city_tax_per_night": 1,
                "default_channel_fee_percent": 5,
                "default_currency": "EUR",
            },
        )
        assert pricing_resp.status_code == 403


def test_operator_can_write_staff_tasks():
    with TestClient(app) as client:
        create_resp = client.post(
            "/staff-tasks",
            headers=_headers("operator"),
            json={
                "date": "2026-03-10",
                "time": "10:00",
                "task_type": "cleaning",
                "assignee_name": "Operatore",
                "estimated_hours": 1,
                "status": "planned",
                "notes": "RBAC operator write",
                "cost": 5,
                "currency": "EUR",
                "booking_id": None,
                "unit_id": None,
            },
        )
        assert create_resp.status_code == 200


def test_viewer_read_only_access():
    with TestClient(app) as client:
        read_resp = client.get("/bookings", headers=_headers("viewer"))
        assert read_resp.status_code == 200

        write_resp = client.post(
            "/bookings",
            headers=_headers("viewer"),
            json={
                "unit_id": 1,
                "guest_name": "Viewer No Write",
                "guest_email": "viewer@example.com",
                "guest_phone": "+39000111",
                "num_adults": 2,
                "num_children": 0,
                "estimated_arrival_time": "15:00",
                "source": "direct",
                "checkin_date": "2026-03-20",
                "checkout_date": "2026-03-22",
                "notes": "",
                "nightly_rate": 100,
                "total_price": 200,
                "cleaning_fee": 10,
                "city_tax": 3,
                "channel_fee": 0,
                "currency": "EUR",
                "is_paid": False,
                "has_late_checkout": False,
            },
        )
        assert write_resp.status_code == 403
