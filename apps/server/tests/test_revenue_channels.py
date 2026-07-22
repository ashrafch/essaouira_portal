import os

os.environ.setdefault("DATABASE_URL", "sqlite:///./test.db")
os.environ.setdefault("AUTH_ENABLED", "true")
os.environ.setdefault("AUTH_SECRET_KEY", "test-secret")
os.environ.setdefault("ADMIN_USERNAME", "owner")
os.environ.setdefault("ADMIN_PASSWORD", "owner123")
os.environ.setdefault("AUTO_CREATE_SCHEMA", "true")
os.environ.setdefault("AUTO_SEED_DATA", "true")

from fastapi.testclient import TestClient

from app.db import get_db
from app.domains.revenue import channels
from app.main import app
from app.models.channel_connection import ChannelConnection

SAMPLE_ICS = """BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Test//EN
BEGIN:VEVENT
UID:evt-1@test
DTSTART;VALUE=DATE:20290105
DTEND;VALUE=DATE:20290107
SUMMARY:Reserved
END:VEVENT
BEGIN:VEVENT
UID:evt-2@test
DTSTART;VALUE=DATE:20290120
DTEND;VALUE=DATE:20290122
SUMMARY:Reserved
END:VEVENT
END:VCALENDAR
"""


def _login_headers(client: TestClient):
    r = client.post("/auth/login", json={"username": "owner", "password": "owner123"})
    assert r.status_code == 200
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def _first_unit_id(client: TestClient, headers) -> int:
    return client.get("/units", headers=headers).json()[0]["id"]


def _apply(connection_id: int, ics: str) -> dict:
    """Run the import against a fresh session (bypasses the network)."""
    gen = get_db()
    db = next(gen)
    try:
        conn = (
            db.query(ChannelConnection)
            .filter(ChannelConnection.id == connection_id)
            .first()
        )
        return channels.apply_ical_import(db, conn, ics)
    finally:
        gen.close()


def test_ical_export_is_public_with_token():
    with TestClient(app) as client:
        headers = _login_headers(client)
        unit_id = _first_unit_id(client, headers)

        booking = client.post(
            "/bookings",
            json={
                "unit_id": unit_id,
                "guest_name": "Export Test",
                "source": "direct",
                "checkin_date": "2029-03-10",
                "checkout_date": "2029-03-12",
                "currency": "EUR",
            },
            headers=headers,
        )
        assert booking.status_code == 200

        info = client.get(
            f"/revenue/channels/units/{unit_id}/export-info", headers=headers
        )
        assert info.status_code == 200
        token = info.json()["token"]
        path = info.json()["ical_path"]

        # Fetched WITHOUT auth (as an OTA would), correct token → 200 + valid ICS.
        public = client.get(f"{path}?token={token}")
        assert public.status_code == 200
        assert "text/calendar" in public.headers.get("content-type", "")
        body = public.text
        assert "BEGIN:VCALENDAR" in body
        assert "BEGIN:VEVENT" in body
        assert "20290310" in body
        assert "Export Test" not in body  # no guest PII leaks

        # Wrong / missing token → 404 (no oracle).
        assert client.get(f"{path}?token=bogus").status_code == 404
        assert client.get(path).status_code == 404

        client.delete(f"/bookings/{booking.json()['id']}", headers=headers)


def test_ical_import_creates_blocks_and_is_idempotent():
    with TestClient(app) as client:
        headers = _login_headers(client)
        unit_id = _first_unit_id(client, headers)

        created = client.post(
            "/revenue/channels",
            json={
                "unit_id": unit_id,
                "channel": "airbnb",
                "ical_import_url": "https://example.com/cal.ics",
            },
            headers=headers,
        )
        assert created.status_code == 200
        conn_id = created.json()["id"]

        first = _apply(conn_id, SAMPLE_ICS)
        assert first["created"] == 2
        assert first["conflicts"] == []

        # The two blocks now appear as bookings attributed to the channel.
        bookings = client.get("/bookings", headers=headers).json()
        blocks = [
            b
            for b in bookings
            if b["unit_id"] == unit_id and b["checkin_date"] == "2029-01-05"
        ]
        assert len(blocks) == 1
        assert blocks[0]["source"] == "airbnb"

        # Re-import is idempotent: still two blocks, not four.
        second = _apply(conn_id, SAMPLE_ICS)
        assert second["created"] == 2
        after = [
            b
            for b in client.get("/bookings", headers=headers).json()
            if b["unit_id"] == unit_id and b["checkin_date"] in ("2029-01-05", "2029-01-20")
        ]
        assert len(after) == 2

        client.delete(f"/revenue/channels/{conn_id}", headers=headers)
        # Deleting the connection removes its imported blocks.
        left = [
            b
            for b in client.get("/bookings", headers=headers).json()
            if b["unit_id"] == unit_id and b["checkin_date"] in ("2029-01-05", "2029-01-20")
        ]
        assert left == []


def test_ical_import_reports_conflict_with_existing_booking():
    with TestClient(app) as client:
        headers = _login_headers(client)
        unit_id = _first_unit_id(client, headers)

        # Clean the slot then create a manual booking that collides with evt-1.
        for b in client.get("/bookings", headers=headers).json():
            if b["unit_id"] == unit_id and b["checkin_date"] == "2029-01-05":
                client.delete(f"/bookings/{b['id']}", headers=headers)
        manual = client.post(
            "/bookings",
            json={
                "unit_id": unit_id,
                "guest_name": "Diretta",
                "source": "direct",
                "checkin_date": "2029-01-05",
                "checkout_date": "2029-01-07",
                "currency": "EUR",
            },
            headers=headers,
        )
        assert manual.status_code == 200

        created = client.post(
            "/revenue/channels",
            json={"unit_id": unit_id, "channel": "booking", "ical_import_url": "x"},
            headers=headers,
        )
        conn_id = created.json()["id"]

        result = _apply(conn_id, SAMPLE_ICS)
        # evt-1 collides with the manual booking → conflict; evt-2 imported.
        assert result["created"] == 1
        assert len(result["conflicts"]) == 1
        assert result["conflicts"][0]["start"] == "2029-01-05"

        client.delete(f"/revenue/channels/{conn_id}", headers=headers)
        client.delete(f"/bookings/{manual.json()['id']}", headers=headers)
