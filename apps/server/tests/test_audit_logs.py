from fastapi.testclient import TestClient

from app.core.auth import create_access_token
from app.main import app


def _headers(role: str, tenant_id: str = "default"):
    token = create_access_token(f"{role}_{tenant_id}", role=role, tenant_id=tenant_id)
    return {"Authorization": f"Bearer {token}"}


def test_write_operation_is_recorded_in_audit_logs():
    with TestClient(app) as client:
        owner_headers = _headers("owner", "default")
        create_resp = client.post(
            "/cost-items",
            headers=owner_headers,
            json={
                "date": "2026-03-12",
                "category": "utilities",
                "description": "water",
                "amount": 22,
                "currency": "EUR",
                "unit_id": None,
            },
        )
        assert create_resp.status_code == 200

        logs_resp = client.get("/audit-logs", headers=owner_headers)
        assert logs_resp.status_code == 200
        assert any(
            log["method"] == "POST" and log["path"] == "/cost-items"
            for log in logs_resp.json()
        )


def test_audit_logs_are_tenant_scoped():
    with TestClient(app) as client:
        owner_default = _headers("owner", "default")
        owner_other = _headers("owner", "tenant-c")

        create_resp = client.post(
            "/cost-items",
            headers=owner_other,
            json={
                "date": "2026-03-12",
                "category": "maintenance",
                "description": "tenant-c-work",
                "amount": 44,
                "currency": "EUR",
                "unit_id": None,
            },
        )
        assert create_resp.status_code == 200

        logs_default = client.get("/audit-logs", headers=owner_default)
        assert logs_default.status_code == 200
        assert all(log.get("username") != "owner_tenant-c" for log in logs_default.json())

        logs_other = client.get("/audit-logs", headers=owner_other)
        assert logs_other.status_code == 200
        assert any(log["path"] == "/cost-items" and log["status_code"] == 200 for log in logs_other.json())


def test_audit_logs_csv_export():
    with TestClient(app) as client:
        owner_headers = _headers("owner", "default")
        csv_resp = client.get("/audit-logs.csv?limit=50", headers=owner_headers)
        assert csv_resp.status_code == 200
        assert "text/csv" in csv_resp.headers.get("content-type", "")
