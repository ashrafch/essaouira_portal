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
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


def _first_unit_id(client: TestClient, headers) -> int:
    resp = client.get("/units", headers=headers)
    assert resp.status_code == 200
    return resp.json()[0]["id"]


def test_rate_calendar_defaults_to_base_then_stores_manual_override():
    with TestClient(app) as client:
        headers = _login_headers(client)
        unit_id = _first_unit_id(client, headers)

        # Empty far-future range → every day falls back to the base rate, unstored.
        empty = client.get(
            f"/revenue/rate-calendar?unit_id={unit_id}"
            "&from_date=2027-05-01&to_date=2027-05-04",
            headers=headers,
        )
        assert empty.status_code == 200
        days = empty.json()["days"]
        assert len(days) == 3
        assert all(d["is_stored"] is False for d in days)
        assert all(d["price_source"] == "base" for d in days)

        # Manual upsert marks the days as overrides.
        put = client.put(
            "/revenue/rate-calendar",
            json={
                "unit_id": unit_id,
                "entries": [
                    {"date": "2027-05-01", "price": 150, "min_stay": 2},
                    {"date": "2027-05-02", "price": 160},
                ],
            },
            headers=headers,
        )
        assert put.status_code == 200

        stored = client.get(
            f"/revenue/rate-calendar?unit_id={unit_id}"
            "&from_date=2027-05-01&to_date=2027-05-03",
            headers=headers,
        )
        by_date = {d["date"]: d for d in stored.json()["days"]}
        assert by_date["2027-05-01"]["price"] == 150
        assert by_date["2027-05-01"]["min_stay"] == 2
        assert by_date["2027-05-01"]["is_override"] is True
        assert by_date["2027-05-01"]["price_source"] == "manual"
        assert by_date["2027-05-02"]["price"] == 160


def test_booking_uses_rate_calendar_when_no_nightly_rate():
    with TestClient(app) as client:
        headers = _login_headers(client)
        unit_id = _first_unit_id(client, headers)

        client.put(
            "/revenue/rate-calendar",
            json={
                "unit_id": unit_id,
                "entries": [
                    {"date": "2027-06-10", "price": 100},
                    {"date": "2027-06-11", "price": 120},
                    {"date": "2027-06-12", "price": 130},
                ],
            },
            headers=headers,
        )

        # Clear any leftover booking on the same slot.
        for b in client.get("/bookings", headers=headers).json():
            if b["unit_id"] == unit_id and b["checkin_date"] == "2027-06-10":
                client.delete(f"/bookings/{b['id']}", headers=headers)

        payload = {
            "unit_id": unit_id,
            "guest_name": "Rate Calendar Test",
            "source": "direct",
            "checkin_date": "2027-06-10",
            "checkout_date": "2027-06-13",  # 3 nights: 100 + 120 + 130
            "currency": "EUR",
        }
        resp = client.post("/bookings", json=payload, headers=headers)
        assert resp.status_code == 200
        body = resp.json()
        assert float(body["total_price"]) == 350.0
        assert abs(float(body["nightly_rate"]) - 116.67) < 0.02
        assert body["status"] == "confirmed"

        client.delete(f"/bookings/{body['id']}", headers=headers)


def test_recommendations_preview_and_apply():
    with TestClient(app) as client:
        headers = _login_headers(client)
        unit_id = _first_unit_id(client, headers)

        # Guarantee a base rate for a deterministic recommendation.
        client.put(
            f"/units/{unit_id}",
            json={"base_nightly_rate": 100, "currency": "EUR"},
            headers=headers,
        )

        rec = client.get(
            f"/revenue/recommendations?unit_id={unit_id}"
            "&from_date=2027-07-01&to_date=2027-07-08",
            headers=headers,
        )
        assert rec.status_code == 200
        recs = rec.json()["recommendations"]
        assert len(recs) == 7
        assert all(r["base_price"] == 100 for r in recs)
        # 2027-07-02 is a Friday → weekend premium keeps it at/above base.
        friday = next(r for r in recs if r["date"] == "2027-07-02")
        assert friday["recommended_price"] >= 100

        applied = client.post(
            "/revenue/recommendations/apply",
            json={
                "unit_id": unit_id,
                "from_date": "2027-07-01",
                "to_date": "2027-07-08",
            },
            headers=headers,
        )
        assert applied.status_code == 200
        assert applied.json()["applied"] == 7

        cal = client.get(
            f"/revenue/rate-calendar?unit_id={unit_id}"
            "&from_date=2027-07-01&to_date=2027-07-08",
            headers=headers,
        )
        days = cal.json()["days"]
        assert all(d["is_stored"] for d in days)
        assert all(d["price_source"] == "reco" for d in days)


def test_manual_override_is_not_overwritten_by_apply():
    with TestClient(app) as client:
        headers = _login_headers(client)
        unit_id = _first_unit_id(client, headers)

        client.put(
            f"/units/{unit_id}",
            json={"base_nightly_rate": 100, "currency": "EUR"},
            headers=headers,
        )
        # Manual override on one day.
        client.put(
            "/revenue/rate-calendar",
            json={
                "unit_id": unit_id,
                "entries": [{"date": "2027-08-05", "price": 999}],
            },
            headers=headers,
        )

        applied = client.post(
            "/revenue/recommendations/apply",
            json={
                "unit_id": unit_id,
                "from_date": "2027-08-01",
                "to_date": "2027-08-08",
            },
            headers=headers,
        )
        assert applied.status_code == 200
        assert applied.json()["skipped_overrides"] == 1

        cal = client.get(
            f"/revenue/rate-calendar?unit_id={unit_id}"
            "&from_date=2027-08-05&to_date=2027-08-06",
            headers=headers,
        )
        day = cal.json()["days"][0]
        assert day["price"] == 999
        assert day["price_source"] == "manual"


def test_min_stay_enforced_at_booking_time():
    with TestClient(app) as client:
        headers = _login_headers(client)
        unit_id = _first_unit_id(client, headers)

        # 3-night minimum on the arrival date.
        client.put(
            "/revenue/rate-calendar",
            json={
                "unit_id": unit_id,
                "entries": [{"date": "2027-10-10", "price": 100, "min_stay": 3}],
            },
            headers=headers,
        )
        for b in client.get("/bookings", headers=headers).json():
            if b["unit_id"] == unit_id and b["checkin_date"] == "2027-10-10":
                client.delete(f"/bookings/{b['id']}", headers=headers)

        base = {
            "unit_id": unit_id,
            "guest_name": "Min Stay",
            "source": "direct",
            "checkin_date": "2027-10-10",
            "currency": "EUR",
        }
        too_short = client.post(
            "/bookings", json={**base, "checkout_date": "2027-10-12"}, headers=headers
        )
        assert too_short.status_code == 400
        assert "minimo" in too_short.text.lower()

        ok = client.post(
            "/bookings", json={**base, "checkout_date": "2027-10-13"}, headers=headers
        )
        assert ok.status_code == 200
        client.delete(f"/bookings/{ok.json()['id']}", headers=headers)


def test_recommendations_clamped_to_price_band():
    with TestClient(app) as client:
        headers = _login_headers(client)
        unit_id = _first_unit_id(client, headers)

        client.put(
            f"/units/{unit_id}",
            json={
                "base_nightly_rate": 100,
                "min_price": 90,
                "max_price": 105,
                "currency": "EUR",
            },
            headers=headers,
        )

        rec = client.get(
            f"/revenue/recommendations?unit_id={unit_id}"
            "&from_date=2027-11-01&to_date=2027-11-30",
            headers=headers,
        )
        assert rec.status_code == 200
        recs = rec.json()["recommendations"]
        assert recs
        assert all(90 <= r["recommended_price"] <= 105 for r in recs)
