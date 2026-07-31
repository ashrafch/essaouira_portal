import secrets

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

# Public, token-protected prefixes (validated by the route itself, not by JWT):
# the iCal export must be fetchable anonymously by external channels (Airbnb…).
AUTH_EXCLUDED_PREFIXES = ("/revenue/ical/",)

# Machine-to-machine ingest: Home Assistant cannot hold a portal JWT, so the
# VillaCore event endpoint also accepts a shared secret. Enabled only when
# SMART_INGEST_TOKEN is set, only on this exact path, only for POST.
INGEST_PATH = "/smart/link/events"
INGEST_TOKEN_HEADER = "X-Smart-Ingest-Token"
INGEST_IDENTITY_USER = "villacore-link"
# Write access is required to record events and raise alerts; nothing more.
INGEST_IDENTITY_ROLE = "manager"

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


def _ingest_token_identity(request: Request) -> bool | None:
    """Authenticate a VillaCore push by shared secret.

    Returns ``True`` when the request is an authenticated ingest call, ``False``
    when the header was supplied but wrong, and ``None`` when this is not an
    ingest attempt at all (fall through to the normal JWT path, so an operator
    can still call the endpoint from the UI).
    """
    if request.url.path != INGEST_PATH or request.method.upper() != "POST":
        return None
    supplied = (request.headers.get(INGEST_TOKEN_HEADER) or "").strip()
    if not supplied:
        return None
    expected = settings.smart_ingest_token
    if not expected:
        return False
    if not secrets.compare_digest(supplied, expected):
        return False

    request.state.user = INGEST_IDENTITY_USER
    request.state.role = INGEST_IDENTITY_ROLE
    request.state.tenant_id = settings.admin_tenant_id
    return True


async def authentication(request: Request, call_next):
    if not settings.auth_enabled:
        return await call_next(request)

    if request.url.path in AUTH_EXCLUDED_PATHS or _starts_with_any(
        request.url.path, AUTH_EXCLUDED_PREFIXES
    ):
        return await call_next(request)

    ingest = _ingest_token_identity(request)
    if ingest is True:
        return await call_next(request)
    if ingest is False:
        return JSONResponse(status_code=401, content={"detail": "Invalid ingest token"})

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
