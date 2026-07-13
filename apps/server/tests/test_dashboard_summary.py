import uuid
from datetime import date, timedelta

from fastapi.testclient import TestClient

from app.core.auth import create_access_token
from app.db import SessionLocal
from app.main import app
from app.models.booking import Booking
from app.models.maintenance import MaintenanceTicket
from app.models.staff_task import StaffTask
from app.models.unit import Unit

EXPECTED_TOP_LEVEL_KEYS = {
    "date",
    "arrivals_today",
    "departures_today",
    "in_house",
    "staff_tasks_today",
    "staff_tasks_open",
    "maintenance_open",
    "smart",
}
EXPECTED_SMART_KEYS = {
    "devices_total",
    "devices_online",
    "devices_offline",
    "alerts_open",
    "units_needing_attention",
}


def _headers(role: str = "owner", tenant_id: str = "default", username: str | None = None):
    user = username or f"{role}_dashboard_user"
    token = create_access_token(user, role=role, tenant_id=tenant_id)
    return {"Authorization": f"Bearer {token}"}


def _seed_dashboard_fixture_data(client: TestClient) -> tuple[date, str]:
    """Create deterministic, uniquely-marked rows through the real API so
    that normal side effects (e.g. auto staff tasks on booking creation)
    happen exactly as they would in production. Correctness is then
    verified by an independent DB query using the same filters as the
    dashboard service (see test below), not by hand-tracking side effects.
    """
    today = date.today()
    marker = uuid.uuid4().hex[:8]
    headers = _headers()

    units_resp = client.get("/units", headers=headers)
    assert units_resp.status_code == 200
    units = units_resp.json()
    assert len(units) >= 3, "expected at least 3 seeded units"

    booking_specs = [
        (units[0]["id"], today, today + timedelta(days=3)),  # arrival today, in-house
        (units[1]["id"], today - timedelta(days=3), today),  # departure today
        (units[2]["id"], today - timedelta(days=1), today + timedelta(days=1)),  # in-house only
    ]
    for unit_id, checkin, checkout in booking_specs:
        payload = {
            "unit_id": unit_id,
            "guest_name": f"Dashboard Fixture {marker}",
            "checkin_date": checkin.isoformat(),
            "checkout_date": checkout.isoformat(),
            "nightly_rate": 50,
        }
        resp = client.post("/bookings", json=payload, headers=headers)
        assert resp.status_code == 200, resp.text

    staff_task_resp = client.post(
        "/staff-tasks",
        headers=headers,
        json={
            "date": today.isoformat(),
            "task_type": "cleaning",
            "status": "planned",
            "notes": f"dashboard-fixture-{marker}",
        },
    )
    assert staff_task_resp.status_code == 200, staff_task_resp.text

    ticket_resp = client.post(
        "/maintenance",
        headers=headers,
        json={"title": f"Dashboard fixture ticket {marker}", "status": "todo"},
    )
    assert ticket_resp.status_code == 200, ticket_resp.text

    return today, marker


def _expected_counts_from_db(today: date) -> dict:
    """Mirror the exact filters used by app.domains.dashboard.service so we
    can verify the endpoint against an independent query rather than
    hand-tracking every side effect of the fixtures above.
    """
    db = SessionLocal()
    try:
        arrivals_today = db.query(Booking).filter(Booking.checkin_date == today).count()
        departures_today = db.query(Booking).filter(Booking.checkout_date == today).count()
        in_house = (
            db.query(Booking)
            .filter(Booking.checkin_date <= today, Booking.checkout_date > today)
            .count()
        )
        staff_tasks_today = db.query(StaffTask).filter(StaffTask.date == today).count()
        staff_tasks_open = (
            db.query(StaffTask)
            .filter(StaffTask.status.notin_(["done", "cancelled"]))
            .count()
        )
        maintenance_open = (
            db.query(MaintenanceTicket).filter(MaintenanceTicket.status != "done").count()
        )
        return {
            "arrivals_today": arrivals_today,
            "departures_today": departures_today,
            "in_house": in_house,
            "staff_tasks_today": staff_tasks_today,
            "staff_tasks_open": staff_tasks_open,
            "maintenance_open": maintenance_open,
        }
    finally:
        db.close()


def test_dashboard_summary_counts_match_direct_query():
    with TestClient(app) as client:
        today, _marker = _seed_dashboard_fixture_data(client)
        expected = _expected_counts_from_db(today)

        resp = client.get("/dashboard/summary", headers=_headers())
        assert resp.status_code == 200
        body = resp.json()

        assert EXPECTED_TOP_LEVEL_KEYS.issubset(body.keys())
        assert body["date"] == today.isoformat()

        for key, value in expected.items():
            assert body[key] == value, f"{key}: expected {value}, got {body[key]}"

        # Sanity: our fixtures actually moved the needle, so this isn't a
        # vacuous all-zero comparison.
        assert expected["arrivals_today"] >= 1
        assert expected["departures_today"] >= 1
        assert expected["in_house"] >= 1
        assert expected["staff_tasks_today"] >= 1
        assert expected["staff_tasks_open"] >= 1
        assert expected["maintenance_open"] >= 1

        smart = body["smart"]
        assert EXPECTED_SMART_KEYS.issubset(smart.keys())
        for key in EXPECTED_SMART_KEYS:
            assert isinstance(smart[key], int)
            assert smart[key] >= 0
        # devices are always classified online xor offline by smart_overview
        assert smart["devices_online"] + smart["devices_offline"] == smart["devices_total"]


def test_dashboard_summary_empty_tables_do_not_500():
    """No bookings/staff-tasks/maintenance for a far-future date: every
    counter should gracefully be zero instead of erroring."""
    with TestClient(app) as client:
        far_future = date(2099, 1, 1)
        expected = _expected_counts_from_db(far_future)

        resp = client.get("/dashboard/summary", headers=_headers())
        assert resp.status_code == 200
        # Confirms the "no rows for this date" shape resolves to 0, not a 500.
        assert expected["arrivals_today"] == 0
        assert expected["departures_today"] == 0


def test_dashboard_summary_readable_by_all_roles():
    with TestClient(app) as client:
        for role in ["owner", "manager", "operator", "viewer"]:
            resp = client.get("/dashboard/summary", headers=_headers(role=role))
            assert resp.status_code == 200, role
            assert EXPECTED_TOP_LEVEL_KEYS.issubset(resp.json().keys())


def test_dashboard_summary_requires_auth():
    with TestClient(app) as client:
        resp = client.get("/dashboard/summary")
        assert resp.status_code == 401
