from fastapi.testclient import TestClient

from app.core.auth import create_access_token
from app.main import app


def _headers(username: str = "owner", role: str = "owner", tenant_id: str = "default"):
    token = create_access_token(username, role=role, tenant_id=tenant_id)
    return {"Authorization": f"Bearer {token}"}


def test_guest_crm_payment_and_invoice_flow():
    with TestClient(app) as client:
        headers = _headers()
        units_resp = client.get("/units", headers=headers)
        assert units_resp.status_code == 200
        unit_id = units_resp.json()[0]["id"]

        booking_resp = client.post(
            "/bookings",
            headers=headers,
            json={
                "unit_id": unit_id,
                "guest_name": "Client CRM",
                "guest_email": "crm.client@example.com",
                "guest_phone": "+212600000001",
                "num_adults": 2,
                "num_children": 0,
                "estimated_arrival_time": "16:00",
                "source": "direct",
                "checkin_date": "2026-04-10",
                "checkout_date": "2026-04-13",
                "notes": "phase1 test",
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
        assert booking_resp.status_code == 200
        booking_id = booking_resp.json()["id"]

        guests = client.get("/guests?q=crm.client", headers=headers)
        assert guests.status_code == 200
        assert len(guests.json()) >= 1
        guest_id = guests.json()[0]["id"]

        guest_bookings = client.get(f"/guests/{guest_id}/bookings", headers=headers)
        assert guest_bookings.status_code == 200
        assert any(b["id"] == booking_id for b in guest_bookings.json())

        pay_resp = client.post(
            f"/bookings/{booking_id}/payments",
            headers=headers,
            json={
                "amount": 300,
                "currency": "EUR",
                "method": "bank_transfer",
                "status": "captured",
                "external_ref": "TRX-001",
                "notes": "full payment",
            },
        )
        assert pay_resp.status_code == 200

        list_pay = client.get(f"/bookings/{booking_id}/payments", headers=headers)
        assert list_pay.status_code == 200
        assert len(list_pay.json()) >= 1

        inv_resp = client.post(f"/bookings/{booking_id}/invoice", headers=headers, json={})
        assert inv_resp.status_code == 200
        assert inv_resp.json()["booking_id"] == booking_id

        list_inv = client.get("/invoices", headers=headers)
        assert list_inv.status_code == 200
        assert any(inv["booking_id"] == booking_id for inv in list_inv.json())
