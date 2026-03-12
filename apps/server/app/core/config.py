import os
from dataclasses import dataclass


def _as_bool(value: str | None, default: bool = False) -> bool:
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


def _as_csv_list(value: str | None, default: str) -> tuple[str, ...]:
    raw = value if value is not None else default
    return tuple(item.strip().lower() for item in raw.split(",") if item.strip())


@dataclass(frozen=True)
class Settings:
    auth_enabled: bool = _as_bool(os.getenv("AUTH_ENABLED"), True)
    auth_secret_key: str = os.getenv("AUTH_SECRET_KEY", "dev-secret-key-change-me")
    auth_algorithm: str = os.getenv("AUTH_ALGORITHM", "HS256")
    auth_access_token_minutes: int = int(os.getenv("AUTH_ACCESS_TOKEN_MINUTES", "720"))
    admin_username: str = os.getenv("ADMIN_USERNAME", "owner")
    admin_password: str = os.getenv("ADMIN_PASSWORD", "owner123")
    admin_password_hash: str = os.getenv("ADMIN_PASSWORD_HASH", "")
    admin_role: str = os.getenv("ADMIN_ROLE", "owner")
    admin_tenant_id: str = os.getenv("ADMIN_TENANT_ID", "default")
    password_min_length: int = int(os.getenv("PASSWORD_MIN_LENGTH", "8"))
    auto_create_schema: bool = _as_bool(os.getenv("AUTO_CREATE_SCHEMA"), True)
    auto_seed_data: bool = _as_bool(os.getenv("AUTO_SEED_DATA"), True)
    device_offline_timeout_seconds: int = int(os.getenv("DEVICE_OFFLINE_TIMEOUT_SECONDS", "1800"))
    device_battery_warning_level: int = int(os.getenv("DEVICE_BATTERY_WARNING_LEVEL", "20"))
    device_battery_critical_level: int = int(os.getenv("DEVICE_BATTERY_CRITICAL_LEVEL", "10"))
    device_signal_warning_rssi: int = int(os.getenv("DEVICE_SIGNAL_WARNING_RSSI", "-85"))
    telemetry_min_interval_seconds: int = int(os.getenv("TELEMETRY_MIN_INTERVAL_SECONDS", "60"))
    telemetry_temperature_high_c: float = float(os.getenv("TELEMETRY_TEMPERATURE_HIGH_C", "30"))
    telemetry_temperature_low_c: float = float(os.getenv("TELEMETRY_TEMPERATURE_LOW_C", "5"))
    telemetry_humidity_high_pct: float = float(os.getenv("TELEMETRY_HUMIDITY_HIGH_PCT", "85"))
    telemetry_energy_spike_factor: float = float(os.getenv("TELEMETRY_ENERGY_SPIKE_FACTOR", "1.8"))
    telemetry_not_reporting_seconds: int = int(os.getenv("TELEMETRY_NOT_REPORTING_SECONDS", "7200"))
    data_fresh_seconds: int = int(os.getenv("DATA_FRESH_SECONDS", "120"))
    data_stale_seconds: int = int(os.getenv("DATA_STALE_SECONDS", "600"))
    readiness_essential_device_categories: tuple[str, ...] = _as_csv_list(
        os.getenv("ESSENTIAL_DEVICE_CATEGORIES"),
        "door_sensor,leak_sensor,climate_controller,smart_light",
    )


settings = Settings()
