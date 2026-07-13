from typing import List

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from app.api.deps import require_owner
from app.core.auth import authenticate_user, create_access_token, hash_password
from app.core.config import settings
from app.core.tenant import normalize_tenant_id
from app.db import get_db
from app.domains.platform.schemas import (
    AuthLoginRequest,
    AuthLoginResponse,
    UserCreate,
    UserOut,
    UserResetPassword,
    UserRole,
    UserUpdate,
)
from app.models.user import User

router = APIRouter()


# ---------- HEALTH CHECK ----------


@router.get("/health")
def health():
    return {"status": "ok"}


# ---------- AUTH ----------


@router.post("/auth/login", response_model=AuthLoginResponse)
def auth_login(payload: AuthLoginRequest, db: Session = Depends(get_db)):
    if not settings.auth_enabled:
        tenant_id = normalize_tenant_id(payload.tenant_id)
        token = create_access_token("anonymous", role="owner", tenant_id=tenant_id)
        return AuthLoginResponse(
            access_token=token,
            username="anonymous",
            role="owner",
            tenant_id=tenant_id,
        )

    principal = authenticate_user(
        db,
        payload.username,
        payload.password,
        tenant_id=payload.tenant_id,
    )
    if not principal:
        raise HTTPException(status_code=401, detail="Credenziali non valide")

    token = create_access_token(
        principal.username,
        role=principal.role,
        tenant_id=principal.tenant_id,
    )
    return AuthLoginResponse(
        access_token=token,
        username=principal.username,
        role=principal.role,
        tenant_id=principal.tenant_id,
    )


# ---------- USERS ----------


def _normalize_username(value: str) -> str:
    username = (value or "").strip().lower()
    if not username:
        raise HTTPException(status_code=400, detail="Username obbligatorio")
    return username


def _validate_password(value: str) -> str:
    password = (value or "").strip()
    if len(password) < settings.password_min_length:
        raise HTTPException(
            status_code=400,
            detail=f"La password deve avere almeno {settings.password_min_length} caratteri.",
        )
    return password


def _ensure_owner_not_last(
    db: Session,
    tenant_id: str,
    user_id: int,
    *,
    becoming_active_owner: bool,
) -> None:
    if becoming_active_owner:
        return
    user = (
        db.query(User)
        .filter(User.id == user_id, User.tenant_id == tenant_id)
        .first()
    )
    if not user or user.role != UserRole.owner.value or not user.is_active:
        return
    other_active_owner = (
        db.query(User)
        .filter(
            User.tenant_id == tenant_id,
            User.id != user_id,
            User.role == UserRole.owner.value,
            User.is_active.is_(True),
        )
        .first()
    )
    if not other_active_owner:
        raise HTTPException(
            status_code=400,
            detail="Impossibile rimuovere/disattivare l'ultimo owner attivo del tenant.",
        )


@router.get("/users", response_model=List[UserOut])
def list_users(request: Request, db: Session = Depends(get_db)):
    require_owner(request)
    tenant_id = normalize_tenant_id(getattr(request.state, "tenant_id", None))
    users = (
        db.query(User)
        .filter(User.tenant_id == tenant_id)
        .order_by(User.username.asc())
        .all()
    )
    return users


@router.post("/users", response_model=UserOut, status_code=201)
def create_user(payload: UserCreate, request: Request, db: Session = Depends(get_db)):
    require_owner(request)
    tenant_id = normalize_tenant_id(getattr(request.state, "tenant_id", None))
    username = _normalize_username(payload.username)
    password = _validate_password(payload.password)

    existing = (
        db.query(User)
        .filter(User.tenant_id == tenant_id, User.username == username)
        .first()
    )
    if existing:
        raise HTTPException(status_code=400, detail="Username già presente per questo tenant.")

    user = User(
        tenant_id=tenant_id,
        username=username,
        password_hash=hash_password(password),
        role=payload.role.value,
        is_active=payload.is_active,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@router.put("/users/{user_id}", response_model=UserOut)
def update_user(
    user_id: int,
    payload: UserUpdate,
    request: Request,
    db: Session = Depends(get_db),
):
    require_owner(request)
    tenant_id = normalize_tenant_id(getattr(request.state, "tenant_id", None))
    user = (
        db.query(User)
        .filter(User.id == user_id, User.tenant_id == tenant_id)
        .first()
    )
    if not user:
        raise HTTPException(status_code=404, detail="Utente non trovato")

    next_role = payload.role.value if payload.role is not None else user.role
    next_active = payload.is_active if payload.is_active is not None else user.is_active
    _ensure_owner_not_last(
        db,
        tenant_id,
        user_id,
        becoming_active_owner=(next_role == UserRole.owner.value and next_active),
    )

    if payload.username is not None:
        next_username = _normalize_username(payload.username)
        conflict = (
            db.query(User)
            .filter(
                User.tenant_id == tenant_id,
                User.username == next_username,
                User.id != user_id,
            )
            .first()
        )
        if conflict:
            raise HTTPException(
                status_code=400,
                detail="Username già presente per questo tenant.",
            )
        user.username = next_username
    if payload.role is not None:
        user.role = payload.role.value
    if payload.is_active is not None:
        user.is_active = payload.is_active

    db.commit()
    db.refresh(user)
    return user


@router.post("/users/{user_id}/reset-password", response_model=UserOut)
def reset_user_password(
    user_id: int,
    payload: UserResetPassword,
    request: Request,
    db: Session = Depends(get_db),
):
    require_owner(request)
    tenant_id = normalize_tenant_id(getattr(request.state, "tenant_id", None))
    user = (
        db.query(User)
        .filter(User.id == user_id, User.tenant_id == tenant_id)
        .first()
    )
    if not user:
        raise HTTPException(status_code=404, detail="Utente non trovato")
    user.password_hash = hash_password(_validate_password(payload.new_password))
    db.commit()
    db.refresh(user)
    return user


@router.delete("/users/{user_id}", status_code=204)
def delete_user(user_id: int, request: Request, db: Session = Depends(get_db)):
    require_owner(request)
    tenant_id = normalize_tenant_id(getattr(request.state, "tenant_id", None))
    current_username = (getattr(request.state, "user", "") or "").strip().lower()
    user = (
        db.query(User)
        .filter(User.id == user_id, User.tenant_id == tenant_id)
        .first()
    )
    if not user:
        raise HTTPException(status_code=404, detail="Utente non trovato")
    if user.username == current_username:
        raise HTTPException(status_code=400, detail="Non puoi eliminare il tuo utente corrente.")
    _ensure_owner_not_last(
        db,
        tenant_id,
        user_id,
        becoming_active_owner=False,
    )
    db.delete(user)
    db.commit()
    return
