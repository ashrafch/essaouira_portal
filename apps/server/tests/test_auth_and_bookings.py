import os

os.environ.setdefault("DATABASE_URL", "sqlite:///./test.db")
os.environ.setdefault("AUTH_ENABLED", "true")
os.environ.setdefault("AUTH_SECRET_KEY", "test-secret")
os.environ.setdefault("ADMIN_USERNAME", "owner")
os.environ.setdefault("ADMIN_PASSWORD", "owner123")
os.environ.setdefault("AUTO_CREATE_SCHEMA", "true")
os.environ.setdefault("AUTO_SEED_DATA", "true")

from fastapi.testclient import TestClient

from app.main import app


def _login_headers(client: TestClient):
    response = client.post(
        "/auth/login",
        json={"username": "owner", "password": "owner123"},
    )
    assert response.status_code == 200
    token = response.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def test_auth_required_for_protected_routes():
    with TestClient(app) as client:
        response = client.get("/units")
        assert response.status_code == 401


def test_login_and_access_units():
    with TestClient(app) as client:
        headers = _login_headers(client)
        response = client.get("/units", headers=headers)
        assert response.status_code == 200
        assert isinstance(response.json(), list)
        assert len(response.json()) > 0


def test_booking_overlap_validation():
    with TestClient(app) as client:
        headers = _login_headers(client)
        units_resp = client.get("/units", headers=headers)
        unit_id = units_resp.json()[0]["id"]

        payload = {
            "unit_id": unit_id,
            "guest_name": "Mario Rossi",
            "guest_email": "mario@example.com",
            "guest_phone": "+39333111222",
            "num_adults": 2,
            "num_children": 0,
            "estimated_arrival_time": "15:00",
            "source": "direct",
            "checkin_date": "2026-03-10",
            "checkout_date": "2026-03-13",
            "notes": "",
            "nightly_rate": 100,
            "total_price": 300,
            "cleaning_fee": 20,
            "city_tax": 9,
            "channel_fee": 0,
            "currency": "EUR",
            "is_paid": False,
            "has_late_checkout": False,
        }

        existing = client.get("/bookings", headers=headers)
        assert existing.status_code == 200
        for booking in existing.json():
            if booking["unit_id"] == unit_id and booking["checkin_date"] == payload["checkin_date"]:
                client.delete(f"/bookings/{booking['id']}", headers=headers)

        first = client.post("/bookings", json=payload, headers=headers)
        assert first.status_code == 200

        overlap_payload = {**payload, "guest_name": "Luca Verdi"}
        second = client.post("/bookings", json=overlap_payload, headers=headers)
        assert second.status_code == 400
        assert "prenotazione" in second.text.lower()


def test_analytics_and_alerts_endpoints():
    with TestClient(app) as client:
        headers = _login_headers(client)

        kpi_resp = client.get("/analytics/advanced-kpis?year=2026&month=3", headers=headers)
        assert kpi_resp.status_code == 200
        body = kpi_resp.json()
        assert "revpar" in body
        assert "pipeline_revenue_next_30_days" in body

        alerts_resp = client.get("/alerts/today", headers=headers)
        assert alerts_resp.status_code == 200
        assert isinstance(alerts_resp.json(), list)

        csv_resp = client.get("/analytics/month-cost-lines.csv?year=2026&month=3", headers=headers)
        assert csv_resp.status_code == 200
        assert "text/csv" in csv_resp.headers.get("content-type", "")
