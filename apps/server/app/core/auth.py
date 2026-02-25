from datetime import datetime, timedelta, timezone
import hashlib
import hmac
import secrets

import jwt
from fastapi import HTTPException

from app.core.config import settings

ALLOWED_ROLES = {"viewer", "operator", "manager", "owner"}


class AuthError(HTTPException):
    def __init__(self, detail: str = "Not authenticated"):
        super().__init__(status_code=401, detail=detail)


def _pbkdf2_sha256(password: str, salt: str, iterations: int) -> str:
    digest = hashlib.pbkdf2_hmac(
        "sha256",
        password.encode("utf-8"),
        salt.encode("utf-8"),
        iterations,
    )
    return digest.hex()


def hash_password(password: str, iterations: int = 390000) -> str:
    salt = secrets.token_hex(16)
    digest_hex = _pbkdf2_sha256(password, salt, iterations)
    return f"pbkdf2_sha256${iterations}${salt}${digest_hex}"


def verify_password(password: str, password_hash: str) -> bool:
    try:
        algo, iter_str, salt, expected_digest = password_hash.split("$", 3)
        if algo != "pbkdf2_sha256":
            return False
        iterations = int(iter_str)
    except (ValueError, TypeError):
        return False

    computed = _pbkdf2_sha256(password, salt, iterations)
    return hmac.compare_digest(computed, expected_digest)


def validate_auth_configuration() -> None:
    if not settings.auth_enabled:
        return

    if settings.admin_role not in ALLOWED_ROLES:
        raise RuntimeError(
            "ADMIN_ROLE non valido. Valori consentiti: viewer, operator, manager, owner."
        )

    if not settings.admin_tenant_id:
        raise RuntimeError("ADMIN_TENANT_ID non puo essere vuoto.")

    if settings.environment != "production":
        return

    if settings.auth_secret_key == "dev-secret-key-change-me":
        raise RuntimeError(
            "AUTH_SECRET_KEY default non consentito in produzione. Imposta un secret forte."
        )

    if settings.admin_password == "owner123" and not settings.admin_password_hash:
        raise RuntimeError(
            "Credenziali admin di default non consentite in produzione. "
            "Imposta ADMIN_PASSWORD_HASH (consigliato) o ADMIN_PASSWORD forte."
        )


def authenticate_user(username: str, password: str) -> bool:
    if username != settings.admin_username:
        return False

    if settings.admin_password_hash:
        return verify_password(password, settings.admin_password_hash)

    return hmac.compare_digest(password, settings.admin_password)


def create_access_token(subject: str, role: str = "owner", tenant_id: str = "default") -> str:
    expires_at = datetime.now(timezone.utc) + timedelta(
        minutes=settings.auth_access_token_minutes
    )
    if role not in ALLOWED_ROLES:
        raise ValueError("Invalid role")

    tenant = tenant_id.strip().lower()
    if not tenant:
        raise ValueError("Invalid tenant_id")

    payload = {
        "sub": subject,
        "role": role,
        "tenant_id": tenant,
        "exp": expires_at,
        "type": "access",
    }
    return jwt.encode(payload, settings.auth_secret_key, algorithm=settings.auth_algorithm)


def decode_access_token(token: str) -> dict:
    try:
        payload = jwt.decode(
            token,
            settings.auth_secret_key,
            algorithms=[settings.auth_algorithm],
        )
        role = payload.get("role")
        tenant_id = payload.get("tenant_id")
        if (
            payload.get("type") != "access"
            or not payload.get("sub")
            or role not in ALLOWED_ROLES
            or not isinstance(tenant_id, str)
            or not tenant_id.strip()
        ):
            raise AuthError("Invalid token")
        return payload
    except jwt.PyJWTError as exc:
        raise AuthError("Invalid or expired token") from exc
