import os
from dataclasses import dataclass


def _as_bool(value: str | None, default: bool = False) -> bool:
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


@dataclass(frozen=True)
class Settings:
    environment: str = os.getenv("ENVIRONMENT", "development").strip().lower()
    auth_enabled: bool = _as_bool(os.getenv("AUTH_ENABLED"), True)
    auth_secret_key: str = os.getenv("AUTH_SECRET_KEY", "dev-secret-key-change-me")
    auth_algorithm: str = os.getenv("AUTH_ALGORITHM", "HS256")
    auth_access_token_minutes: int = int(os.getenv("AUTH_ACCESS_TOKEN_MINUTES", "720"))
    admin_username: str = os.getenv("ADMIN_USERNAME", "owner")
    admin_password: str = os.getenv("ADMIN_PASSWORD", "owner123")
    admin_password_hash: str = os.getenv("ADMIN_PASSWORD_HASH", "")
    admin_role: str = os.getenv("ADMIN_ROLE", "owner").strip().lower()
    admin_tenant_id: str = os.getenv("ADMIN_TENANT_ID", "default").strip().lower()
    compliance_company_name: str = os.getenv("COMPLIANCE_COMPANY_NAME", "Essaouira Portal")
    compliance_privacy_email: str = os.getenv("COMPLIANCE_PRIVACY_EMAIL", "privacy@example.com")
    compliance_terms_url: str = os.getenv("COMPLIANCE_TERMS_URL", "https://example.com/terms")
    compliance_privacy_url: str = os.getenv("COMPLIANCE_PRIVACY_URL", "https://example.com/privacy")
    password_min_length: int = int(os.getenv("PASSWORD_MIN_LENGTH", "10"))
    auto_create_schema: bool = _as_bool(os.getenv("AUTO_CREATE_SCHEMA"), True)
    auto_seed_data: bool = _as_bool(os.getenv("AUTO_SEED_DATA"), True)


settings = Settings()
