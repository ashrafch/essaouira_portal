import os
from pathlib import Path


TEST_DB_PATH = Path(__file__).resolve().parents[1] / "test.db"
if TEST_DB_PATH.exists():
    TEST_DB_PATH.unlink()

os.environ["DATABASE_URL"] = "sqlite:///./test.db"
os.environ["AUTH_ENABLED"] = "true"
os.environ["AUTH_SECRET_KEY"] = "test-secret"
os.environ["ADMIN_USERNAME"] = "owner"
os.environ["ADMIN_PASSWORD"] = "owner123"
os.environ["AUTO_CREATE_SCHEMA"] = "true"
os.environ["AUTO_SEED_DATA"] = "true"
os.environ["APP_ENV"] = "development"
os.environ["ADMIN_PASSWORD_HASH"] = ""
os.environ["ADMIN_TENANT_ID"] = "default"
os.environ["ADMIN_ROLE"] = "owner"
# Never inherit an operator's live integration settings in the test process.
os.environ["SMART_PROVIDER_MODE"] = "mock"
os.environ["SMART_POLL_INTERVAL_SECONDS"] = "0"
os.environ["HOME_ASSISTANT_URL"] = ""
os.environ["HOME_ASSISTANT_TOKEN"] = ""
os.environ["SMART_INGEST_TOKEN"] = ""
