import os
import csv
import io
from contextlib import asynccontextmanager
from datetime import date, timedelta, time, datetime, timezone
from typing import Optional, Dict, List
from enum import Enum

from fastapi import FastAPI, Depends, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from prometheus_fastapi_instrumentator import Instrumentator
from sqlalchemy.orm import Session
from pydantic import BaseModel, ConfigDict, field_serializer

from app.db import get_db
from app.api.middlewares import authentication, request_logging
from app.bootstrap import initialize_schema_and_seed
from app.core.auth import (
    ALLOWED_ROLES,
    authenticate_user,
    create_access_token,
    hash_password,
    validate_password_policy,
    validate_auth_configuration,
    verify_password,
)
from app.core.config import settings
from app.core.logging import setup_logging
from app.core.tenant import normalize_tenant_id, reset_current_tenant_id, set_current_tenant_id
from app.main_types import StaffRole
from app.models.unit import Unit
from app.models.booking import Booking
from app.models.staff_task import StaffTask
from app.models.cost_item import CostItem
from app.models.audit_log import AuditLog
from app.models.staff_defaults import StaffDefaults
from app.models.staff_member import StaffMember
from app.models.pricing_defaults import PricingDefaults
from app.models.maintenance import MaintenanceTicket
from app.models.tenant import Tenant
from app.models.user import User


setup_logging()


@asynccontextmanager
async def lifespan(_app: FastAPI):
    validate_auth_configuration()
    initialize_schema_and_seed()
    yield


app = FastAPI(title="Portale Essaouira API", lifespan=lifespan)
Instrumentator().instrument(app).expose(app, endpoint="/metrics", include_in_schema=False)

cors_origins_raw = os.getenv(
    "CORS_ORIGINS",
    "http://localhost:5173,http://127.0.0.1:5173",
)
origins = [origin.strip() for origin in cors_origins_raw.split(",") if origin.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.middleware("http")(request_logging)
app.middleware("http")(authentication)


# ---------- HEALTH CHECK ----------

@app.get("/health")
def health():
    return {"status": "ok"}


class AuthLoginRequest(BaseModel):
    username: str
    password: str
    tenant_id: str | None = None


class AuthLoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    username: str
    role: str
    tenant_id: str
    must_change_password: bool = False


class AuthMeResponse(BaseModel):
    username: str
    role: str
    tenant_id: str
    must_change_password: bool = False


class AuthChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str


@app.post("/auth/login", response_model=AuthLoginResponse)
def auth_login(payload: AuthLoginRequest, db: Session = Depends(get_db)):
    if not settings.auth_enabled:
        token = create_access_token("anonymous", role="owner", tenant_id="default")
        return AuthLoginResponse(
            access_token=token,
            username="anonymous",
            role="owner",
            tenant_id="default",
        )

    tenant_id = normalize_tenant_id(payload.tenant_id or settings.admin_tenant_id)
    role = None
    must_change_password = False

    tenant = db.query(Tenant).filter(Tenant.tenant_id == tenant_id, Tenant.is_active.is_(True)).first()
    if tenant is None:
        raise HTTPException(status_code=401, detail="Tenant non valido")

    tenant_token = set_current_tenant_id(tenant_id)
    try:
        db_user = (
            db.query(User)
            .filter(User.username == payload.username, User.is_active.is_(True))
            .first()
        )
    finally:
        reset_current_tenant_id(tenant_token)

    if db_user and verify_password(payload.password, db_user.password_hash):
        role = db_user.role
        must_change_password = bool(db_user.must_change_password)
    elif authenticate_user(payload.username, payload.password):
        if tenant_id != normalize_tenant_id(settings.admin_tenant_id):
            raise HTTPException(status_code=401, detail="Credenziali non valide")
        role = settings.admin_role
    else:
        raise HTTPException(status_code=401, detail="Credenziali non valide")

    token = create_access_token(payload.username, role=role, tenant_id=tenant_id)
    return AuthLoginResponse(
        access_token=token,
        username=payload.username,
        role=role,
        tenant_id=tenant_id,
        must_change_password=must_change_password,
    )


@app.get("/auth/me", response_model=AuthMeResponse)
def auth_me(request: Request, db: Session = Depends(get_db)):
    username = getattr(request.state, "user", None)
    role = getattr(request.state, "role", None)
    tenant_id = getattr(request.state, "tenant_id", None)
    if not username:
        raise HTTPException(status_code=401, detail="Not authenticated")

    user = db.query(User).filter(User.username == username).first()
    must_change_password = bool(user.must_change_password) if user else False
    return AuthMeResponse(
        username=username,
        role=role,
        tenant_id=tenant_id,
        must_change_password=must_change_password,
    )


def _enforce_password_policy(password: str) -> None:
    errors = validate_password_policy(password, min_length=settings.password_min_length)
    if errors:
        raise HTTPException(status_code=400, detail="; ".join(errors))


@app.post("/auth/change-password")
def auth_change_password(
    payload: AuthChangePasswordRequest, request: Request, db: Session = Depends(get_db)
):
    username = getattr(request.state, "user", None)
    if not username:
        raise HTTPException(status_code=401, detail="Not authenticated")

    user = db.query(User).filter(User.username == username, User.is_active.is_(True)).first()
    if not user:
        raise HTTPException(status_code=404, detail="Utente non trovato")
    if not verify_password(payload.current_password, user.password_hash):
        raise HTTPException(status_code=400, detail="Password attuale non valida")

    _enforce_password_policy(payload.new_password)
    user.password_hash = hash_password(payload.new_password)
    user.must_change_password = False
    user.last_password_change_at = datetime.now(timezone.utc)
    db.commit()
    return {"status": "ok"}


def _require_role(request: Request, allowed_roles: set[str]) -> None:
    role = getattr(request.state, "role", None)
    if role not in allowed_roles:
        raise HTTPException(status_code=403, detail="Forbidden")


def _require_platform_owner(request: Request) -> None:
    username = getattr(request.state, "user", None)
    role = getattr(request.state, "role", None)
    tenant_id = normalize_tenant_id(getattr(request.state, "tenant_id", None))
    if (
        role != "owner"
        or username != settings.admin_username
        or tenant_id != normalize_tenant_id(settings.admin_tenant_id)
    ):
        raise HTTPException(status_code=403, detail="Forbidden")


class UserCreateRequest(BaseModel):
    username: str
    password: str
    role: str = "viewer"
    is_active: bool = True


class UserUpdateRequest(BaseModel):
    password: str | None = None
    role: str | None = None
    is_active: bool | None = None


class UserResetPasswordRequest(BaseModel):
    new_password: str
    must_change_on_login: bool = True


class UserOut(BaseModel):
    id: int
    username: str
    role: str
    is_active: bool
    must_change_password: bool
    last_password_change_at: datetime | None = None
    created_at: datetime | None = None

    model_config = ConfigDict(from_attributes=True)


class AuditLogOut(BaseModel):
    id: int
    event_type: str
    username: str | None = None
    role: str | None = None
    method: str
    path: str
    status_code: int
    client_ip: str | None = None
    details: str | None = None
    created_at: datetime | None = None

    model_config = ConfigDict(from_attributes=True)


class TenantCreateRequest(BaseModel):
    tenant_id: str
    name: str
    owner_username: str
    owner_password: str


class TenantOut(BaseModel):
    tenant_id: str
    name: str
    is_active: bool
    created_at: datetime | None = None

    model_config = ConfigDict(from_attributes=True)


class CompliancePolicyOut(BaseModel):
    company_name: str
    privacy_email: str
    terms_url: str
    privacy_url: str


@app.get("/users", response_model=list[UserOut])
def list_users(request: Request, db: Session = Depends(get_db)):
    _require_role(request, {"owner"})
    return db.query(User).order_by(User.username).all()


@app.post("/users", response_model=UserOut)
def create_user(payload: UserCreateRequest, request: Request, db: Session = Depends(get_db)):
    _require_role(request, {"owner"})
    role = payload.role.strip().lower()
    if role not in ALLOWED_ROLES:
        raise HTTPException(status_code=400, detail="Ruolo non valido")

    username = payload.username.strip()
    if not username:
        raise HTTPException(status_code=400, detail="Username obbligatorio")
    _enforce_password_policy(payload.password)

    existing = db.query(User).filter(User.username == username).first()
    if existing:
        raise HTTPException(status_code=409, detail="Username gia esistente")

    user = User(
        username=username,
        password_hash=hash_password(payload.password),
        role=role,
        is_active=payload.is_active,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@app.put("/users/{user_id}", response_model=UserOut)
def update_user(
    user_id: int, payload: UserUpdateRequest, request: Request, db: Session = Depends(get_db)
):
    _require_role(request, {"owner"})
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Utente non trovato")

    if payload.role is not None:
        role = payload.role.strip().lower()
        if role not in ALLOWED_ROLES:
            raise HTTPException(status_code=400, detail="Ruolo non valido")
        user.role = role

    if payload.password is not None:
        _enforce_password_policy(payload.password)
        user.password_hash = hash_password(payload.password)
        user.must_change_password = False
        user.last_password_change_at = datetime.now(timezone.utc)

    if payload.is_active is not None:
        user.is_active = payload.is_active

    db.commit()
    db.refresh(user)
    return user


@app.post("/users/{user_id}/reset-password", response_model=UserOut)
def reset_user_password(
    user_id: int,
    payload: UserResetPasswordRequest,
    request: Request,
    db: Session = Depends(get_db),
):
    _require_role(request, {"owner"})
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Utente non trovato")

    _enforce_password_policy(payload.new_password)
    user.password_hash = hash_password(payload.new_password)
    user.must_change_password = payload.must_change_on_login
    user.last_password_change_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(user)
    return user


@app.get("/audit-logs", response_model=list[AuditLogOut])
def list_audit_logs(
    request: Request,
    db: Session = Depends(get_db),
    limit: int = Query(default=100, ge=1, le=500),
    from_date: datetime | None = None,
    to_date: datetime | None = None,
    username: str | None = None,
):
    _require_role(request, {"owner"})
    q = db.query(AuditLog).order_by(AuditLog.created_at.desc())
    if from_date:
        q = q.filter(AuditLog.created_at >= from_date)
    if to_date:
        q = q.filter(AuditLog.created_at <= to_date)
    if username:
        q = q.filter(AuditLog.username == username)
    return q.limit(limit).all()


@app.get("/platform/tenants", response_model=list[TenantOut])
def list_platform_tenants(request: Request, db: Session = Depends(get_db)):
    _require_platform_owner(request)
    return db.query(Tenant).order_by(Tenant.created_at.desc()).all()


@app.post("/platform/tenants", response_model=TenantOut)
def create_platform_tenant(
    payload: TenantCreateRequest, request: Request, db: Session = Depends(get_db)
):
    _require_platform_owner(request)
    tenant_id = normalize_tenant_id(payload.tenant_id)
    if not tenant_id:
        raise HTTPException(status_code=400, detail="tenant_id obbligatorio")
    _enforce_password_policy(payload.owner_password)
    owner_username = payload.owner_username.strip()
    if not owner_username:
        raise HTTPException(status_code=400, detail="owner_username obbligatorio")

    existing_tenant = db.query(Tenant).filter(Tenant.tenant_id == tenant_id).first()
    if existing_tenant:
        raise HTTPException(status_code=409, detail="Tenant gia esistente")

    tenant = Tenant(tenant_id=tenant_id, name=payload.name.strip() or tenant_id, is_active=True)
    db.add(tenant)
    db.commit()
    db.refresh(tenant)

    token = set_current_tenant_id(tenant_id)
    try:
        existing_owner = db.query(User).filter(User.username == owner_username).first()
        if existing_owner:
            raise HTTPException(status_code=409, detail="Owner username gia esistente nel tenant")
        owner = User(
            username=owner_username,
            password_hash=hash_password(payload.owner_password),
            role="owner",
            is_active=True,
            must_change_password=False,
            last_password_change_at=datetime.now(timezone.utc),
        )
        db.add(owner)
        db.commit()
    finally:
        reset_current_tenant_id(token)

    return tenant


@app.get("/audit-logs.csv")
def download_audit_logs_csv(
    request: Request,
    db: Session = Depends(get_db),
    limit: int = Query(default=1000, ge=1, le=10000),
    from_date: datetime | None = None,
    to_date: datetime | None = None,
    username: str | None = None,
):
    _require_role(request, {"owner"})
    q = db.query(AuditLog).order_by(AuditLog.created_at.desc())
    if from_date:
        q = q.filter(AuditLog.created_at >= from_date)
    if to_date:
        q = q.filter(AuditLog.created_at <= to_date)
    if username:
        q = q.filter(AuditLog.username == username)
    logs = q.limit(limit).all()

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(
        [
            "id",
            "created_at",
            "event_type",
            "username",
            "role",
            "method",
            "path",
            "status_code",
            "client_ip",
            "details",
        ]
    )
    for log in logs:
        writer.writerow(
            [
                log.id,
                log.created_at,
                log.event_type,
                log.username,
                log.role,
                log.method,
                log.path,
                log.status_code,
                log.client_ip,
                log.details,
            ]
        )

    return Response(
        content=output.getvalue(),
        media_type="text/csv",
        headers={"Content-Disposition": 'attachment; filename="audit_logs.csv"'},
    )


@app.get("/compliance/policy", response_model=CompliancePolicyOut)
def get_compliance_policy():
    return CompliancePolicyOut(
        company_name=settings.compliance_company_name,
        privacy_email=settings.compliance_privacy_email,
        terms_url=settings.compliance_terms_url,
        privacy_url=settings.compliance_privacy_url,
    )


# ---------- UNITS ----------


class UnitOut(BaseModel):
    id: int
    name: str
    size_m2: int | None
    capacity: int | None
    base_nightly_rate: float | None
    currency: str

    model_config = ConfigDict(from_attributes=True)


class UnitUpdate(BaseModel):
    name: str | None = None
    size_m2: int | None = None
    capacity: int | None = None
    base_nightly_rate: float | None = None
    currency: str | None = None


@app.get("/units", response_model=list[UnitOut])
def list_units(db: Session = Depends(get_db)):
    units = db.query(Unit).all()
    return units


@app.put("/units/{unit_id}", response_model=UnitOut)
def update_unit(unit_id: int, payload: UnitUpdate, db: Session = Depends(get_db)):
    unit = db.query(Unit).filter(Unit.id == unit_id).first()
    if not unit:
        raise HTTPException(status_code=404, detail="Unità non trovata")

    if payload.name is not None:
        unit.name = payload.name
    if payload.size_m2 is not None:
        unit.size_m2 = payload.size_m2
    if payload.capacity is not None:
        unit.capacity = payload.capacity
    if payload.base_nightly_rate is not None:
        unit.base_nightly_rate = payload.base_nightly_rate
    if payload.currency is not None:
        unit.currency = payload.currency

    db.commit()
    db.refresh(unit)
    return unit


# ---------- BOOKING Schemas ----------


class BookingBase(BaseModel):
    unit_id: int
    guest_name: str
    guest_email: str | None = None
    
    guest_phone: str | None = None
    num_adults: int = 1
    num_children: int = 0
    estimated_arrival_time: time | None = None  

    source: str = "direct"
    checkin_date: date
    checkout_date: date
    notes: str | None = None

    # campi economici
    nightly_rate: float | None = None
    total_price: float | None = None
    cleaning_fee: float | None = None
    city_tax: float | None = None
    channel_fee: float | None = None
    currency: str = "EUR"
    is_paid: bool = False

    # late check-out
    has_late_checkout: bool = False

    model_config = ConfigDict(
        from_attributes=True,
    )

    @field_serializer("estimated_arrival_time", when_used="json")
    def serialize_estimated_arrival_time(self, value: time | None):
        if value is None:
            return None
        return value.strftime("%H:%M")


class BookingCreate(BookingBase):
    pass


class BookingUpdate(BookingBase):
    pass


class BookingOut(BookingBase):
    id: int


# ---------- HELPERS: TIME, DEFAULTS & LOGIC ----------

def _parse_time_str(value: str | None) -> Optional[time]:
    if not value:
        return None
    value = value.strip()
    if not value:
        return None
    try:
        return datetime.strptime(value, "%H:%M").time()
    except ValueError:
        try:
            return datetime.strptime(value, "%H:%M:%S").time()
        except ValueError:
            raise HTTPException(
                status_code=400,
                detail="Formato orario non valido. Usa HH:MM o HH:MM:SS.",
            )

def _format_time_value(t: Optional[time]) -> Optional[str]:
    if t is None:
        return None
    return t.strftime("%H:%M")


def _get_or_create_staff_defaults(db: Session) -> StaffDefaults:
    defaults = db.query(StaffDefaults).first()
    if not defaults:
        defaults = StaffDefaults(
            cleaning_default_assignee="Operatore 1",
            cleaning_default_cost=5.0,
            cleaning_default_hours=1.0,
            currency="EUR",
        )
        db.add(defaults)
        db.commit()
        db.refresh(defaults)
    return defaults


def _get_or_create_pricing_defaults(db: Session) -> PricingDefaults:
    pricing = db.query(PricingDefaults).first()
    if not pricing:
        pricing = PricingDefaults(
            default_cleaning_fee=None,
            default_city_tax_per_night=None,
            default_channel_commission_percent=None,
            currency="EUR",
        )
        db.add(pricing)
        db.commit()
        db.refresh(pricing)
    return pricing


def _find_default_assignee_for_role(
    db: Session,
    role: StaffRole,
    fallback_name: str | None = None,
) -> str | None:
    member = (
        db.query(StaffMember)
        .filter(
            StaffMember.role == role.value,
            StaffMember.is_active.is_(True),
        )
        .order_by(StaffMember.id)
        .first()
    )
    if member:
        return member.name
    return fallback_name


def _create_auto_staff_tasks_for_booking(db: Session, booking: Booking):
    defaults = _get_or_create_staff_defaults(db)

    db.query(StaffTask).filter(
        StaffTask.booking_id == booking.id,
        StaffTask.notes.ilike("AUTO:%"),
    ).delete(synchronize_session=False)

    if not booking.checkin_date or not booking.checkout_date:
        db.commit()
        return

    is_late = bool(getattr(booking, "has_late_checkout", False))

    base_hours = defaults.cleaning_default_hours or 1.0
    currency = defaults.currency or "EUR"

    housekeeping_assignee = _find_default_assignee_for_role(
        db, StaffRole.housekeeping, defaults.cleaning_default_assignee
    )
    reception_assignee = _find_default_assignee_for_role(
        db, StaffRole.reception_day, housekeeping_assignee
    )
    kitchen_assignee = _find_default_assignee_for_role(
        db, StaffRole.kitchen, housekeeping_assignee
    )

    checkout_time_obj = time(10, 0)
    cleaning_time_obj = time(11, 0)

    if is_late:
        checkout_time_obj = time(16, 0)
        cleaning_time_obj = time(17, 0)

    # 1) CHECK-IN
    checkin_task = StaffTask(
        date=booking.checkin_date,
        time=time(15, 0),
        task_type="checkin",
        assignee_name=reception_assignee,
        estimated_hours=base_hours,
        status="planned",
        notes=f"AUTO: Check-in per prenotazione #{booking.id}",
        cost=None,
        currency=currency,
        booking_id=booking.id,
        unit_id=booking.unit_id,
    )
    db.add(checkin_task)

    # 2) CHECK-OUT
    checkout_task = StaffTask(
        date=booking.checkout_date,
        time=checkout_time_obj,
        task_type="checkout",
        assignee_name=reception_assignee,
        estimated_hours=base_hours,
        status="planned",
        notes=(
            f"AUTO: Check-out (late) per prenotazione #{booking.id}"
            if is_late
            else f"AUTO: Check-out per prenotazione #{booking.id}"
        ),
        cost=None,
        currency=currency,
        booking_id=booking.id,
        unit_id=booking.unit_id,
    )
    db.add(checkout_task)

    # 3) PULIZIA
    cleaning_task = StaffTask(
        date=booking.checkout_date,
        time=cleaning_time_obj,
        task_type="cleaning",
        assignee_name=housekeeping_assignee,
        estimated_hours=base_hours if not is_late else base_hours * 1.5,
        status="planned",
        notes=(
            f"AUTO: Pulizia post late check-out per prenotazione #{booking.id}"
            if is_late
            else f"AUTO: Pulizia per prenotazione #{booking.id}"
        ),
        cost=None,
        currency=currency,
        booking_id=booking.id,
        unit_id=booking.unit_id,
    )
    db.add(cleaning_task)

    # 4) Extra pulizia se late check-out
    if is_late:
        extra_clean_task = StaffTask(
            date=booking.checkout_date,
            time=time(19, 0),
            task_type="cleaning",
            assignee_name=housekeeping_assignee,
            estimated_hours=base_hours * 0.5,
            status="planned",
            notes=f"AUTO: Extra pulizia (late check-out) per prenotazione #{booking.id}",
            cost=None,
            currency=currency,
            booking_id=booking.id,
            unit_id=booking.unit_id,
        )
        db.add(extra_clean_task)

    # 5) COLAZIONI
    current = booking.checkin_date + timedelta(days=1)
    last_breakfast_day = booking.checkout_date - timedelta(days=1)

    while current <= last_breakfast_day:
        breakfast_task = StaffTask(
            date=current,
            time=time(8, 30),
            task_type="breakfast",
            assignee_name=kitchen_assignee,
            estimated_hours=base_hours * 0.5,
            status="planned",
            notes=f"AUTO: Colazione per prenotazione #{booking.id}",
            cost=None,
            currency=currency,
            booking_id=booking.id,
            unit_id=booking.unit_id,
        )
        db.add(breakfast_task)
        current += timedelta(days=1)

    db.commit()


# ---------- BOOKING endpoints ----------


@app.get("/bookings", response_model=list[BookingOut])
def list_bookings(db: Session = Depends(get_db)):
    bookings = db.query(Booking).order_by(Booking.checkin_date).all()
    return bookings


@app.post("/bookings", response_model=BookingOut)
def create_booking(payload: BookingCreate, db: Session = Depends(get_db)):
    unit = db.query(Unit).filter(Unit.id == payload.unit_id).first()
    if not unit:
        raise HTTPException(status_code=400, detail="Unità inesistente")

    if payload.checkout_date <= payload.checkin_date:
        raise HTTPException(
            status_code=400,
            detail="checkout_date deve essere dopo checkin_date",
        )

    conflict = (
        db.query(Booking)
        .filter(
            Booking.unit_id == payload.unit_id,
            Booking.checkin_date < payload.checkout_date,
            Booking.checkout_date > payload.checkin_date,
        )
        .first()
    )
    if conflict:
        raise HTTPException(
            status_code=400,
            detail="Esiste già una prenotazione per questa unità nelle date selezionate.",
        )

    nights = (payload.checkout_date - payload.checkin_date).days
    nightly_rate = (
        payload.nightly_rate
        if payload.nightly_rate is not None
        else unit.base_nightly_rate
    )
    base_total = None
    if nightly_rate is not None:
        base_total = float(nightly_rate) * nights

    total_price = payload.total_price or base_total

    pricing = _get_or_create_pricing_defaults(db)

    cleaning_fee = payload.cleaning_fee
    if cleaning_fee is None and getattr(pricing, "default_cleaning_fee", None) is not None:
        cleaning_fee = float(pricing.default_cleaning_fee)

    city_tax = payload.city_tax
    if city_tax is None and getattr(pricing, "default_city_tax_per_night", None) is not None:
        city_tax = float(pricing.default_city_tax_per_night) * nights

    channel_fee = payload.channel_fee
    if (
        channel_fee is None
        and getattr(pricing, "default_channel_commission_percent", None) is not None
        and total_price is not None
    ):
        channel_fee = (
            float(pricing.default_channel_commission_percent)
            * float(total_price)
            / 100.0
        )

    booking = Booking(
        unit_id=payload.unit_id,
        guest_name=payload.guest_name,
        guest_email=payload.guest_email,
        guest_phone=payload.guest_phone,
        num_adults=payload.num_adults,
        num_children=payload.num_children,
        estimated_arrival_time=payload.estimated_arrival_time, 
        
        source=payload.source,
        checkin_date=payload.checkin_date,
        checkout_date=payload.checkout_date,
        notes=payload.notes,
        nightly_rate=nightly_rate,
        total_price=total_price,
        cleaning_fee=cleaning_fee,
        city_tax=city_tax,
        channel_fee=channel_fee,
        currency=payload.currency,
        is_paid=payload.is_paid,
        has_late_checkout=payload.has_late_checkout,
    )
    db.add(booking)
    db.commit()
    db.refresh(booking)

    _create_auto_staff_tasks_for_booking(db, booking)

    return booking


@app.put("/bookings/{booking_id}", response_model=BookingOut)
def update_booking(
    booking_id: int, payload: BookingUpdate, db: Session = Depends(get_db)
):
    booking = db.query(Booking).filter(Booking.id == booking_id).first()
    if not booking:
        raise HTTPException(status_code=404, detail="Prenotazione non trovata")

    unit = db.query(Unit).filter(Unit.id == payload.unit_id).first()
    if not unit:
        raise HTTPException(status_code=400, detail="Unità inesistente")

    if payload.checkout_date <= payload.checkin_date:
        raise HTTPException(
            status_code=400,
            detail="checkout_date deve essere dopo checkin_date",
        )

    conflict = (
        db.query(Booking)
        .filter(
            Booking.unit_id == payload.unit_id,
            Booking.id != booking_id,
            Booking.checkin_date < payload.checkout_date,
            Booking.checkout_date > payload.checkin_date,
        )
        .first()
    )
    if conflict:
        raise HTTPException(
            status_code=400,
            detail="Esiste già una prenotazione per questa unità nelle date selezionate.",
        )

    nights = (payload.checkout_date - payload.checkin_date).days
    nightly_rate = (
        payload.nightly_rate
        if payload.nightly_rate is not None
        else unit.base_nightly_rate
    )
    base_total = None
    if nightly_rate is not None:
        base_total = float(nightly_rate) * nights

    total_price = payload.total_price or base_total

    pricing = _get_or_create_pricing_defaults(db)

    cleaning_fee = payload.cleaning_fee
    if cleaning_fee is None and getattr(pricing, "default_cleaning_fee", None) is not None:
        cleaning_fee = float(pricing.default_cleaning_fee)

    city_tax = payload.city_tax
    if city_tax is None and getattr(pricing, "default_city_tax_per_night", None) is not None:
        city_tax = float(pricing.default_city_tax_per_night) * nights

    channel_fee = payload.channel_fee
    if (
        channel_fee is None
        and getattr(pricing, "default_channel_commission_percent", None) is not None
        and total_price is not None
    ):
        channel_fee = (
            float(pricing.default_channel_commission_percent)
            * float(total_price)
            / 100.0
        )

    booking.unit_id = payload.unit_id
    booking.guest_name = payload.guest_name
    booking.guest_email = payload.guest_email
    
    booking.guest_phone = payload.guest_phone
    booking.num_adults = payload.num_adults
    booking.num_children = payload.num_children
    booking.estimated_arrival_time = payload.estimated_arrival_time

    booking.source = payload.source
    booking.checkin_date = payload.checkin_date
    booking.checkout_date = payload.checkout_date
    booking.notes = payload.notes
    booking.nightly_rate = nightly_rate
    booking.total_price = total_price
    booking.cleaning_fee = cleaning_fee
    booking.city_tax = city_tax
    booking.channel_fee = channel_fee
    booking.currency = payload.currency
    booking.is_paid = payload.is_paid
    booking.has_late_checkout = payload.has_late_checkout

    db.commit()
    db.refresh(booking)

    _create_auto_staff_tasks_for_booking(db, booking)

    return booking


@app.delete("/bookings/{booking_id}", status_code=204)
def delete_booking(booking_id: int, db: Session = Depends(get_db)):
    booking = db.query(Booking).filter(Booking.id == booking_id).first()
    if not booking:
        raise HTTPException(status_code=404, detail="Prenotazione non trovata")

    db.delete(booking)
    db.commit()
    return


# ---------- UNIT SCHEDULE (TIMELINE SINGOLA UNITÀ) ----------


@app.get("/units/{unit_id}/schedule")
def get_unit_schedule(
    unit_id: int,
    from_date: date | None = None,
    to_date: date | None = None,
    db: Session = Depends(get_db),
):
    unit = db.query(Unit).filter(Unit.id == unit_id).first()
    if not unit:
        raise HTTPException(status_code=404, detail="Unità non trovata")

    if from_date is None or to_date is None:
        today = date.today()
        month_start = today.replace(day=1)
        if month_start.month == 12:
            next_month_start = date(month_start.year + 1, 1, 1)
        else:
            next_month_start = date(month_start.year, month_start.month + 1, 1)
        from_date = from_date or month_start
        to_date = to_date or next_month_start

    bookings = (
        db.query(Booking)
        .filter(
            Booking.unit_id == unit_id,
            Booking.checkin_date < to_date,
            Booking.checkout_date > from_date,
        )
        .order_by(Booking.checkin_date)
        .all()
    )

    staff_tasks = (
        db.query(StaffTask)
        .filter(
            StaffTask.unit_id == unit_id,
            StaffTask.date >= from_date,
            StaffTask.date <= to_date,
        )
        .order_by(StaffTask.date)
        .all()
    )

    items: list[dict] = []

    for b in bookings:
        items.append(
            {
                "kind": "booking",
                "id": b.id,
                "unit_id": unit.id,
                "label": b.guest_name or f"Booking #{b.id}",
                "start_date": b.checkin_date,
                "end_date": b.checkout_date,
                "source": b.source,
                "is_paid": b.is_paid,
                "total_price": b.total_price,
            }
        )

    for t in staff_tasks:
        items.append(
            {
                "kind": "staff_task",
                "id": t.id,
                "unit_id": unit.id,
                "label": t.task_type,
                "date": t.date,
                "task_type": t.task_type,
                "assignee_name": t.assignee_name,
                "status": t.status,
                "estimated_hours": t.estimated_hours,
                "cost": t.cost,
                "currency": t.currency,
            }
        )

    def sort_key(item: dict):
        if item["kind"] == "booking":
            return (item["start_date"], 0)
        else:
            return (item["date"], 1)

    items.sort(key=sort_key)

    return {
        "unit_id": unit.id,
        "unit_name": unit.name,
        "from_date": from_date,
        "to_date": to_date,
        "items": items,
        "bookings": [
            {
                "id": b.id,
                "guest_name": b.guest_name,
                "checkin_date": b.checkin_date,
                "checkout_date": b.checkout_date,
                "source": b.source,
                "total_price": b.total_price,
                "is_paid": b.is_paid,
            }
            for b in bookings
        ],
        "staff_tasks": [
            {
                "id": t.id,
                "date": t.date,
                "task_type": t.task_type,
                "assignee_name": t.assignee_name,
                "status": t.status,
                "estimated_hours": t.estimated_hours,
                "cost": t.cost,
                "currency": t.currency,
            }
            for t in staff_tasks
        ],
    }


# ---------- ANALYTICS / BUSINESS ----------


class RevenueByUnit(BaseModel):
    unit_id: int
    unit_name: str
    revenue: float
    nights_occupied: int


class MonthSummary(BaseModel):
    year: int
    month: int
    nights_total: int
    nights_occupied: int
    occupancy_rate: float
    revenue_total: float
    adr: float | None  # Average Daily Rate
    revenue_by_source: dict[str, float]
    revenue_by_unit: list[RevenueByUnit]


@app.get("/analytics/month-summary", response_model=MonthSummary)
def month_summary(
    year: int = Query(..., ge=2000, le=2100),
    month: int = Query(..., ge=1, le=12),
    db: Session = Depends(get_db),
):
    month_start = date(year, month, 1)
    if month == 12:
        next_month_start = date(year + 1, 1, 1)
    else:
        next_month_start = date(year, month + 1, 1)
    days_in_month = (next_month_start - month_start).days

    bookings = (
        db.query(Booking)
        .filter(
            Booking.checkin_date < next_month_start,
            Booking.checkout_date > month_start,
        )
        .all()
    )

    units_count = db.query(Unit).count()
    nights_total = days_in_month * units_count

    occupied_nights = 0
    revenue_total = 0.0
    revenue_by_source: dict[str, float] = {}
    revenue_by_unit_map: dict[int, RevenueByUnit] = {}

    for b in bookings:
        stay_start = max(b.checkin_date, month_start)
        stay_end = min(b.checkout_date, next_month_start)
        nights_in_month = (stay_end - stay_start).days

        occupied_nights += nights_in_month

        if (
            b.total_price is not None
            and b.checkin_date >= month_start
            and b.checkout_date <= next_month_start
        ):
            booking_revenue = float(b.total_price)
        else:
            if b.nightly_rate is not None:
                booking_revenue = float(b.nightly_rate) * nights_in_month
            else:
                booking_revenue = 0.0

        revenue_total += booking_revenue

        src = b.source or "unknown"
        revenue_by_source[src] = revenue_by_source.get(src, 0.0) + booking_revenue

        u = b.unit
        if not u:
            continue

        existing = revenue_by_unit_map.get(u.id)
        if existing is None:
            revenue_by_unit_map[u.id] = RevenueByUnit(
                unit_id=u.id,
                unit_name=u.name,
                revenue=booking_revenue,
                nights_occupied=nights_in_month,
            )
        else:
            existing.revenue += booking_revenue
            existing.nights_occupied += nights_in_month

    occupancy_rate = (
        (occupied_nights / nights_total) * 100 if nights_total > 0 else 0.0
    )
    adr = revenue_total / occupied_nights if occupied_nights > 0 else None

    return MonthSummary(
        year=year,
        month=month,
        nights_total=nights_total,
        nights_occupied=occupied_nights,
        occupancy_rate=round(occupancy_rate, 2),
        revenue_total=round(revenue_total, 2),
        adr=round(adr, 2) if adr is not None else None,
        revenue_by_source={k: round(v, 2) for k, v in revenue_by_source.items()},
        revenue_by_unit=list(revenue_by_unit_map.values()),
    )


# ---------- ANALYTICS: PROFIT & LOSS (Ricavi - Costi) ----------


class CostByCategory(BaseModel):
    category: str
    total: float


class PnLMonthSummary(BaseModel):
    year: int
    month: int

    nights_total: int
    nights_occupied: int
    occupancy_rate: float
    adr: float | None

    revenue_total: float
    revenue_by_source: Dict[str, float]
    revenue_by_unit: List[RevenueByUnit]

    costs_total: float
    costs_by_category: List[CostByCategory]

    profit: float


class MonthCostLine(BaseModel):
    date: date
    category: str
    description: str | None = None
    amount: float
    currency: str = "EUR"
    unit_id: int | None = None
    booking_id: int | None = None
    staff_task_id: int | None = None
    origin: str

    model_config = ConfigDict(from_attributes=True)


def _get_month_range(year: int, month: int):
    month_start = date(year, month, 1)
    if month == 12:
        next_month_start = date(year + 1, 1, 1)
    else:
        next_month_start = date(year, month + 1, 1)
    days_in_month = (next_month_start - month_start).days
    return month_start, next_month_start, days_in_month


def _collect_costs_for_month(
    db: Session, month_start: date, next_month_start: date
):
    costs_total = 0.0
    costs_by_category_map: Dict[str, float] = {}
    cost_lines: list[dict] = []

    # --- Costi manuali (CostItem) ---
    cost_items = (
        db.query(CostItem)
        .filter(
            CostItem.date >= month_start,
            CostItem.date < next_month_start,
        )
        .all()
    )

    for c in cost_items:
        amount = float(c.amount)
        costs_total += amount
        cat = c.category or "Altro"
        costs_by_category_map[cat] = costs_by_category_map.get(cat, 0.0) + amount

        cost_lines.append(
            {
                "date": c.date,
                "category": cat,
                "description": c.description,
                "amount": amount,
                "currency": c.currency or "EUR",
                "unit_id": c.unit_id,
                "booking_id": None,
                "staff_task_id": None,
                "origin": "manual",
            }
        )

    # --- Costi da prenotazioni (cleaning_fee, channel_fee, city_tax) ---
    bookings_for_costs = (
        db.query(Booking)
        .filter(
            Booking.checkout_date >= month_start,
            Booking.checkout_date < next_month_start,
        )
        .all()
    )

    for b in bookings_for_costs:
        desc = (
            f"Prenotazione #{b.id} - {b.guest_name}"
            if b.guest_name
            else f"Prenotazione #{b.id}"
        )
        curr = b.currency or "EUR"

        # cleaning fee
        if b.cleaning_fee is not None:
            cf = float(b.cleaning_fee)
            costs_total += cf
            cat = "Booking - Cleaning fee"
            costs_by_category_map[cat] = costs_by_category_map.get(cat, 0.0) + cf

            cost_lines.append(
                {
                    "date": b.checkout_date,
                    "category": cat,
                    "description": desc,
                    "amount": cf,
                    "currency": curr,
                    "unit_id": b.unit_id,
                    "booking_id": b.id,
                    "staff_task_id": None,
                    "origin": "booking_cleaning_fee",
                }
            )

        # commissioni canale
        if b.channel_fee is not None:
            ch = float(b.channel_fee)
            costs_total += ch
            cat = "Booking - Channel fee"
            costs_by_category_map[cat] = costs_by_category_map.get(cat, 0.0) + ch

            cost_lines.append(
                {
                    "date": b.checkout_date,
                    "category": cat,
                    "description": desc,
                    "amount": ch,
                    "currency": curr,
                    "unit_id": b.unit_id,
                    "booking_id": b.id,
                    "staff_task_id": None,
                    "origin": "booking_channel_fee",
                }
            )

        # tassa di soggiorno → trattata come costo/pass-through
        if b.city_tax is not None:
            ct = float(b.city_tax)
            costs_total += ct
            cat = "Booking - City tax"
            costs_by_category_map[cat] = costs_by_category_map.get(cat, 0.0) + ct

            cost_lines.append(
                {
                    "date": b.checkout_date,
                    "category": cat,
                    "description": desc,
                    "amount": ct,
                    "currency": curr,
                    "unit_id": b.unit_id,
                    "booking_id": b.id,
                    "staff_task_id": None,
                    "origin": "booking_city_tax",
                }
            )

    # --- Costi staff (StaffTask.cost) ---
    staff_tasks = (
        db.query(StaffTask)
        .filter(
            StaffTask.date >= month_start,
            StaffTask.date < next_month_start,
        )
        .all()
    )

    for t in staff_tasks:
        if t.cost is None:
            continue
        amount = float(t.cost)
        costs_total += amount
        cat = f"Staff - {t.task_type or 'Altro'}"
        costs_by_category_map[cat] = costs_by_category_map.get(cat, 0.0) + amount

        desc = t.notes or f"Task staff #{t.id}"
        cost_lines.append(
            {
                "date": t.date,
                "category": cat,
                "description": desc,
                "amount": amount,
                "currency": t.currency or "EUR",
                "unit_id": t.unit_id,
                "booking_id": t.booking_id,
                "staff_task_id": t.id,
                "origin": "staff_task",
            }
        )

    # 4. 🔥 NUOVO: COSTI MANUTENZIONE 🔥
    # Convertiamo le date in datetime per confrontare con created_at (che è timestamp)
    ms_dt = datetime.combine(month_start, time.min)
    nms_dt = datetime.combine(next_month_start, time.min)
    
    tickets = db.query(MaintenanceTicket).filter(
        MaintenanceTicket.created_at >= ms_dt,
        MaintenanceTicket.created_at < nms_dt,
        MaintenanceTicket.cost.isnot(None)
    ).all()

    for t in tickets:
        amount = float(t.cost)
        if amount > 0:
            costs_total += amount
            cat = "Manutenzione & Acquisti"
            costs_by_category_map[cat] = costs_by_category_map.get(cat, 0.0) + amount
            # Usiamo created_at come data di competenza
            cost_lines.append({
                "date": t.created_at.date(),
                "category": cat,
                "description": f"{t.ticket_type.capitalize()}: {t.title}",
                "amount": amount,
                "currency": t.currency,
                "unit_id": t.unit_id,
                "booking_id": None,
                "staff_task_id": None,
                "origin": "maintenance_ticket" # Nuovo tipo di origine
            })

    return costs_total, costs_by_category_map, cost_lines


@app.get("/analytics/month-pnl", response_model=PnLMonthSummary)
def month_pnl(
    year: int = Query(..., ge=2000, le=2100),
    month: int = Query(..., ge=1, le=12),
    db: Session = Depends(get_db),
):
    # calcolo range mese
    month_start, next_month_start, days_in_month = _get_month_range(year, month)

    # --- Prenotazioni per il mese (ricavi e occupancy) ---
    bookings = (
        db.query(Booking)
        .filter(
            Booking.checkin_date < next_month_start,
            Booking.checkout_date > month_start,
        )
        .all()
    )

    units_count = db.query(Unit).count()
    nights_total = days_in_month * units_count

    occupied_nights = 0
    revenue_total = 0.0
    revenue_by_source: Dict[str, float] = {}
    revenue_by_unit_map: Dict[int, RevenueByUnit] = {}

    for b in bookings:
        # notti di questa prenotazione dentro il mese
        stay_start = max(b.checkin_date, month_start)
        stay_end = min(b.checkout_date, next_month_start)
        nights_in_month = (stay_end - stay_start).days

        occupied_nights += nights_in_month

        # ricavo allocato nel mese
        if (
            b.total_price is not None
            and b.checkin_date >= month_start
            and b.checkout_date <= next_month_start
        ):
            booking_revenue = float(b.total_price)
        else:
            if b.nightly_rate is not None:
                booking_revenue = float(b.nightly_rate) * nights_in_month
            else:
                booking_revenue = 0.0

        revenue_total += booking_revenue

        # per sorgente
        src = b.source or "unknown"
        revenue_by_source[src] = revenue_by_source.get(src, 0.0) + booking_revenue

        # per unità
        u = b.unit
        if u:
            existing = revenue_by_unit_map.get(u.id)
            if existing is None:
                revenue_by_unit_map[u.id] = RevenueByUnit(
                    unit_id=u.id,
                    unit_name=u.name,
                    revenue=booking_revenue,
                    nights_occupied=nights_in_month,
                )
            else:
                existing.revenue += booking_revenue
                existing.nights_occupied += nights_in_month

    occupancy_rate = (
        (occupied_nights / nights_total) * 100 if nights_total > 0 else 0.0
    )
    adr = revenue_total / occupied_nights if occupied_nights > 0 else None

    # --- Costi del mese (da helper condiviso) ---
    costs_total, costs_by_category_map, _ = _collect_costs_for_month(
        db, month_start, next_month_start
    )

    costs_by_category = [
        CostByCategory(category=cat, total=round(total, 2))
        for cat, total in costs_by_category_map.items()
    ]
    costs_by_category.sort(key=lambda x: x.category)

    profit = revenue_total - costs_total

    return PnLMonthSummary(
        year=year,
        month=month,
        nights_total=nights_total,
        nights_occupied=occupied_nights,
        occupancy_rate=round(occupancy_rate, 2),
        adr=round(adr, 2) if adr is not None else None,
        revenue_total=round(revenue_total, 2),
        revenue_by_source={k: round(v, 2) for k, v in revenue_by_source.items()},
        revenue_by_unit=list(revenue_by_unit_map.values()),
        costs_total=round(costs_total, 2),
        costs_by_category=costs_by_category,
        profit=round(profit, 2),
    )


@app.get("/analytics/month-cost-lines", response_model=List[MonthCostLine])
def month_cost_lines(
    year: int = Query(..., ge=2000, le=2100),
    month: int = Query(..., ge=1, le=12),
    db: Session = Depends(get_db),
):
    month_start, next_month_start, _ = _get_month_range(year, month)
    _, _, cost_lines = _collect_costs_for_month(db, month_start, next_month_start)
    return [MonthCostLine(**line) for line in cost_lines]


class AdvancedKpiSummary(BaseModel):
    year: int
    month: int
    revpar: float
    avg_length_of_stay: float | None
    direct_share_percent: float
    paid_booking_percent: float
    pipeline_revenue_next_30_days: float
    upcoming_arrivals_next_7_days: int


@app.get("/analytics/advanced-kpis", response_model=AdvancedKpiSummary)
def advanced_kpis(
    year: int = Query(..., ge=2000, le=2100),
    month: int = Query(..., ge=1, le=12),
    db: Session = Depends(get_db),
):
    month_start, next_month_start, days_in_month = _get_month_range(year, month)

    bookings = (
        db.query(Booking)
        .filter(
            Booking.checkin_date < next_month_start,
            Booking.checkout_date > month_start,
        )
        .all()
    )
    units_count = db.query(Unit).count()
    nights_total = max(days_in_month * units_count, 1)

    occupied_nights = 0
    revenue_total = 0.0
    direct_revenue = 0.0
    paid_count = 0
    lengths_of_stay: list[int] = []

    for booking in bookings:
        stay_start = max(booking.checkin_date, month_start)
        stay_end = min(booking.checkout_date, next_month_start)
        nights_in_month = max((stay_end - stay_start).days, 0)
        occupied_nights += nights_in_month

        if booking.total_price is not None:
            booking_revenue = float(booking.total_price)
        elif booking.nightly_rate is not None:
            booking_revenue = float(booking.nightly_rate) * nights_in_month
        else:
            booking_revenue = 0.0

        revenue_total += booking_revenue
        if (booking.source or "").lower() == "direct":
            direct_revenue += booking_revenue
        if booking.is_paid:
            paid_count += 1

        if booking.checkin_date and booking.checkout_date:
            los = max((booking.checkout_date - booking.checkin_date).days, 0)
            if los > 0:
                lengths_of_stay.append(los)

    revpar = revenue_total / nights_total
    avg_los = sum(lengths_of_stay) / len(lengths_of_stay) if lengths_of_stay else None
    direct_share = (direct_revenue / revenue_total * 100) if revenue_total > 0 else 0.0
    paid_percent = (paid_count / len(bookings) * 100) if bookings else 0.0

    today = date.today()
    next_30 = today + timedelta(days=30)
    next_7 = today + timedelta(days=7)

    upcoming_bookings = (
        db.query(Booking)
        .filter(Booking.checkin_date >= today, Booking.checkin_date <= next_30)
        .all()
    )
    pipeline_revenue = sum(float(b.total_price or 0) for b in upcoming_bookings)
    upcoming_arrivals_7 = sum(1 for b in upcoming_bookings if b.checkin_date <= next_7)

    return AdvancedKpiSummary(
        year=year,
        month=month,
        revpar=round(revpar, 2),
        avg_length_of_stay=round(avg_los, 2) if avg_los is not None else None,
        direct_share_percent=round(direct_share, 2),
        paid_booking_percent=round(paid_percent, 2),
        pipeline_revenue_next_30_days=round(pipeline_revenue, 2),
        upcoming_arrivals_next_7_days=upcoming_arrivals_7,
    )


class AlertItem(BaseModel):
    severity: str
    code: str
    title: str
    count: int
    details: str


@app.get("/alerts/today", response_model=List[AlertItem])
def alerts_today(db: Session = Depends(get_db)):
    today = date.today()
    alerts: list[AlertItem] = []

    unpaid_checkouts = (
        db.query(Booking)
        .filter(Booking.checkout_date < today, Booking.is_paid.is_(False))
        .count()
    )
    if unpaid_checkouts > 0:
        alerts.append(
            AlertItem(
                severity="high",
                code="unpaid_checkout",
                title="Prenotazioni non saldate dopo il check-out",
                count=unpaid_checkouts,
                details="Verificare pagamenti e riconciliazione contabile.",
            )
        )

    overdue_tasks = (
        db.query(StaffTask)
        .filter(
            StaffTask.date < today,
            StaffTask.status.notin_(["done", "cancelled"]),
        )
        .count()
    )
    if overdue_tasks > 0:
        alerts.append(
            AlertItem(
                severity="medium",
                code="overdue_staff_tasks",
                title="Task staff scaduti non completati",
                count=overdue_tasks,
                details="Prioritizzare i task in ritardo nel planner staff.",
            )
        )

    open_tickets = (
        db.query(MaintenanceTicket)
        .filter(MaintenanceTicket.status.in_(["todo", "in_progress"]))
        .count()
    )
    if open_tickets > 0:
        alerts.append(
            AlertItem(
                severity="medium",
                code="open_maintenance",
                title="Ticket manutenzione aperti",
                count=open_tickets,
                details="Verificare ticket urgenti e stato avanzamento.",
            )
        )

    return alerts


@app.get("/analytics/month-cost-lines.csv")
def month_cost_lines_csv(
    year: int = Query(..., ge=2000, le=2100),
    month: int = Query(..., ge=1, le=12),
    db: Session = Depends(get_db),
):
    month_start, next_month_start, _ = _get_month_range(year, month)
    _, _, cost_lines = _collect_costs_for_month(db, month_start, next_month_start)

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(
        [
            "date",
            "category",
            "description",
            "amount",
            "currency",
            "unit_id",
            "booking_id",
            "staff_task_id",
            "origin",
        ]
    )
    for line in cost_lines:
        writer.writerow(
            [
                line.get("date"),
                line.get("category"),
                line.get("description"),
                line.get("amount"),
                line.get("currency"),
                line.get("unit_id"),
                line.get("booking_id"),
                line.get("staff_task_id"),
                line.get("origin"),
            ]
        )

    filename = f"month_cost_lines_{year}_{month:02d}.csv"
    return Response(
        content=output.getvalue(),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename=\"{filename}\"'},
    )


# ---------- STAFF TASKS ----------


class StaffTaskBase(BaseModel):
    date: date
    # lato API: stringa "HH:MM" oppure null
    time: str | None = None
    task_type: str
    assignee_name: Optional[str] = None
    estimated_hours: Optional[float] = None
    status: str = "planned"
    notes: Optional[str] = None
    cost: Optional[float] = None
    currency: str = "EUR"
    booking_id: Optional[int] = None
    unit_id: Optional[int] = None


class StaffTaskCreate(StaffTaskBase):
    pass


class StaffTaskUpdate(StaffTaskBase):
    pass


class StaffTaskOut(StaffTaskBase):
    id: int

    model_config = ConfigDict(from_attributes=True)


@app.get("/staff-tasks", response_model=list[StaffTaskOut])
def list_staff_tasks(
    db: Session = Depends(get_db),
    from_date: date | None = None,
    to_date: date | None = None,
    date: date | None = None,
):
    q = db.query(StaffTask).order_by(StaffTask.date)
    if date:
        q = q.filter(StaffTask.date == date)
    else:
        if from_date:
            q = q.filter(StaffTask.date >= from_date)
        if to_date:
            q = q.filter(StaffTask.date <= to_date)

    tasks = q.all()

    # serializziamo noi a dict per controllare bene il campo time
    result: list[dict] = []
    for t in tasks:
        result.append(
            {
                "id": t.id,
                "date": t.date,
                "time": _format_time_value(t.time),
                "task_type": t.task_type,
                "assignee_name": t.assignee_name,
                "estimated_hours": t.estimated_hours,
                "status": t.status,
                "notes": t.notes,
                "cost": t.cost,
                "currency": t.currency,
                "booking_id": t.booking_id,
                "unit_id": t.unit_id,
            }
        )
    return result


@app.post("/staff-tasks", response_model=StaffTaskOut)
def create_staff_task(payload: StaffTaskCreate, db: Session = Depends(get_db)):
    # se booking_id è valorizzato, controlla che la prenotazione esista
    if payload.booking_id is not None:
        booking = db.query(Booking).filter(Booking.id == payload.booking_id).first()
        if not booking:
            raise HTTPException(
                status_code=400,
                detail="Prenotazione collegata inesistente (booking_id).",
            )

    # se unit_id è valorizzato, controlla che l'unità esista
    if payload.unit_id is not None:
        unit = db.query(Unit).filter(Unit.id == payload.unit_id).first()
        if not unit:
            raise HTTPException(
                status_code=400,
                detail="Unità collegata inesistente (unit_id).",
            )

    task_time = _parse_time_str(payload.time)

    task = StaffTask(
        date=payload.date,
        time=task_time,
        task_type=payload.task_type,
        assignee_name=payload.assignee_name,
        estimated_hours=payload.estimated_hours,
        status=payload.status,
        notes=payload.notes,
        cost=payload.cost,
        currency=payload.currency,
        booking_id=payload.booking_id,
        unit_id=payload.unit_id,
    )
    db.add(task)
    db.commit()
    db.refresh(task)

    return {
        "id": task.id,
        "date": task.date,
        "time": _format_time_value(task.time),
        "task_type": task.task_type,
        "assignee_name": task.assignee_name,
        "estimated_hours": task.estimated_hours,
        "status": task.status,
        "notes": task.notes,
        "cost": task.cost,
        "currency": task.currency,
        "booking_id": task.booking_id,
        "unit_id": task.unit_id,
    }


@app.put("/staff-tasks/{task_id}", response_model=StaffTaskOut)
def update_staff_task(
    task_id: int, payload: StaffTaskUpdate, db: Session = Depends(get_db)
):
    task = db.query(StaffTask).filter(StaffTask.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task staff non trovato")

    if payload.booking_id is not None:
        booking = db.query(Booking).filter(Booking.id == payload.booking_id).first()
        if not booking:
            raise HTTPException(
                status_code=400,
                detail="Prenotazione collegata inesistente (booking_id).",
            )

    if payload.unit_id is not None:
        unit = db.query(Unit).filter(Unit.id == payload.unit_id).first()
        if not unit:
            raise HTTPException(
                status_code=400,
                detail="Unità collegata inesistente (unit_id).",
            )

    task_time = _parse_time_str(payload.time)

    task.date = payload.date
    task.time = task_time
    task.task_type = payload.task_type
    task.assignee_name = payload.assignee_name
    task.estimated_hours = payload.estimated_hours
    task.status = payload.status
    task.notes = payload.notes
    task.cost = payload.cost
    task.currency = payload.currency
    task.booking_id = payload.booking_id
    task.unit_id = payload.unit_id

    db.commit()
    db.refresh(task)

    return {
        "id": task.id,
        "date": task.date,
        "time": _format_time_value(task.time),
        "task_type": task.task_type,
        "assignee_name": task.assignee_name,
        "estimated_hours": task.estimated_hours,
        "status": task.status,
        "notes": task.notes,
        "cost": task.cost,
        "currency": task.currency,
        "booking_id": task.booking_id,
        "unit_id": task.unit_id,
    }


@app.delete("/staff-tasks/{task_id}", status_code=204)
def delete_staff_task(task_id: int, db: Session = Depends(get_db)):
    task = db.query(StaffTask).filter(StaffTask.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task staff non trovato")

    db.delete(task)
    db.commit()
    return


# ---------- COST ITEMS ----------


class CostItemBase(BaseModel):
    date: date
    category: str
    description: str | None = None
    amount: float
    currency: str = "EUR"
    unit_id: int | None = None


class CostItemCreate(CostItemBase):
    pass


class CostItemUpdate(CostItemBase):
    pass


class CostItemOut(CostItemBase):
    id: int

    model_config = ConfigDict(from_attributes=True)


@app.get("/cost-items", response_model=list[CostItemOut])
def list_cost_items(
    db: Session = Depends(get_db),
    from_date: date | None = None,
    to_date: date | None = None,
):
    q = db.query(CostItem).order_by(CostItem.date)
    if from_date:
        q = q.filter(CostItem.date >= from_date)
    if to_date:
        q = q.filter(CostItem.date <= to_date)
    return q.all()


@app.post("/cost-items", response_model=CostItemOut)
def create_cost_item(payload: CostItemCreate, db: Session = Depends(get_db)):
    item = CostItem(
        date=payload.date,
        category=payload.category,
        description=payload.description,
        amount=payload.amount,
        currency=payload.currency,
        unit_id=payload.unit_id,
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


@app.put("/cost-items/{item_id}", response_model=CostItemOut)
def update_cost_item(
    item_id: int, payload: CostItemUpdate, db: Session = Depends(get_db)
):
    item = db.query(CostItem).filter(CostItem.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Costo non trovato")

    item.date = payload.date
    item.category = payload.category
    item.description = payload.description
    item.amount = payload.amount
    item.currency = payload.currency
    item.unit_id = payload.unit_id

    db.commit()
    db.refresh(item)
    return item


@app.delete("/cost-items/{item_id}", status_code=204)
def delete_cost_item(item_id: int, db: Session = Depends(get_db)):
    item = db.query(CostItem).filter(CostItem.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Costo non trovato")

    db.delete(item)
    db.commit()
    return item


# ---------- STAFF DEFAULTS (impostazioni automatiche) ----------


class StaffDefaultsOut(BaseModel):
    cleaning_default_assignee: str | None = None
    cleaning_default_cost: float | None = None
    cleaning_default_hours: float | None = None
    currency: str = "EUR"

    model_config = ConfigDict(from_attributes=True)


class StaffDefaultsUpdate(BaseModel):
    cleaning_default_assignee: str | None = None
    cleaning_default_cost: float | None = None
    cleaning_default_hours: float | None = None
    currency: str | None = None


@app.get("/staff-defaults", response_model=StaffDefaultsOut)
def get_staff_defaults_endpoint(db: Session = Depends(get_db)):
    defaults = _get_or_create_staff_defaults(db)
    return defaults


@app.put("/staff-defaults", response_model=StaffDefaultsOut)
def update_staff_defaults_endpoint(
    payload: StaffDefaultsUpdate, db: Session = Depends(get_db)
):
    defaults = _get_or_create_staff_defaults(db)

    if payload.cleaning_default_assignee is not None:
        defaults.cleaning_default_assignee = payload.cleaning_default_assignee
    if payload.cleaning_default_cost is not None:
        defaults.cleaning_default_cost = payload.cleaning_default_cost
    if payload.cleaning_default_hours is not None:
        defaults.cleaning_default_hours = payload.cleaning_default_hours
    if payload.currency is not None:
        defaults.currency = payload.currency

    db.commit()
    db.refresh(defaults)
    return defaults


# ---------- STAFF MEMBERS (ANAGRAFICA) ----------

class StaffMemberBase(BaseModel):
    name: str
    role: StaffRole | None = None
    color_hex: str | None = None
    hourly_cost: float | None = None
    is_active: bool = True


class StaffMemberCreate(StaffMemberBase):
    pass


class StaffMemberUpdate(BaseModel):
    name: str | None = None
    role: StaffRole | None = None
    color_hex: str | None = None
    hourly_cost: float | None = None
    is_active: bool | None = None


class StaffMemberOut(StaffMemberBase):
    id: int

    model_config = ConfigDict(from_attributes=True)


@app.get("/staff-members", response_model=List[StaffMemberOut])
def list_staff_members(
    db: Session = Depends(get_db),
    active_only: bool = False,
):
    q = db.query(StaffMember)
    if active_only:
        q = q.filter(StaffMember.is_active.is_(True))
    members = q.order_by(StaffMember.name).all()
    return members


@app.post("/staff-members", response_model=StaffMemberOut)
def create_staff_member(
    payload: StaffMemberCreate, db: Session = Depends(get_db)
):
    member = StaffMember(
        name=payload.name,
        role=payload.role.value if payload.role is not None else None,
        color_hex=payload.color_hex,
        hourly_cost=payload.hourly_cost,
        is_active=payload.is_active,
    )
    db.add(member)
    db.commit()
    db.refresh(member)
    return member


@app.put("/staff-members/{member_id}", response_model=StaffMemberOut)
def update_staff_member(
    member_id: int, payload: StaffMemberUpdate, db: Session = Depends(get_db)
):
    member = db.query(StaffMember).filter(StaffMember.id == member_id).first()
    if not member:
        raise HTTPException(status_code=404, detail="Staff member non trovato")

    if payload.name is not None:
        member.name = payload.name
    if payload.role is not None:
        member.role = payload.role.value
    if payload.color_hex is not None:
        member.color_hex = payload.color_hex
    if payload.hourly_cost is not None:
        member.hourly_cost = payload.hourly_cost
    if payload.is_active is not None:
        member.is_active = payload.is_active

    db.commit()
    db.refresh(member)
    return member


@app.delete("/staff-members/{member_id}", status_code=204)
def delete_staff_member(member_id: int, db: Session = Depends(get_db)):
    """Eliminazione definitiva del record staff."""
    member = db.query(StaffMember).filter(StaffMember.id == member_id).first()
    if not member:
        raise HTTPException(status_code=404, detail="Staff member non trovato")

    db.delete(member)
    db.commit()
    return


# ---------- PRICING DEFAULTS ----------


class PricingDefaultsOut(BaseModel):
    default_cleaning_fee: float | None = None
    default_city_tax_per_night: float | None = None
    default_channel_fee_percent: float | None = None
    default_currency: str = "EUR"


class PricingDefaultsUpdate(BaseModel):
    default_cleaning_fee: float | None = None
    default_city_tax_per_night: float | None = None
    default_channel_fee_percent: float | None = None
    default_currency: str | None = None


@app.get("/pricing-defaults", response_model=PricingDefaultsOut)
def get_pricing_defaults_endpoint(db: Session = Depends(get_db)):
    pricing = _get_or_create_pricing_defaults(db)
    return PricingDefaultsOut(
        default_cleaning_fee=pricing.default_cleaning_fee,
        default_city_tax_per_night=pricing.default_city_tax_per_night,
        default_channel_fee_percent=pricing.default_channel_commission_percent,
        default_currency=pricing.currency,
    )


@app.put("/pricing-defaults", response_model=PricingDefaultsOut)
def update_pricing_defaults_endpoint(
    payload: PricingDefaultsUpdate, db: Session = Depends(get_db)
):
    pricing = _get_or_create_pricing_defaults(db)

    if payload.default_cleaning_fee is not None:
        pricing.default_cleaning_fee = payload.default_cleaning_fee
    if payload.default_city_tax_per_night is not None:
        pricing.default_city_tax_per_night = payload.default_city_tax_per_night
    if payload.default_channel_fee_percent is not None:
        pricing.default_channel_commission_percent = (
            payload.default_channel_fee_percent
        )
    if payload.default_currency is not None:
        pricing.currency = payload.default_currency

    db.commit()
    db.refresh(pricing)

    return PricingDefaultsOut(
        default_cleaning_fee=pricing.default_cleaning_fee,
        default_city_tax_per_night=pricing.default_city_tax_per_night,
        default_channel_fee_percent=pricing.default_channel_commission_percent,
        default_currency=pricing.currency,
    )


# ---------- MAINTENANCE (Manutenzioni & Migliorie) ----------


class TicketStatus(str, Enum):
    todo = "todo"
    in_progress = "in_progress"
    done = "done"


class TicketPriority(str, Enum):
    low = "low"
    medium = "medium"
    high = "high"
    urgent = "urgent"


class TicketType(str, Enum):
    repair = "repair"
    improvement = "improvement"
    purchase = "purchase"


class MaintenanceBase(BaseModel):
    title: str
    description: str | None = None
    unit_id: int | None = None
    assigned_to_id: int | None = None
    status: TicketStatus = TicketStatus.todo
    priority: TicketPriority = TicketPriority.medium
    ticket_type: TicketType = TicketType.repair
    cost: float | None = None
    currency: str = "EUR"


class MaintenanceCreate(MaintenanceBase):
    pass


class MaintenanceUpdate(BaseModel):
    title: str | None = None
    description: str | None = None
    unit_id: int | None = None
    assigned_to_id: int | None = None
    status: TicketStatus | None = None
    priority: TicketPriority | None = None
    ticket_type: TicketType | None = None
    cost: float | None = None
    currency: str | None = None


class MaintenanceOut(MaintenanceBase):
    id: int
    created_at: datetime | None = None
    updated_at: datetime | None = None

    model_config = ConfigDict(from_attributes=True)


@app.get("/maintenance", response_model=List[MaintenanceOut])
def list_maintenance_tickets(db: Session = Depends(get_db)):
    # Ordina per priorità (o data)
    tickets = db.query(MaintenanceTicket).order_by(MaintenanceTicket.created_at.desc()).all()
    return tickets


@app.post("/maintenance", response_model=MaintenanceOut)
def create_maintenance_ticket(payload: MaintenanceCreate, db: Session = Depends(get_db)):
    # Se unit_id è presente, verifichiamo esista
    if payload.unit_id is not None:
        unit = db.query(Unit).filter(Unit.id == payload.unit_id).first()
        if not unit:
             raise HTTPException(status_code=404, detail="Unit not found")

    ticket = MaintenanceTicket(
        title=payload.title,
        description=payload.description,
        unit_id=payload.unit_id,
        assigned_to_id=payload.assigned_to_id,
        status=payload.status.value,
        priority=payload.priority.value,
        ticket_type=payload.ticket_type.value,
        cost=payload.cost,
        currency=payload.currency
    )
    db.add(ticket)
    db.commit()
    db.refresh(ticket)
    
    # Se c'è un costo, creiamo anche un CostItem automatico? 
    # Per ora no, lo lasciamo manuale o decidiamo in futuro.
    
    return ticket


@app.put("/maintenance/{ticket_id}", response_model=MaintenanceOut)
def update_maintenance_ticket(ticket_id: int, payload: MaintenanceUpdate, db: Session = Depends(get_db)):
    ticket = db.query(MaintenanceTicket).filter(MaintenanceTicket.id == ticket_id).first()
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")
    
    if payload.title is not None: ticket.title = payload.title
    if payload.description is not None: ticket.description = payload.description
    if payload.unit_id is not None: ticket.unit_id = payload.unit_id
    if payload.assigned_to_id is not None: ticket.assigned_to_id = payload.assigned_to_id
    if payload.status is not None: ticket.status = payload.status.value
    if payload.priority is not None: ticket.priority = payload.priority.value
    if payload.ticket_type is not None: ticket.ticket_type = payload.ticket_type.value
    if payload.cost is not None: ticket.cost = payload.cost
    if payload.currency is not None: ticket.currency = payload.currency

    db.commit()
    db.refresh(ticket)
    return ticket


@app.delete("/maintenance/{ticket_id}", status_code=204)
def delete_maintenance_ticket(ticket_id: int, db: Session = Depends(get_db)):
    ticket = db.query(MaintenanceTicket).filter(MaintenanceTicket.id == ticket_id).first()
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")
    db.delete(ticket)
    db.commit()
    return

