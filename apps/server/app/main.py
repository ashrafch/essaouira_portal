from datetime import date

from fastapi import FastAPI, Depends, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from pydantic import BaseModel

from app.db import Base, engine, get_db
from app.models.unit import Unit
from app.models.booking import Booking
from app.models.staff_task import StaffTask
from app.models.cost_item import CostItem
from app.models.staff_defaults import StaffDefaults  # <-- nuovo import

app = FastAPI(title="Portale Essaouira API")

origins = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def on_startup():
    # crea tabelle
    Base.metadata.create_all(bind=engine)

    db = next(get_db())

    # seed unità se non ci sono
    if db.query(Unit).count() == 0:
        units_seed = [
            Unit(name="Unit A", size_m2=64, capacity=6, base_nightly_rate=80),
            Unit(name="Unit B", size_m2=62, capacity=6, base_nightly_rate=80),
            Unit(name="Unit C", size_m2=60, capacity=6, base_nightly_rate=75),
            Unit(name="Unit D", size_m2=61, capacity=6, base_nightly_rate=75),
            Unit(name="Unit E", size_m2=63, capacity=6, base_nightly_rate=85),
            Unit(name="Unit F", size_m2=60, capacity=6, base_nightly_rate=70),
        ]
        db.add_all(units_seed)
        db.commit()

    # seed defaults staff se non esistono
    if db.query(StaffDefaults).count() == 0:
        defaults = StaffDefaults(
            cleaning_default_assignee="Operatore 1",
            cleaning_default_cost=5.0,
            cleaning_default_hours=1.0,
            currency="EUR",
        )
        db.add(defaults)
        db.commit()


@app.get("/health")
def health():
    return {"status": "ok"}


# ---------- UNITS ----------


class UnitOut(BaseModel):
    id: int
    name: str
    size_m2: int | None
    capacity: int | None
    base_nightly_rate: float | None
    currency: str

    class Config:
        from_attributes = True


@app.get("/units", response_model=list[UnitOut])
def list_units(db: Session = Depends(get_db)):
    units = db.query(Unit).all()
    return units


# ---------- BOOKING Schemas ----------


class BookingBase(BaseModel):
    unit_id: int
    guest_name: str
    guest_email: str | None = None
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


class BookingCreate(BookingBase):
    pass


class BookingUpdate(BookingBase):
    pass


class BookingOut(BookingBase):
    id: int

    class Config:
        from_attributes = True


# ---------- BOOKING endpoints ----------


@app.get("/bookings", response_model=list[BookingOut])
def list_bookings(db: Session = Depends(get_db)):
    bookings = db.query(Booking).order_by(Booking.checkin_date).all()
    return bookings


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

    booking = Booking(
        unit_id=payload.unit_id,
        guest_name=payload.guest_name,
        guest_email=payload.guest_email,
        source=payload.source,
        checkin_date=payload.checkin_date,
        checkout_date=payload.checkout_date,
        notes=payload.notes,
        nightly_rate=nightly_rate,
        total_price=total_price,
        cleaning_fee=payload.cleaning_fee,
        city_tax=payload.city_tax,
        channel_fee=payload.channel_fee,
        currency=payload.currency,
        is_paid=payload.is_paid,
    )
    db.add(booking)
    db.commit()
    db.refresh(booking)

    # 🔁 CREA TASK STAFF AUTOMATICA (es. pulizia post-checkout)
    defaults = _get_or_create_staff_defaults(db)

    auto_task = StaffTask(
        date=payload.checkout_date,  # giorno di checkout -> pulizia
        time=None,
        task_type="cleaning",
        assignee_name=defaults.cleaning_default_assignee,
        estimated_hours=defaults.cleaning_default_hours,
        status="planned",
        notes=f"Pulizia automatica per prenotazione #{booking.id}",
        cost=defaults.cleaning_default_cost,
        currency=defaults.currency,
        booking_id=booking.id,
        unit_id=booking.unit_id,
    )
    db.add(auto_task)
    db.commit()

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

    booking.unit_id = payload.unit_id
    booking.guest_name = payload.guest_name
    booking.guest_email = payload.guest_email
    booking.source = payload.source
    booking.checkin_date = payload.checkin_date
    booking.checkout_date = payload.checkout_date
    booking.notes = payload.notes
    booking.nightly_rate = nightly_rate
    booking.total_price = total_price
    booking.cleaning_fee = payload.cleaning_fee
    booking.city_tax = payload.city_tax
    booking.channel_fee = payload.channel_fee
    booking.currency = payload.currency
    booking.is_paid = payload.is_paid

    db.commit()
    db.refresh(booking)
    return booking


@app.delete("/bookings/{booking_id}", status_code=204)
def delete_booking(booking_id: int, db: Session = Depends(get_db)):
    booking = db.query(Booking).filter(Booking.id == booking_id).first()
    if not booking:
        raise HTTPException(status_code=404, detail="Prenotazione non trovata")

    db.delete(booking)
    db.commit()
    return


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


# ---------- STAFF TASKS ----------


class StaffTaskBase(BaseModel):
    date: date
    time: str | None = None  # "HH:MM" opzionale
    task_type: str
    assignee_name: str | None = None
    estimated_hours: float | None = None
    status: str = "planned"
    notes: str | None = None
    cost: float | None = None
    currency: str = "EUR"
    booking_id: int | None = None
    unit_id: int | None = None


class StaffTaskCreate(StaffTaskBase):
    pass


class StaffTaskUpdate(StaffTaskBase):
    pass


class StaffTaskOut(StaffTaskBase):
    id: int

    class Config:
        from_attributes = True


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
    return q.all()


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

    task = StaffTask(
        date=payload.date,
        time=payload.time,
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
    return task


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

    task.date = payload.date
    task.time = payload.time
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
    return task


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

    class Config:
        from_attributes = True


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
    return


# ---------- STAFF DEFAULTS (impostazioni automatiche) ----------


class StaffDefaultsOut(BaseModel):
    cleaning_default_assignee: str | None = None
    cleaning_default_cost: float | None = None
    cleaning_default_hours: float | None = None
    currency: str = "EUR"

    class Config:
        from_attributes = True


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
