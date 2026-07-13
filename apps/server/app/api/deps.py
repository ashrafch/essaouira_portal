from fastapi import HTTPException, Request


def require_owner(request: Request) -> str:
    """Ensure the authenticated principal has the owner role."""
    role = (getattr(request.state, "role", "viewer") or "viewer").strip().lower()
    if role != "owner":
        raise HTTPException(status_code=403, detail="Owner role required")
    return role
