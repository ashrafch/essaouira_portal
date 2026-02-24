from datetime import datetime, timedelta, timezone

import jwt
from fastapi import HTTPException

from app.core.config import settings


class AuthError(HTTPException):
    def __init__(self, detail: str = "Not authenticated"):
        super().__init__(status_code=401, detail=detail)


def authenticate_user(username: str, password: str) -> bool:
    return username == settings.admin_username and password == settings.admin_password


def create_access_token(subject: str) -> str:
    expires_at = datetime.now(timezone.utc) + timedelta(
        minutes=settings.auth_access_token_minutes
    )
    payload = {
        "sub": subject,
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
