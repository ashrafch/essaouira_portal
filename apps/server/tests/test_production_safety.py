import pytest
from fastapi.testclient import TestClient

from app.core.config import Settings
from app.main import app

STRONG_SECRET = "a-very-long-random-secret-value-1234567890"
STRONG_PASSWORD = "S7rong!AdminPassw0rd"


def _prod_settings(**overrides) -> Settings:
    base = dict(
        app_env="production",
        auth_secret_key=STRONG_SECRET,
        admin_password=STRONG_PASSWORD,
    )
    base.update(overrides)
    return Settings(**base)


def test_development_allows_weak_defaults():
    # Default Settings() carries the weak dev defaults but APP_ENV=development.
    Settings().validate_production_safety()


def test_production_with_strong_values_passes():
    _prod_settings().validate_production_safety()


def test_production_rejects_missing_secret_key():
    with pytest.raises(RuntimeError, match="AUTH_SECRET_KEY"):
        _prod_settings(auth_secret_key="").validate_production_safety()


@pytest.mark.parametrize(
    "weak_secret",
    [
        "change-me-in-production",
        "dev-secret-key-change-me",
        "change-me-strong-secret",
    ],
)
def test_production_rejects_known_weak_secret_keys(weak_secret):
    with pytest.raises(RuntimeError, match="AUTH_SECRET_KEY"):
        _prod_settings(auth_secret_key=weak_secret).validate_production_safety()


def test_production_rejects_default_admin_password():
    with pytest.raises(RuntimeError, match="ADMIN_PASSWORD"):
        _prod_settings(admin_password="owner123").validate_production_safety()


def test_from_env_picks_up_production_env(monkeypatch):
    monkeypatch.setenv("APP_ENV", "production")
    monkeypatch.setenv("AUTH_SECRET_KEY", "dev-secret-key-change-me")
    monkeypatch.setenv("ADMIN_PASSWORD", STRONG_PASSWORD)
    with pytest.raises(RuntimeError):
        Settings.from_env().validate_production_safety()


def test_app_startup_fails_with_unsafe_production_config(monkeypatch):
    unsafe = _prod_settings(auth_secret_key="change-me-in-production")
    monkeypatch.setattr("app.main.settings", unsafe)
    with pytest.raises(RuntimeError, match="APP_ENV=production"):
        with TestClient(app):
            pass
