from types import SimpleNamespace

from app.core import auth


def test_hash_password_roundtrip():
    password = "StrongPassword!2026"
    password_hash = auth.hash_password(password)

    assert auth.verify_password(password, password_hash) is True
    assert auth.verify_password("wrong-password", password_hash) is False


def test_authenticate_user_with_password_hash(monkeypatch):
    password = "AnotherStrongPassword#1"
    password_hash = auth.hash_password(password)

    fake_settings = SimpleNamespace(
        admin_username="owner",
        admin_password="unused",
        admin_password_hash=password_hash,
        auth_enabled=True,
        environment="development",
        auth_secret_key="super-secret",
    )
    monkeypatch.setattr(auth, "settings", fake_settings)

    assert auth.authenticate_user("owner", password) is True
    assert auth.authenticate_user("owner", "bad") is False
    assert auth.authenticate_user("another", password) is False
