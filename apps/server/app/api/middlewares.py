from fastapi import HTTPException, Request
from fastapi.responses import JSONResponse

from app.core.auth import decode_access_token
from app.core.config import settings
from app.core.logging import log_request_middleware
from app.core.tenant import (
    normalize_tenant_id,
    reset_current_tenant_id,
    set_current_tenant_id,
)

AUTH_EXCLUDED_PATHS = {
    "/health",
    "/auth/login",
    "/docs",
    "/redoc",
    "/openapi.json",
    "/metrics",
}

READ_ONLY_METHODS = {"GET", "HEAD", "OPTIONS"}
WRITE_METHODS = {"POST", "PUT", "PATCH", "DELETE"}

WRITE_PROTECTED_PREFIXES = (
    "/units",
    "/bookings",
    "/staff-tasks",
    "/cost-items",
    "/staff-defaults",
    "/staff-members",
    "/pricing-defaults",
    "/maintenance",
)


def _is_write_protected(path: str, method: str) -> bool:
    if method not in WRITE_METHODS:
        return False
    return any(path == prefix or path.startswith(f"{prefix}/") for prefix in WRITE_PROTECTED_PREFIXES)


async def request_logging(request: Request, call_next):
    return await log_request_middleware(request, call_next)


async def authentication(request: Request, call_next):
    default_tenant = normalize_tenant_id(settings.admin_tenant_id)

    if not settings.auth_enabled:
        request.state.user = "anonymous"
        request.state.role = "owner"
        request.state.tenant_id = default_tenant
        token = set_current_tenant_id(default_tenant)
        try:
            return await call_next(request)
        finally:
            reset_current_tenant_id(token)

    if request.url.path in AUTH_EXCLUDED_PATHS:
        request.state.tenant_id = default_tenant
        token = set_current_tenant_id(default_tenant)
        try:
            return await call_next(request)
        finally:
            reset_current_tenant_id(token)

    header = request.headers.get("Authorization", "")
    if not header.lower().startswith("bearer "):
        return JSONResponse(status_code=401, content={"detail": "Not authenticated"})

    token = header.split(" ", 1)[1].strip()
    try:
        payload = decode_access_token(token)
    except HTTPException as exc:
        return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail})

    request.state.user = payload.get("sub")
    request.state.role = payload.get("role")
    request.state.tenant_id = normalize_tenant_id(payload.get("tenant_id"))

    tenant_header = request.headers.get("X-Tenant-Id")
    if tenant_header and tenant_header.strip().lower() != request.state.tenant_id:
        return JSONResponse(status_code=403, content={"detail": "Tenant mismatch"})

    # RBAC minimo: solo manager/owner possono mutare risorse core.
    role = request.state.role
    if _is_write_protected(request.url.path, request.method) and role not in {"manager", "owner"}:
        return JSONResponse(status_code=403, content={"detail": "Forbidden"})

    token = set_current_tenant_id(request.state.tenant_id)
    try:
        return await call_next(request)
    finally:
        reset_current_tenant_id(token)
