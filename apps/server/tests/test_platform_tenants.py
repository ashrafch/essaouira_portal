from fastapi.testclient import TestClient

from app.core.auth import create_access_token
from app.main import app


def _headers(username: str, role: str, tenant_id: str):
    token = create_access_token(username, role=role, tenant_id=tenant_id)
    return {"Authorization": f"Bearer {token}"}


def test_platform_owner_can_create_tenant_and_owner_login():
    with TestClient(app) as client:
        platform_headers = _headers("owner", "owner", "default")
        create_resp = client.post(
            "/platform/tenants",
            headers=platform_headers,
            json={
                "tenant_id": "client-z",
                "name": "Client Z",
                "owner_username": "clientz_owner",
                "owner_password": "StrongPass123!",
                "brand_primary_color": "#0f766e",
                "brand_logo_url": "https://cdn.example.com/client-z-logo.png",
            },
        )
        assert create_resp.status_code == 200
        assert create_resp.json()["tenant_id"] == "client-z"
        assert create_resp.json()["brand_primary_color"] == "#0f766e"
        assert create_resp.json()["brand_logo_url"] == "https://cdn.example.com/client-z-logo.png"

        login_resp = client.post(
            "/auth/login",
            json={
                "tenant_id": "client-z",
                "username": "clientz_owner",
                "password": "StrongPass123!",
            },
        )
        assert login_resp.status_code == 200
        assert login_resp.json()["tenant_id"] == "client-z"
        assert login_resp.json()["role"] == "owner"


def test_non_platform_owner_cannot_create_tenant():
    with TestClient(app) as client:
        not_platform = _headers("manager_default", "manager", "default")
        response = client.post(
            "/platform/tenants",
            headers=not_platform,
            json={
                "tenant_id": "client-y",
                "name": "Client Y",
                "owner_username": "clienty_owner",
                "owner_password": "StrongPass123!",
            },
        )
        assert response.status_code == 403


def test_platform_owner_can_update_tenant_branding():
    with TestClient(app) as client:
        platform_headers = _headers("owner", "owner", "default")
        create_resp = client.post(
            "/platform/tenants",
            headers=platform_headers,
            json={
                "tenant_id": "client-brand",
                "name": "Client Brand",
                "owner_username": "clientbrand_owner",
                "owner_password": "StrongPass123!",
            },
        )
        assert create_resp.status_code == 200

        update_resp = client.put(
            "/platform/tenants/client-brand",
            headers=platform_headers,
            json={
                "name": "Client Brand Updated",
                "brand_primary_color": "#1d4ed8",
                "brand_logo_url": "https://cdn.example.com/brand-logo.svg",
                "is_active": True,
            },
        )
        assert update_resp.status_code == 200
        body = update_resp.json()
        assert body["name"] == "Client Brand Updated"
        assert body["brand_primary_color"] == "#1d4ed8"
        assert body["brand_logo_url"] == "https://cdn.example.com/brand-logo.svg"
