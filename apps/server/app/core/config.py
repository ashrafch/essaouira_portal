"""Central application configuration.

All environment-driven settings live here. The module-level ``settings``
instance is built once at import time (tests set env vars before importing
the app, see ``tests/conftest.py``).

Smart-provider settings (``SMART_PROVIDER_MODE``, ``HOME_ASSISTANT_*``) are
exposed as dynamic properties because tests and operators may change them at
runtime (e.g. ``patch.dict(os.environ, ...)``).
"""

import os
from dataclasses import dataclass

DEFAULT_DATABASE_URL = "postgresql+psycopg2://essa:essa@localhost:5432/essa"
DEFAULT_CORS_ORIGINS = "http://localhost:5173,http://127.0.0.1:5173"

WEAK_AUTH_SECRET_KEYS = frozenset(
    {
        "change-me-in-production",
        "dev-secret-key-change-me",
        "change-me-strong-secret",
    }
)
WEAK_ADMIN_PASSWORDS = frozenset({"owner123"})


def _as_bool(value: str | None, default: bool = False) -> bool:
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


def _as_csv_list(value: str | None, default: str) -> tuple[str, ...]:
    raw = value if value is not None else default
    return tuple(item.strip().lower() for item in raw.split(",") if item.strip())


def _as_origins(value: str | None, default: str) -> tuple[str, ...]:
    raw = value if value is not None else default
    return tuple(origin.strip() for origin in raw.split(",") if origin.strip())


@dataclass(frozen=True)
class Settings:
    app_env: str = "development"
    database_url: str = DEFAULT_DATABASE_URL
    cors_origins: tuple[str, ...] = _as_origins(None, DEFAULT_CORS_ORIGINS)
    auth_enabled: bool = True
    auth_secret_key: str = "dev-secret-key-change-me"
    auth_algorithm: str = "HS256"
    auth_access_token_minutes: int = 720
    admin_username: str = "owner"
    admin_password: str = "owner123"
    admin_password_hash: str = ""
    admin_role: str = "owner"
    admin_tenant_id: str = "default"
    password_min_length: int = 8
    auto_create_schema: bool = True
    auto_seed_data: bool = True
    device_offline_timeout_seconds: int = 1800
    device_battery_warning_level: int = 20
    device_battery_critical_level: int = 10
    device_signal_warning_rssi: int = -85
    telemetry_min_interval_seconds: int = 60
    telemetry_temperature_high_c: float = 30.0
    telemetry_temperature_low_c: float = 5.0
    telemetry_humidity_high_pct: float = 85.0
    telemetry_energy_spike_factor: float = 1.8
    telemetry_not_reporting_seconds: int = 7200
    data_fresh_seconds: int = 120
    data_stale_seconds: int = 600
    readiness_essential_device_categories: tuple[str, ...] = _as_csv_list(
        None,
        "door_sensor,leak_sensor,climate_controller,smart_light",
    )

    @classmethod
    def from_env(cls) -> "Settings":
        return cls(
            app_env=os.getenv("APP_ENV", "development"),
            database_url=os.getenv("DATABASE_URL", DEFAULT_DATABASE_URL),
            cors_origins=_as_origins(os.getenv("CORS_ORIGINS"), DEFAULT_CORS_ORIGINS),
            auth_enabled=_as_bool(os.getenv("AUTH_ENABLED"), True),
            auth_secret_key=os.getenv("AUTH_SECRET_KEY", "dev-secret-key-change-me"),
            auth_algorithm=os.getenv("AUTH_ALGORITHM", "HS256"),
            auth_access_token_minutes=int(os.getenv("AUTH_ACCESS_TOKEN_MINUTES", "720")),
            admin_username=os.getenv("ADMIN_USERNAME", "owner"),
            admin_password=os.getenv("ADMIN_PASSWORD", "owner123"),
            admin_password_hash=os.getenv("ADMIN_PASSWORD_HASH", ""),
            admin_role=os.getenv("ADMIN_ROLE", "owner"),
            admin_tenant_id=os.getenv("ADMIN_TENANT_ID", "default"),
            password_min_length=int(os.getenv("PASSWORD_MIN_LENGTH", "8")),
            auto_create_schema=_as_bool(os.getenv("AUTO_CREATE_SCHEMA"), True),
            auto_seed_data=_as_bool(os.getenv("AUTO_SEED_DATA"), True),
            device_offline_timeout_seconds=int(os.getenv("DEVICE_OFFLINE_TIMEOUT_SECONDS", "1800")),
            device_battery_warning_level=int(os.getenv("DEVICE_BATTERY_WARNING_LEVEL", "20")),
            device_battery_critical_level=int(os.getenv("DEVICE_BATTERY_CRITICAL_LEVEL", "10")),
            device_signal_warning_rssi=int(os.getenv("DEVICE_SIGNAL_WARNING_RSSI", "-85")),
            telemetry_min_interval_seconds=int(os.getenv("TELEMETRY_MIN_INTERVAL_SECONDS", "60")),
            telemetry_temperature_high_c=float(os.getenv("TELEMETRY_TEMPERATURE_HIGH_C", "30")),
            telemetry_temperature_low_c=float(os.getenv("TELEMETRY_TEMPERATURE_LOW_C", "5")),
            telemetry_humidity_high_pct=float(os.getenv("TELEMETRY_HUMIDITY_HIGH_PCT", "85")),
            telemetry_energy_spike_factor=float(os.getenv("TELEMETRY_ENERGY_SPIKE_FACTOR", "1.8")),
            telemetry_not_reporting_seconds=int(os.getenv("TELEMETRY_NOT_REPORTING_SECONDS", "7200")),
            data_fresh_seconds=int(os.getenv("DATA_FRESH_SECONDS", "120")),
            data_stale_seconds=int(os.getenv("DATA_STALE_SECONDS", "600")),
            readiness_essential_device_categories=_as_csv_list(
                os.getenv("ESSENTIAL_DEVICE_CATEGORIES"),
                "door_sensor,leak_sensor,climate_controller,smart_light",
            ),
        )

    # --- Smart provider settings (read at access time on purpose) ---

    @property
    def smart_provider_mode(self) -> str:
        return os.getenv("SMART_PROVIDER_MODE", "mock").strip().lower()

    @property
    def home_assistant_url(self) -> str:
        return os.getenv("HOME_ASSISTANT_URL", "")

    @property
    def home_assistant_token(self) -> str:
        return os.getenv("HOME_ASSISTANT_TOKEN", "")

    @property
    def home_assistant_timeout_seconds(self) -> str:
        return os.getenv("HOME_ASSISTANT_TIMEOUT_SECONDS", "8")

    @property
    def home_assistant_include_domains(self) -> str | None:
        return os.getenv("HOME_ASSISTANT_INCLUDE_DOMAINS")

    @property
    def home_assistant_unit_hints(self) -> str:
        return os.getenv("HOME_ASSISTANT_UNIT_HINTS", "")

    # --- Safety checks ---

    def validate_production_safety(self) -> None:
        """Refuse to start in production with known-weak credentials."""
        if (self.app_env or "").strip().lower() != "production":
            return

        problems: list[str] = []
        secret = (self.auth_secret_key or "").strip()
        if not secret or secret in WEAK_AUTH_SECRET_KEYS:
            problems.append(
                "AUTH_SECRET_KEY is missing or set to a known weak default"
            )
        if (self.admin_password or "") in WEAK_ADMIN_PASSWORDS:
            problems.append("ADMIN_PASSWORD is set to the known weak default")

        if problems:
            raise RuntimeError(
                "Refusing to start with APP_ENV=production and unsafe configuration: "
                + "; ".join(problems)
                + ". Set strong values via environment variables and restart."
            )


settings = Settings.from_env()
