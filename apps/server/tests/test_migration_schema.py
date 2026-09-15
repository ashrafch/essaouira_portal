"""Migration-only schema checks; never connect to an operator database."""

from pathlib import Path
from tempfile import TemporaryDirectory
from datetime import datetime, timezone
import sqlite3

from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, inspect, event
from sqlalchemy.engine import Engine

from app.db import Base
import pytest


@pytest.fixture
def sqlite_postgres_clock():
    # Historical revisions use PostgreSQL's now() default. Only emulate that
    # function; schema creation itself still comes exclusively from Alembic.
    def install(connection, _):
        if isinstance(connection, sqlite3.Connection):
            connection.create_function("now", 0, lambda: datetime.now(timezone.utc).isoformat())
    event.listen(Engine, "connect", install)
    try:
        yield
    finally:
        event.remove(Engine, "connect", install)


@pytest.fixture
def migrated_engine(monkeypatch, sqlite_postgres_clock):
    root = Path(__file__).resolve().parents[1]
    cache = root / ".pytest_cache"
    cache.mkdir(exist_ok=True)
    with TemporaryDirectory(dir=cache) as directory:
        url = f"sqlite:///{Path(directory) / 'migrations.db'}"
        monkeypatch.setenv("DATABASE_URL", url)
        config = Config(str(root / "alembic.ini"))
        config.set_main_option("script_location", str(root / "alembic"))
        command.upgrade(config, "head")
        engine = create_engine(url)
        try:
            yield engine
            command.upgrade(config, "head")
        finally:
            engine.dispose()


def test_fresh_migrations_cover_model_columns(migrated_engine):
    inspector = inspect(migrated_engine)
    missing = {}
    missing_fks = {}
    for name, table in Base.metadata.tables.items():
        if not inspector.has_table(name):
            missing[name] = "table missing"
            continue
        columns = {column["name"] for column in inspector.get_columns(name)}
        absent = set(table.columns.keys()) - columns
        if absent:
            missing[name] = sorted(absent)
        expected_fks = {
            (tuple(fk.column_keys), tuple(element.target_fullname for element in fk.elements))
            for fk in table.foreign_key_constraints
        }
        actual_fks = {
            (tuple(fk["constrained_columns"]), tuple(f"{fk['referred_table']}.{column}" for column in fk["referred_columns"]))
            for fk in inspector.get_foreign_keys(name)
        }
        if expected_fks - actual_fks:
            missing_fks[name] = expected_fks - actual_fks
    assert missing == {}
    assert missing_fks == {}


def test_fresh_production_bootstrap_login_without_demo_seed(monkeypatch, migrated_engine):
    from fastapi.testclient import TestClient
    from sqlalchemy.orm import sessionmaker
    from app.core.config import Settings
    from app.db import get_db
    from app.main import app
    from app.models.user import User
    from app.models.unit import Unit

    factory = sessionmaker(bind=migrated_engine)
    config = Settings(
        app_env="production", auto_create_schema=False, auto_seed_data=False,
        auth_secret_key="synthetic-test-key-with-more-than-32-characters",
        admin_username="verifier", admin_password="Synthetic-only-passphrase!",
    )
    for module in ("app.main", "app.bootstrap", "app.core.auth", "app.api.middlewares", "app.domains.platform.router"):
        monkeypatch.setattr(f"{module}.settings", config)
    monkeypatch.setattr("app.bootstrap.engine", migrated_engine)
    monkeypatch.setattr("app.bootstrap.SessionLocal", factory)
    monkeypatch.setattr("app.api.middlewares.SessionLocal", factory)
    def database():
        with factory() as db:
            yield db
    app.dependency_overrides[get_db] = database
    try:
        with TestClient(app) as client:
            login = client.post("/auth/login", json={"username": config.admin_username, "password": config.admin_password})
            assert login.status_code == 200
            headers = {"Authorization": f"Bearer {login.json()['access_token']}"}
            users = client.get("/users", headers=headers)
            assert users.status_code == 200
            assert [u["username"] for u in users.json()] == ["verifier"]
            user_id = users.json()[0]["id"]
            with factory() as db:
                assert db.query(Unit).count() == 0
                assert db.query(User).count() == 1
            reset = client.post(f"/users/{user_id}/reset-password", headers=headers, json={"new_password": "Changed-synthetic-passphrase!"})
            assert reset.status_code == 200
        with TestClient(app) as client:
            assert client.post("/auth/login", json={"username": "verifier", "password": config.admin_password}).status_code == 401
            login = client.post("/auth/login", json={"username": "verifier", "password": "Changed-synthetic-passphrase!"})
            assert login.status_code == 200
            headers = {"Authorization": f"Bearer {login.json()['access_token']}"}
            with factory() as db:
                user = db.get(User, user_id)
                user.is_active = False
                db.commit()
            assert client.get("/bookings", headers=headers).status_code == 401
        with TestClient(app) as client:
            assert client.post("/auth/login", json={"username": "verifier", "password": "Changed-synthetic-passphrase!"}).status_code == 401
            with factory() as db:
                assert db.get(User, user_id).is_active is False
    finally:
        app.dependency_overrides.pop(get_db, None)
