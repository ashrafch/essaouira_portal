import os
from datetime import date

os.environ.setdefault("DATABASE_URL", "sqlite:///./test.db")
os.environ.setdefault("AUTH_ENABLED", "true")
os.environ.setdefault("AUTH_SECRET_KEY", "test-secret")
os.environ.setdefault("ADMIN_USERNAME", "owner")
os.environ.setdefault("ADMIN_PASSWORD", "owner123")
os.environ.setdefault("AUTO_CREATE_SCHEMA", "true")
os.environ.setdefault("AUTO_SEED_DATA", "true")

from fastapi.testclient import TestClient

from app.db import get_db
from app.domains.revenue import alerts as alerts_mod
from app.main import app


def _login_headers(client: TestClient):
    r = client.post("/auth/login", json={"username": "owner", "password": "owner123"})
    assert r.status_code == 200
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def _first_unit_id(client: TestClient, headers) -> int:
    return client.get("/units", headers=headers).json()[0]["id"]


def _compute(reference_date: date, horizon_days: int = 60) -> list:
    gen = get_db()
    db = next(gen)
    try:
        return alerts_mod.compute_pricing_alerts(
            db, horizon_days=horizon_days, reference_date=reference_date
        )
    finally:
        gen.close()


def test_market_rate_crud():
    with TestClient(app) as client:
        headers = _login_headers(client)
        created = client.post(
            "/revenue/market-rates",
            json={
                "label": "Villa comparabile",
                "nightly_rate": 180,
                "start_date": "2028-01-01",
                "end_date": "2028-01-31",
            },
            headers=headers,
        )
        assert created.status_code == 200
        rate_id = created.json()["id"]

        listed = client.get("/revenue/market-rates", headers=headers)
        assert listed.status_code == 200
        assert any(r["id"] == rate_id for r in listed.json())

        assert client.delete(f"/revenue/market-rates/{rate_id}", headers=headers).status_code == 204


def test_out_of_band_alert_below_market():
    with TestClient(app) as client:
        headers = _login_headers(client)
        unit_id = _first_unit_id(client, headers)
        client.put(
            f"/units/{unit_id}",
            json={"base_nightly_rate": 100, "currency": "EUR"},
            headers=headers,
        )
        rate = client.post(
            "/revenue/market-rates",
            json={
                "label": "Mercato zona",
                "nightly_rate": 300,
                "start_date": "2028-01-01",
                "end_date": "2028-01-31",
                "unit_id": unit_id,
            },
            headers=headers,
        )
        rate_id = rate.json()["id"]

        alerts = _compute(date(2028, 1, 1))
        below = [
            a
            for a in alerts
            if a["code"] == "price_below_market" and a["unit_id"] == unit_id
        ]
        assert below and below[0]["count"] > 0

        client.delete(f"/revenue/market-rates/{rate_id}", headers=headers)


def test_orphan_and_low_occupancy_alerts():
    with TestClient(app) as client:
        headers = _login_headers(client)
        unit_id = _first_unit_id(client, headers)

        for b in client.get("/bookings", headers=headers).json():
            if b["unit_id"] == unit_id and b["checkin_date"] in (
                "2028-06-05",
                "2028-06-08",
            ):
                client.delete(f"/bookings/{b['id']}", headers=headers)

        a = client.post(
            "/bookings",
            json={
                "unit_id": unit_id,
                "guest_name": "A",
                "source": "direct",
                "checkin_date": "2028-06-05",
                "checkout_date": "2028-06-07",
                "currency": "EUR",
            },
            headers=headers,
        )
        b = client.post(
            "/bookings",
            json={
                "unit_id": unit_id,
                "guest_name": "B",
                "source": "direct",
                "checkin_date": "2028-06-08",
                "checkout_date": "2028-06-10",
                "currency": "EUR",
            },
            headers=headers,
        )
        assert a.status_code == 200 and b.status_code == 200

        alerts = _compute(date(2028, 6, 1))
        orphan = [
            x for x in alerts if x["code"] == "orphan_nights" and x["unit_id"] == unit_id
        ]
        assert orphan and orphan[0]["count"] >= 1

        # No near-term bookings for a far reference date → low forward occupancy.
        far = _compute(date(2028, 9, 1))
        assert any(x["code"] == "low_forward_occupancy" for x in far)

        client.delete(f"/bookings/{a.json()['id']}", headers=headers)
        client.delete(f"/bookings/{b.json()['id']}", headers=headers)


def test_sync_all_reports_errors_for_unreachable_url():
    with TestClient(app) as client:
        headers = _login_headers(client)
        unit_id = _first_unit_id(client, headers)
        conn = client.post(
            "/revenue/channels",
            json={
                "unit_id": unit_id,
                "channel": "other",
                "ical_import_url": "http://127.0.0.1:9/none.ics",
            },
            headers=headers,
        )
        conn_id = conn.json()["id"]

        res = client.post("/revenue/channels/sync-all", headers=headers)
        assert res.status_code == 200
        body = res.json()
        assert body["errors"] >= 1
        assert any(r["status"] == "error" for r in body["results"])

        client.delete(f"/revenue/channels/{conn_id}", headers=headers)


def test_push_prices_is_simulated():
    with TestClient(app) as client:
        headers = _login_headers(client)
        unit_id = _first_unit_id(client, headers)
        conn = client.post(
            "/revenue/channels",
            json={"unit_id": unit_id, "channel": "airbnb"},
            headers=headers,
        )
        conn_id = conn.json()["id"]

        res = client.post(
            f"/revenue/channels/{conn_id}/push-prices"
            "?from_date=2028-01-01&to_date=2028-01-05",
            headers=headers,
        )
        assert res.status_code == 200
        body = res.json()
        assert body["simulated"] is True
        assert body["status"] == "simulated"

        client.delete(f"/revenue/channels/{conn_id}", headers=headers)
