from fastapi.testclient import TestClient

from app.core.auth import create_access_token
from app.main import app


def _headers(role: str, tenant_id: str = "default", username: str | None = None):
    subject = username or f"{role}_{tenant_id}"
    token = create_access_token(subject, role=role, tenant_id=tenant_id)
    return {"Authorization": f"Bearer {token}"}


def test_owner_can_create_user_and_login():
    with TestClient(app) as client:
        owner_headers = _headers("owner", "default")
        create_resp = client.post(
            "/users",
            headers=owner_headers,
            json={
                "username": "manager1",
                "password": "StrongPass123!",
                "role": "manager",
                "is_active": True,
            },
        )
        assert create_resp.status_code == 200
        assert create_resp.json()["role"] == "manager"

        login_resp = client.post(
            "/auth/login",
            json={"username": "manager1", "password": "StrongPass123!", "tenant_id": "default"},
        )
        assert login_resp.status_code == 200
        assert login_resp.json()["role"] == "manager"


def test_non_owner_cannot_manage_users():
    with TestClient(app) as client:
        manager_headers = _headers("manager", "default")
        response = client.post(
            "/users",
            headers=manager_headers,
            json={
                "username": "viewerx",
                "password": "StrongPass123!",
                "role": "viewer",
                "is_active": True,
            },
        )
        assert response.status_code == 403


def test_user_auth_is_tenant_scoped():
    with TestClient(app) as client:
        platform_headers = _headers("owner", "default", username="owner")
        tenant_resp = client.post(
            "/platform/tenants",
            headers=platform_headers,
            json={
                "tenant_id": "tenant-b",
                "name": "Tenant B",
                "owner_username": "tenantb_owner_seed",
                "owner_password": "StrongPass123!",
            },
        )
        assert tenant_resp.status_code in (200, 409)

        owner_other_tenant = _headers("owner", "tenant-b")
        create_resp = client.post(
            "/users",
            headers=owner_other_tenant,
            json={
                "username": "tenantuser",
                "password": "StrongPass123!",
                "role": "viewer",
                "is_active": True,
            },
        )
        assert create_resp.status_code == 200

        wrong_tenant_login = client.post(
            "/auth/login",
            json={
                "username": "tenantuser",
                "password": "StrongPass123!",
                "tenant_id": "default",
            },
        )
        assert wrong_tenant_login.status_code == 401

        correct_tenant_login = client.post(
            "/auth/login",
            json={
                "username": "tenantuser",
                "password": "StrongPass123!",
                "tenant_id": "tenant-b",
            },
        )
        assert correct_tenant_login.status_code == 200
