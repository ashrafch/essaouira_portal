from fastapi.testclient import TestClient

from app.core.auth import create_access_token
from app.main import app


def _login_headers(client: TestClient, username: str = "owner", password: str = "owner123", tenant_id: str = "default"):
    response = client.post(
        "/auth/login",
        json={"username": username, "password": password, "tenant_id": tenant_id},
    )
    assert response.status_code == 200
    token = response.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def _token_headers(username: str, role: str, tenant_id: str):
    token = create_access_token(username, role=role, tenant_id=tenant_id)
    return {"Authorization": f"Bearer {token}"}


def test_owner_can_create_update_and_reset_user_password():
    with TestClient(app) as client:
        owner_headers = _login_headers(client)

        created = client.post(
            "/users",
            headers=owner_headers,
            json={
                "username": "manager1",
                "password": "password123",
                "role": "manager",
                "is_active": True,
            },
        )
        assert created.status_code == 201
        user_id = created.json()["id"]

        listed = client.get("/users", headers=owner_headers)
        assert listed.status_code == 200
        usernames = {user["username"] for user in listed.json()}
        assert "owner" in usernames
        assert "manager1" in usernames

        updated = client.put(
            f"/users/{user_id}",
            headers=owner_headers,
            json={"role": "operator"},
        )
        assert updated.status_code == 200
        assert updated.json()["role"] == "operator"

        reset = client.post(
            f"/users/{user_id}/reset-password",
            headers=owner_headers,
            json={"new_password": "newpass123"},
        )
        assert reset.status_code == 200

        login_with_reset = client.post(
            "/auth/login",
            json={
                "username": "manager1",
                "password": "newpass123",
                "tenant_id": "default",
            },
        )
        assert login_with_reset.status_code == 200
        assert login_with_reset.json()["role"] == "operator"


def test_non_owner_cannot_manage_users():
    with TestClient(app) as client:
        owner_headers = _login_headers(client)
        created = client.post(
            "/users",
            headers=owner_headers,
            json={
                "username": "viewer1",
                "password": "password123",
                "role": "viewer",
                "is_active": True,
            },
        )
        assert created.status_code == 201

        viewer_headers = _login_headers(client, username="viewer1", password="password123")
        denied = client.get("/users", headers=viewer_headers)
        assert denied.status_code == 403


def test_users_are_tenant_isolated():
    with TestClient(app) as client:
        tenant_a_owner = _token_headers("owner-a", role="owner", tenant_id="tenant-a")
        tenant_b_owner = _token_headers("owner-b", role="owner", tenant_id="tenant-b")

        created = client.post(
            "/users",
            headers=tenant_a_owner,
            json={
                "username": "tenant-a-user",
                "password": "password123",
                "role": "viewer",
                "is_active": True,
            },
        )
        assert created.status_code == 201

        list_a = client.get("/users", headers=tenant_a_owner)
        assert list_a.status_code == 200
        assert any(u["username"] == "tenant-a-user" for u in list_a.json())

        list_b = client.get("/users", headers=tenant_b_owner)
        assert list_b.status_code == 200
        assert all(u["username"] != "tenant-a-user" for u in list_b.json())


def test_cannot_disable_last_active_owner():
    with TestClient(app) as client:
        owner_headers = _login_headers(client)
        owner_list = client.get("/users", headers=owner_headers)
        assert owner_list.status_code == 200
        owner_user = next(u for u in owner_list.json() if u["username"] == "owner")

        denied = client.put(
            f"/users/{owner_user['id']}",
            headers=owner_headers,
            json={"is_active": False},
        )
        assert denied.status_code == 400
