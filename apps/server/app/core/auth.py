from datetime import datetime, timedelta, timezone
import base64
import hashlib
import hmac
import os
from dataclasses import dataclass
from typing import Optional

import jwt
from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.tenant import normalize_tenant_id
from app.models.user import User


class AuthError(HTTPException):
    def __init__(self, detail: str = "Not authenticated"):
        super().__init__(status_code=401, detail=detail)


@dataclass(frozen=True)
class AuthenticatedPrincipal:
    username: str
    role: str
    tenant_id: str


def hash_password(password: str) -> str:
    if password is None:
        raise ValueError("password is required")
    iterations = 600_000
    salt = base64.urlsafe_b64encode(os.urandom(16)).decode("utf-8").rstrip("=")
    digest = hashlib.pbkdf2_hmac(
        "sha256",
        password.encode("utf-8"),
        salt.encode("utf-8"),
        iterations,
    )
    hash_b64 = base64.urlsafe_b64encode(digest).decode("utf-8").rstrip("=")
    return f"pbkdf2_sha256${iterations}${salt}${hash_b64}"


def verify_password(password: str, password_hash: str) -> bool:
    if not password_hash:
        return False
    if not password_hash.startswith("pbkdf2_sha256$"):
        return False
    parts = password_hash.split("$", 3)
    if len(parts) != 4:
        return False
    _, iterations_raw, salt, expected = parts
    try:
        iterations = int(iterations_raw)
    except ValueError:
        return False
    digest = hashlib.pbkdf2_hmac(
        "sha256",
        (password or "").encode("utf-8"),
        salt.encode("utf-8"),
        iterations,
    )
    actual = base64.urlsafe_b64encode(digest).decode("utf-8").rstrip("=")
    return hmac.compare_digest(actual, expected)


def _verify_env_admin_password(password: str) -> bool:
    if settings.admin_password_hash:
        return verify_password(password, settings.admin_password_hash)
    return hmac.compare_digest(password or "", settings.admin_password or "")


def authenticate_user(
    db: Session,
    username: str,
    password: str,
    tenant_id: str | None = None,
) -> Optional[AuthenticatedPrincipal]:
    normalized_username = (username or "").strip().lower()
    normalized_tenant = normalize_tenant_id(tenant_id)
    if not normalized_username:
        return None

    user = (
        db.query(User)
        .filter(
            User.tenant_id == normalized_tenant,
            User.username == normalized_username,
        )
        .first()
    )
    if user and user.is_active and verify_password(password, user.password_hash):
        return AuthenticatedPrincipal(
            username=user.username,
            role=(user.role or "viewer").strip().lower(),
            tenant_id=user.tenant_id,
        )

    fallback_tenant = normalize_tenant_id(settings.admin_tenant_id)
    if (
        normalized_username == (settings.admin_username or "").strip().lower()
        and normalized_tenant == fallback_tenant
        and _verify_env_admin_password(password)
    ):
        return AuthenticatedPrincipal(
            username=normalized_username,
            role=(settings.admin_role or "owner").strip().lower(),
            tenant_id=fallback_tenant,
        )
    return None


def create_access_token(subject: str, role: str = "owner", tenant_id: str = "default") -> str:
    expires_at = datetime.now(timezone.utc) + timedelta(
        minutes=settings.auth_access_token_minutes
    )
    payload = {
        "sub": subject,
        "role": role,
        "tenant_id": tenant_id,
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
        if payload.get("type") != "access" or not payload.get("sub"):
            raise AuthError("Invalid token")
        return payload
    except jwt.PyJWTError as exc:
        raise AuthError("Invalid or expired token") from exc
