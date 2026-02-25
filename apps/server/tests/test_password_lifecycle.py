from fastapi.testclient import TestClient

from app.core.auth import create_access_token
from app.main import app


def _headers(username: str, role: str, tenant_id: str):
    token = create_access_token(username, role=role, tenant_id=tenant_id)
    return {"Authorization": f"Bearer {token}"}


def test_password_policy_rejects_weak_password_on_user_create():
    with TestClient(app) as client:
        owner_headers = _headers("owner", "owner", "default")
        response = client.post(
            "/users",
            headers=owner_headers,
            json={
                "username": "weak_user",
                "password": "weakpass",
                "role": "viewer",
                "is_active": True,
            },
        )
        assert response.status_code == 400
        assert "password" in response.text.lower()


def test_owner_reset_and_user_change_password_flow():
    with TestClient(app) as client:
        owner_headers = _headers("owner", "owner", "default")
        create_resp = client.post(
            "/users",
            headers=owner_headers,
            json={
                "username": "lifecycle_user",
                "password": "StrongPass123!",
                "role": "viewer",
                "is_active": True,
            },
        )
        assert create_resp.status_code == 200
        user_id = create_resp.json()["id"]

        reset_resp = client.post(
            f"/users/{user_id}/reset-password",
            headers=owner_headers,
            json={"new_password": "ResetPass123!", "must_change_on_login": True},
        )
        assert reset_resp.status_code == 200
        assert reset_resp.json()["must_change_password"] is True

        login_resp = client.post(
            "/auth/login",
            json={
                "tenant_id": "default",
                "username": "lifecycle_user",
                "password": "ResetPass123!",
            },
        )
        assert login_resp.status_code == 200
        assert login_resp.json()["must_change_password"] is True
        token = login_resp.json()["access_token"]

        change_resp = client.post(
            "/auth/change-password",
            headers={"Authorization": f"Bearer {token}"},
            json={"current_password": "ResetPass123!", "new_password": "FinalPass123!"},
        )
        assert change_resp.status_code == 200

        login_again = client.post(
            "/auth/login",
            json={
                "tenant_id": "default",
                "username": "lifecycle_user",
                "password": "FinalPass123!",
            },
        )
        assert login_again.status_code == 200
        assert login_again.json()["must_change_password"] is False
