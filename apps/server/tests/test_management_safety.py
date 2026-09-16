"""Local API/SQL regressions. No provider transport is contacted."""

from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from app.core.auth import create_access_token
from app.db import SessionLocal
from app.main import app
from app.models.booking import Booking
from app.models.staff_task import StaffTask
from app.models.unit import Unit


@pytest.fixture
def management():
    with TestClient(app, raise_server_exceptions=False) as client:
        with SessionLocal() as db:
            unit = Unit(name=f"Safety {uuid4().hex[:12]}", capacity=4, base_nightly_rate=100)
            db.add(unit)
            db.commit()
            unit_id = unit.id
        headers = {"Authorization": f"Bearer {create_access_token('owner')}"}
        payload = {
            "unit_id": unit_id, "guest_name": "Synthetic safety guest",
            "checkin_date": "2035-03-10", "checkout_date": "2035-03-13",
            "estimated_arrival_time": "16:30",
        }
        yield client, headers, payload


def _tasks(client, headers, booking_id):
    response = client.get("/staff-tasks", headers=headers)
    assert response.status_code == 200
    return [task for task in response.json() if task["booking_id"] == booking_id]


@pytest.mark.parametrize("status", ["pending", "hold", "cancelled"])
def test_non_confirmed_booking_does_not_schedule_staff(management, status):
    client, headers, payload = management
    response = client.post("/bookings", headers=headers, json={**payload, "status": status})
    assert response.status_code == 200
    assert _tasks(client, headers, response.json()["id"]) == []
    overlap = client.post("/bookings", headers=headers, json=payload)
    assert overlap.status_code == (200 if status == "cancelled" else 400)


def test_cancellation_releases_dates_and_preserves_completed_work(management, monkeypatch):
    client, headers, payload = management
    monkeypatch.setattr("app.domains.operations.router.trigger_smart_reaction_on_staff_task_completion", lambda *a, **kw: None)
    booking = client.post("/bookings", headers=headers, json=payload).json()
    tasks = _tasks(client, headers, booking["id"])
    checkin = next(t for t in tasks if t["task_type"] == "checkin")
    assert checkin["is_automatic"] is True
    assert checkin["transition_locked"] is False
    assert checkin["time"] == "16:30"
    complete = client.put(f"/staff-tasks/{checkin['id']}", headers=headers, json={**checkin, "status": "done", "assignee_name": "Assigned operator"})
    assert complete.status_code == 200
    assert complete.json()["transition_locked"] is True
    updated = client.put(f"/bookings/{booking['id']}", headers=headers, json={**booking, "notes": "Financial edit", "is_paid": True})
    assert updated.status_code == 200
    preserved = _tasks(client, headers, booking["id"])
    assert {t["id"] for t in preserved} == {t["id"] for t in tasks}
    assert next(t for t in preserved if t["id"] == checkin["id"])["status"] == "done"
    cancelled = client.put(f"/bookings/{booking['id']}", headers=headers, json={**booking, "status": "cancelled"})
    assert cancelled.status_code == 200
    after = _tasks(client, headers, booking["id"])
    assert all(t["status"] == ("done" if t["id"] == checkin["id"] else "cancelled") for t in after)
    assert next(t for t in after if t["id"] == checkin["id"])["assignee_name"] == "Assigned operator"
    replacement = client.post("/bookings", headers=headers, json=payload)
    assert replacement.status_code == 200
    reactivated = client.put(f"/bookings/{booking['id']}", headers=headers, json=booking)
    assert reactivated.status_code == 400
    schedule = client.get(f"/units/{payload['unit_id']}/schedule?from_date=2035-03-01&to_date=2035-04-01", headers=headers).json()
    assert [b["id"] for b in schedule["bookings"]] == [replacement.json()["id"]]


def test_reschedule_keeps_task_ids_and_late_checkout_schedule(management):
    client, headers, payload = management
    booking = client.post("/bookings", headers=headers, json=payload).json()
    original = _tasks(client, headers, booking["id"])
    updated = client.put(f"/bookings/{booking['id']}", headers=headers, json={**booking, "checkin_date": "2035-03-11", "checkout_date": "2035-03-15", "has_late_checkout": True})
    assert updated.status_code == 200
    after = _tasks(client, headers, booking["id"])
    for kind in ("checkin", "checkout"):
        assert next(t for t in original if t["task_type"] == kind)["id"] == next(t for t in after if t["task_type"] == kind)["id"]
    checkout = next(t for t in after if t["task_type"] == "checkout")
    assert (checkout["date"], checkout["time"]) == ("2035-03-15", "16:00")
    assert {t["time"] for t in after if t["task_type"] == "cleaning" and t["status"] == "planned"} == {"17:00", "19:00"}
    assert client.put(f"/bookings/{booking['id']}", headers=headers, json=updated.json()).status_code == 200
    assert {t["id"] for t in _tasks(client, headers, booking["id"])} == {t["id"] for t in after}


@pytest.mark.parametrize("change,status", [
    ({"status": "CONFIRMED"}, 422), ({"status": "nonsense"}, 422),
    ({"checkout_date": "2035-03-10"}, 400), ({"num_adults": 0}, 422),
    ({"total_price": -1}, 422),
])
def test_invalid_booking_is_rejected_without_writes(management, change, status):
    client, headers, payload = management
    response = client.post("/bookings", headers=headers, json={**payload, **change})
    assert response.status_code == status
    with SessionLocal() as db:
        assert db.query(Booking).filter(Booking.unit_id == payload["unit_id"]).count() == 0


def test_zero_price_and_back_to_back_stays(management):
    client, headers, payload = management
    first = client.post("/bookings", headers=headers, json={**payload, "total_price": 0})
    assert first.status_code == 200
    assert first.json()["total_price"] == 0
    second = client.post("/bookings", headers=headers, json={**payload, "checkin_date": payload["checkout_date"], "checkout_date": "2035-03-15"})
    assert second.status_code == 200


def test_booking_and_task_generation_are_atomic(management, monkeypatch):
    client, headers, payload = management
    def fail(db, booking):
        raise RuntimeError("Synthetic generation failure")
    monkeypatch.setattr("app.domains.bookings.service.create_auto_staff_tasks_for_booking", fail)
    assert client.post("/bookings", headers=headers, json=payload).status_code == 500
    with SessionLocal() as db:
        assert db.query(Booking).filter(Booking.unit_id == payload["unit_id"]).count() == 0
        assert db.query(StaffTask).filter(StaffTask.unit_id == payload["unit_id"]).count() == 0


def test_completion_cannot_retarget_or_reopen_an_auto_task(management, monkeypatch):
    client, headers, payload = management
    calls = []
    monkeypatch.setattr("app.domains.smart_building.service.SmartBuildingService.trigger_rules_for_business_event", lambda self, **kw: calls.append(kw))
    booking = client.post("/bookings", headers=headers, json=payload).json()
    task = next(t for t in _tasks(client, headers, booking["id"]) if t["task_type"] == "checkin")
    assert client.put(f"/staff-tasks/{task['id']}", headers=headers, json={**task, "booking_id": None, "status": "done"}).status_code == 409
    assert client.put(f"/staff-tasks/{task['id']}", headers=headers, json={**task, "task_type": "checkout", "status": "done"}).status_code == 409
    for _ in range(2):
        assert client.put(f"/staff-tasks/{task['id']}", headers=headers, json={**task, "status": "done"}).status_code == 200
    assert len(calls) == 1
    assert client.put(f"/staff-tasks/{task['id']}", headers=headers, json=task).status_code == 409


def test_manual_auto_note_does_not_authorize_smart_dispatch(management, monkeypatch):
    client, headers, payload = management
    calls = []
    monkeypatch.setattr("app.domains.smart_building.service.SmartBuildingService.trigger_rules_for_business_event", lambda self, **kw: calls.append(kw))
    booking = client.post("/bookings", headers=headers, json=payload).json()
    task = client.post("/staff-tasks", headers=headers, json={
        "date": payload["checkin_date"], "task_type": "checkin", "booking_id": booking["id"],
        "unit_id": payload["unit_id"], "notes": f"AUTO: Check-in per prenotazione #{booking['id']}",
    }).json()
    assert task["is_automatic"] is False
    assert task["transition_locked"] is False
    assert client.put(f"/staff-tasks/{task['id']}", headers=headers, json={**task, "status": "done"}).status_code == 200
    assert calls == []
