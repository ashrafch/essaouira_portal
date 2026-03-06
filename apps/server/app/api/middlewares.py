from fastapi import HTTPException, Request
from fastapi.responses import JSONResponse

from app.core.auth import decode_access_token
from app.core.config import settings
from app.core.logging import log_request_middleware

AUTH_EXCLUDED_PATHS = {
    "/health",
    "/auth/login",
    "/docs",
    "/redoc",
    "/openapi.json",
    "/metrics",
}

READ_METHODS = {"GET", "HEAD", "OPTIONS"}
WRITE_METHODS = {"POST", "PUT", "PATCH", "DELETE"}


def _starts_with_any(path: str, prefixes: tuple[str, ...]) -> bool:
    return any(path.startswith(prefix) for prefix in prefixes)


def _is_authorized(role: str, method: str, path: str) -> bool:
    normalized_role = (role or "viewer").strip().lower()
    normalized_method = (method or "GET").upper()
    if normalized_role == "owner":
        return True

    # Safe read access for non-owner roles.
    if normalized_method in READ_METHODS:
        if normalized_role in {"manager", "operator", "viewer"}:
            return True

    # Shared hard-deny for sensitive admin endpoints.
    if _starts_with_any(path, ("/users",)):
        return False

    if normalized_role == "manager":
        # Manager can write all business/smart resources except owner-only /users.
        return normalized_method in WRITE_METHODS

    if normalized_role == "operator":
        if normalized_method not in WRITE_METHODS:
            return False
        allowed_operator_write_prefixes = (
            "/bookings",
            "/staff-tasks",
            "/cost-items",
            "/maintenance",
        )
        if _starts_with_any(path, allowed_operator_write_prefixes):
            return True
        return False

    # viewer and unknown roles: read-only
    return False


async def request_logging(request: Request, call_next):
    return await log_request_middleware(request, call_next)


async def authentication(request: Request, call_next):
    if not settings.auth_enabled:
        return await call_next(request)

    if request.url.path in AUTH_EXCLUDED_PATHS:
        return await call_next(request)

    header = request.headers.get("Authorization", "")
    if not header.lower().startswith("bearer "):
        return JSONResponse(status_code=401, content={"detail": "Not authenticated"})

    token = header.split(" ", 1)[1].strip()
    try:
        payload = decode_access_token(token)
    except HTTPException as exc:
        return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail})

    request.state.user = payload.get("sub")
    request.state.role = payload.get("role", "owner")
    request.state.tenant_id = payload.get("tenant_id", "default")

    if not _is_authorized(request.state.role, request.method, request.url.path):
        return JSONResponse(status_code=403, content={"detail": "Forbidden for role"})

    return await call_next(request)
