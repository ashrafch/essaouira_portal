from datetime import date, timedelta

from fastapi.testclient import TestClient

from app.core.auth import create_access_token
from app.main import app


def _headers(username: str = "owner", role: str = "owner", tenant_id: str = "default"):
    token = create_access_token(username, role=role, tenant_id=tenant_id)
    return {"Authorization": f"Bearer {token}"}


def test_channel_connections_and_channel_performance():
    with TestClient(app) as client:
        headers = _headers()

        create_connection = client.post(
            "/channel-connections",
            headers=headers,
            json={
                "channel": "airbnb",
                "listing_external_id": "AIR-UNIT-A",
                "commission_percent": 15,
                "payout_delay_days": 1,
                "is_active": True,
                "sync_enabled": True,
                "notes": "phase3",
            },
        )
        assert create_connection.status_code == 200
        connection_id = create_connection.json()["id"]

        update_connection = client.put(
            f"/channel-connections/{connection_id}",
            headers=headers,
            json={
                "channel": "airbnb",
                "listing_external_id": "AIR-UNIT-A-UPDATED",
                "commission_percent": 14,
                "payout_delay_days": 2,
                "is_active": True,
                "sync_enabled": True,
                "notes": "updated",
                "last_sync_status": "ok",
                "last_sync_at": "2026-01-01T10:00:00Z",
            },
        )
        assert update_connection.status_code == 200
        assert update_connection.json()["commission_percent"] == 14

        units = client.get("/units", headers=headers).json()
        booking = client.post(
            "/bookings",
            headers=headers,
            json={
                "unit_id": units[0]["id"],
                "guest_name": "Channel Test",
                "guest_email": "channel.test@example.com",
                "guest_phone": "+212600000004",
                "num_adults": 2,
                "num_children": 0,
                "estimated_arrival_time": "15:00",
                "source": "airbnb",
                "checkin_date": "2026-06-10",
                "checkout_date": "2026-06-13",
                "notes": "",
                "nightly_rate": 100,
                "total_price": 300,
                "cleaning_fee": 20,
                "city_tax": 9,
                "channel_fee": 0,
                "currency": "EUR",
                "is_paid": False,
                "has_late_checkout": False,
            },
        )
        assert booking.status_code == 200

        performance = client.get(
            "/analytics/channel-performance?year=2026&month=6",
            headers=headers,
        )
        assert performance.status_code == 200
        airbnb = [row for row in performance.json() if row["channel"] == "airbnb"]
        assert len(airbnb) == 1
        assert airbnb[0]["bookings_count"] >= 1
        assert airbnb[0]["gross_revenue"] >= 300
        assert airbnb[0]["channel_fees"] > 0


def test_revenue_rules_and_rate_recommendations():
    with TestClient(app) as client:
        headers = _headers()

        create_rule = client.post(
            "/revenue-rules",
            headers=headers,
            json={
                "name": "High demand",
                "is_active": True,
                "priority": 10,
                "min_occupancy_percent": 0,
                "max_occupancy_percent": 100,
                "min_lead_days": 0,
                "max_lead_days": 365,
                "adjustment_percent": 20,
                "min_price": None,
                "max_price": None,
                "notes": "phase3",
            },
        )
        assert create_rule.status_code == 200
        rule_id = create_rule.json()["id"]

        update_rule = client.put(
            f"/revenue-rules/{rule_id}",
            headers=headers,
            json={
                "name": "High demand v2",
                "is_active": True,
                "priority": 10,
                "min_occupancy_percent": 0,
                "max_occupancy_percent": 100,
                "min_lead_days": 0,
                "max_lead_days": 365,
                "adjustment_percent": 25,
                "min_price": None,
                "max_price": None,
                "notes": "updated",
            },
        )
        assert update_rule.status_code == 200
        assert update_rule.json()["adjustment_percent"] == 25

        units = client.get("/units", headers=headers).json()
        target_day = date.today() + timedelta(days=7)
        to_day = target_day + timedelta(days=2)
        rates = client.get(
            f"/revenue/rate-recommendations?from_date={target_day.isoformat()}&to_date={to_day.isoformat()}&unit_id={units[0]['id']}",
            headers=headers,
        )
        assert rates.status_code == 200
        items = rates.json()
        assert len(items) == 2
        assert items[0]["applied_rule_name"] == "High demand v2"
        assert items[0]["suggested_rate"] >= items[0]["base_rate"]

