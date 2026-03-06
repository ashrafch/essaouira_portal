from datetime import date, timedelta
from uuid import uuid4

from fastapi.testclient import TestClient

from app.core.auth import create_access_token
from app.main import app


def _headers(username: str = "owner", role: str = "owner", tenant_id: str = "default"):
    token = create_access_token(username, role=role, tenant_id=tenant_id)
    return {"Authorization": f"Bearer {token}"}


def _first_unit_id(client: TestClient, headers: dict[str, str]) -> int:
    units = client.get("/units", headers=headers)
    assert units.status_code == 200
    payload = units.json()
    assert payload
    return payload[0]["id"]


def _create_booking(
    client: TestClient,
    headers: dict[str, str],
    unit_id: int,
    day_offset: int,
) -> int:
    checkin = date.today() + timedelta(days=day_offset)
    checkout = checkin + timedelta(days=2)
    guest_suffix = uuid4().hex[:8]
    created = client.post(
        "/bookings",
        headers=headers,
        json={
            "unit_id": unit_id,
            "guest_name": "Bridge Test",
            "guest_email": f"bridge-{guest_suffix}@example.com",
            "guest_phone": "+3900000001",
            "num_adults": 2,
            "num_children": 0,
            "estimated_arrival_time": "15:00",
            "source": "direct",
            "checkin_date": checkin.isoformat(),
            "checkout_date": checkout.isoformat(),
            "notes": "bridge",
            "nightly_rate": 100,
            "total_price": 200,
            "cleaning_fee": 10,
            "city_tax": 2,
            "channel_fee": 0,
            "currency": "EUR",
            "is_paid": False,
            "has_late_checkout": False,
        },
    )
    assert created.status_code == 200
    return created.json()["id"]


def _update_task_status(client: TestClient, headers: dict[str, str], task: dict, status: str, notes: str):
    payload = {
        "date": task["date"],
        "time": task["time"],
        "task_type": task["task_type"],
        "assignee_name": task["assignee_name"],
        "estimated_hours": task["estimated_hours"],
        "status": status,
        "notes": notes,
        "cost": task["cost"],
        "currency": task["currency"],
        "booking_id": task["booking_id"],
        "unit_id": task["unit_id"],
    }
    return client.put(f"/staff-tasks/{task['id']}", headers=headers, json=payload)


def test_checkin_completion_transition_triggers_smart_rule_once():
    with TestClient(app) as client:
        headers = _headers()
        unit_id = _first_unit_id(client, headers)

        rule = client.post(
            "/smart/automation-rules",
            headers=headers,
            json={
                "name": "On checkin complete",
                "trigger_type": "booking.checked_in",
                "action_type": "create_alert",
                "target_unit_id": unit_id,
                "payload": {
                    "alert_type": "automation_alert",
                    "severity": "warning",
                    "title": "Checkin completed smart reaction",
                },
                "is_active": True,
            },
        )
        assert rule.status_code == 200
        rule_id = rule.json()["id"]

        booking_id = _create_booking(client, headers, unit_id, day_offset=200)

        tasks = client.get("/staff-tasks", headers=headers)
        assert tasks.status_code == 200
        checkin_task = next(
            t for t in tasks.json() if t["booking_id"] == booking_id and t["task_type"] == "checkin"
        )

        complete = _update_task_status(client, headers, checkin_task, "done", "completed")
        assert complete.status_code == 200

        execs_after_first = client.get(
            f"/smart/automation-executions?rule_id={rule_id}", headers=headers
        )
        assert execs_after_first.status_code == 200
        executions = execs_after_first.json()
        assert len(executions) >= 1
        assert executions[0]["trigger_type"] == "booking.checked_in"
        assert executions[0]["trigger_source"] == "auto.ops.staff.task"

        alerts = client.get("/smart/alerts?status=open", headers=headers)
        assert alerts.status_code == 200
        initial_count = len(
            [a for a in alerts.json() if a["title"] == "Checkin completed smart reaction"]
        )
        assert initial_count >= 1

        second = _update_task_status(
            client,
            headers,
            {**checkin_task, **complete.json()},
            "done",
            "edit after completion",
        )
        assert second.status_code == 200

        execs_after_second = client.get(
            f"/smart/automation-executions?rule_id={rule_id}", headers=headers
        )
        assert execs_after_second.status_code == 200
        assert len(execs_after_second.json()) == len(executions)

        alerts_after_second = client.get("/smart/alerts?status=open", headers=headers)
        assert alerts_after_second.status_code == 200
        second_count = len(
            [a for a in alerts_after_second.json() if a["title"] == "Checkin completed smart reaction"]
        )
        assert second_count == initial_count


def test_generic_task_update_does_not_trigger_checkout_reaction_until_done():
    with TestClient(app) as client:
        headers = _headers()
        unit_id = _first_unit_id(client, headers)

        rule = client.post(
            "/smart/automation-rules",
            headers=headers,
            json={
                "name": "On checkout complete",
                "trigger_type": "booking.checked_out",
                "action_type": "create_alert",
                "target_unit_id": unit_id,
                "payload": {
                    "alert_type": "automation_alert",
                    "severity": "warning",
                    "title": "Checkout completed smart reaction",
                },
                "is_active": True,
            },
        )
        assert rule.status_code == 200
        rule_id = rule.json()["id"]

        booking_id = _create_booking(client, headers, unit_id, day_offset=260)

        tasks = client.get("/staff-tasks", headers=headers)
        assert tasks.status_code == 200
        checkout_task = next(
            t for t in tasks.json() if t["booking_id"] == booking_id and t["task_type"] == "checkout"
        )

        progress = _update_task_status(client, headers, checkout_task, "in_progress", "progress")
        assert progress.status_code == 200

        execs_before_done = client.get(
            f"/smart/automation-executions?rule_id={rule_id}", headers=headers
        )
        assert execs_before_done.status_code == 200
        assert len(execs_before_done.json()) == 0

        done = _update_task_status(client, headers, {**checkout_task, **progress.json()}, "done", "done")
        assert done.status_code == 200

        execs_after_done = client.get(
            f"/smart/automation-executions?rule_id={rule_id}", headers=headers
        )
        assert execs_after_done.status_code == 200
        assert len(execs_after_done.json()) >= 1


def test_alert_raised_reaction_triggers_rule_action():
    with TestClient(app) as client:
        headers = _headers()
        unit_id = _first_unit_id(client, headers)

        rule = client.post(
            "/smart/automation-rules",
            headers=headers,
            json={
                "name": "On smart alert raised",
                "trigger_type": "alert.raised",
                "action_type": "create_maintenance_ticket",
                "target_unit_id": unit_id,
                "payload": {
                    "title": "Auto maintenance from smart alert",
                    "description": "created by orchestration bridge",
                    "priority": "medium",
                },
                "is_active": True,
            },
        )
        assert rule.status_code == 200
        rule_id = rule.json()["id"]

        created_alert = client.post(
            "/smart/alerts",
            headers=headers,
            json={
                "unit_id": unit_id,
                "alert_type": "battery_low",
                "severity": "warning",
                "title": "Battery low event",
            },
        )
        assert created_alert.status_code == 200

        execs = client.get(f"/smart/automation-executions?rule_id={rule_id}", headers=headers)
        assert execs.status_code == 200
        payload = execs.json()
        assert len(payload) >= 1
        assert payload[0]["trigger_type"] == "alert.raised"

        maintenance = client.get("/maintenance", headers=headers)
        assert maintenance.status_code == 200
        assert any(t["title"] == "Auto maintenance from smart alert" for t in maintenance.json())
