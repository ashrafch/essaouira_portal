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
    return await call_next(request)
