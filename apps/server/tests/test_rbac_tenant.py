import os

os.environ.setdefault("DATABASE_URL", "sqlite:///./test.db")
os.environ.setdefault("AUTH_ENABLED", "true")
os.environ.setdefault("AUTH_SECRET_KEY", "test-secret")
os.environ.setdefault("ADMIN_USERNAME", "owner")
os.environ.setdefault("ADMIN_PASSWORD", "owner123")
os.environ.setdefault("ADMIN_ROLE", "owner")
os.environ.setdefault("ADMIN_TENANT_ID", "default")
os.environ.setdefault("AUTO_CREATE_SCHEMA", "true")
os.environ.setdefault("AUTO_SEED_DATA", "true")

from fastapi.testclient import TestClient

from app.core.auth import create_access_token
from app.main import app


def _headers_for(role: str, tenant_id: str = "default"):
    token = create_access_token(f"{role}_user", role=role, tenant_id=tenant_id)
    return {"Authorization": f"Bearer {token}"}


def test_viewer_is_read_only():
    with TestClient(app) as client:
        viewer_headers = _headers_for("viewer")

        read_resp = client.get("/units", headers=viewer_headers)
        assert read_resp.status_code == 200

        write_resp = client.post(
            "/cost-items",
            headers=viewer_headers,
            json={
                "date": "2026-03-10",
                "category": "utilities",
                "description": "Test",
                "amount": 10,
                "currency": "EUR",
                "unit_id": None,
            },
        )
        assert write_resp.status_code == 403


def test_tenant_header_must_match_token_tenant():
    with TestClient(app) as client:
        owner_headers = _headers_for("owner", tenant_id="default")
        owner_headers["X-Tenant-Id"] = "other-tenant"

        response = client.get("/units", headers=owner_headers)
        assert response.status_code == 403
        assert "tenant mismatch" in response.text.lower()
