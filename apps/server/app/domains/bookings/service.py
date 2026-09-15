from datetime import time, timedelta

from fastapi import HTTPException

from sqlalchemy.orm import Session

from app.domains.bookings.schemas import BookingCreate, BookingUpdate
from app.domains.operations.service import (
    find_default_assignee_for_role,
    get_or_create_pricing_defaults,
    get_or_create_staff_defaults,
)
from app.main_types import StaffRole
from app.models.booking import Booking
from app.models.staff_task import StaffTask
from app.models.unit import Unit


def compute_booking_financials(
    db: Session,
    payload: BookingCreate | BookingUpdate,
    unit: Unit,
) -> dict:
    """Compute nightly rate, total price and fee defaults for a booking payload.

    Pricing resolution order per stay:
    1. explicit ``payload.nightly_rate`` (manual per-booking override), else
    2. the per-night rate calendar (stored price per date), falling back to
       ``unit.base_nightly_rate`` for any night without a stored rate.

    With an empty rate calendar this reproduces the legacy flat-rate behaviour.
    """
    # Local import keeps the bookings domain free of a hard revenue dependency
    # and avoids any import cycle.
    from app.domains.revenue.service import get_effective_nightly_prices

    nights = (payload.checkout_date - payload.checkin_date).days

    if payload.nightly_rate is not None:
        nightly_rate = payload.nightly_rate
        base_total = float(nightly_rate) * nights if nights > 0 else None
    else:
        per_night = get_effective_nightly_prices(
            db, unit, payload.checkin_date, payload.checkout_date
        )
        priced_nights = [float(p) for p in per_night if p is not None]
        if priced_nights:
            base_total = sum(priced_nights)
            nightly_rate = round(base_total / nights, 2) if nights > 0 else None
        else:
            nightly_rate = None
            base_total = None

    total_price = payload.total_price if payload.total_price is not None else base_total

    pricing = get_or_create_pricing_defaults(db)

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

    return {
        "nightly_rate": nightly_rate,
        "total_price": total_price,
        "cleaning_fee": cleaning_fee,
        "city_tax": city_tax,
        "channel_fee": channel_fee,
    }


def lock_booking_unit(db: Session, unit_id: int) -> Unit:
    # All inventory writers (including channel imports) lock the canonical unit
    # before checking overlap, serializing concurrent PostgreSQL reservations.
    unit = db.query(Unit).filter(Unit.id == unit_id).with_for_update().first()
    if unit is None:
        raise HTTPException(status_code=400, detail="Unit does not exist")
    return unit


def save_booking(db: Session, payload: BookingCreate | BookingUpdate, booking_id: int | None = None) -> Booking:
    from app.domains.revenue.service import get_min_stay

    unit = lock_booking_unit(db, payload.unit_id)
    booking = None
    if booking_id is not None:
        booking = db.query(Booking).filter(Booking.id == booking_id).with_for_update().first()
        if booking is None:
            raise HTTPException(status_code=404, detail="Booking not found")
    if payload.checkout_date <= payload.checkin_date:
        raise HTTPException(status_code=400, detail="checkout_date deve essere dopo checkin_date")
    if payload.status != "cancelled":
        conflicts = db.query(Booking).filter(
            Booking.unit_id == unit.id, Booking.status != "cancelled",
            Booking.checkin_date < payload.checkout_date,
            Booking.checkout_date > payload.checkin_date,
        )
        if booking_id is not None:
            conflicts = conflicts.filter(Booking.id != booking_id)
        if conflicts.first() is not None:
            raise HTTPException(status_code=400, detail="Esiste gi\u00e0 una prenotazione per questa unit\u00e0 nelle date selezionate.")
        # Cancelling or editing a historical stay must not re-apply new pricing
        # restrictions to an already accepted reservation.
        changed_stay = booking is None or any(
            getattr(booking, name) != getattr(payload, name)
            for name in ("unit_id", "checkin_date", "checkout_date")
        ) or booking.status == "cancelled"
        if changed_stay:
            minimum = get_min_stay(db, unit.id, payload.checkin_date)
            if minimum and (payload.checkout_date - payload.checkin_date).days < minimum:
                raise HTTPException(status_code=400, detail=f"Soggiorno minimo di {minimum} notti")

    # API serializers format arrival time as HH:MM; persistence needs time.
    values = {name: getattr(payload, name) for name in BookingCreate.model_fields}
    values.update(compute_booking_financials(db, payload, unit))
    if booking is None:
        booking = Booking(**values)
        db.add(booking)
    else:
        for name, value in values.items():
            setattr(booking, name, value)
    db.flush()
    create_auto_staff_tasks_for_booking(db, booking)
    db.commit()
    db.refresh(booking)
    return booking


def create_auto_staff_tasks_for_booking(db: Session, booking: Booking) -> None:
    """Reconcile planned tasks without erasing assignments or completed work."""
    existing = db.query(StaffTask).filter(
        StaffTask.booking_id == booking.id, StaffTask.auto_key.is_not(None),
    ).all()
    if booking.status != "confirmed":
        for task in existing:
            if task.status not in {"done", "completed"}:
                task.status = "cancelled"
        db.flush()
        return

    defaults = get_or_create_staff_defaults(db)
    hours = defaults.cleaning_default_hours or 1.0
    currency = defaults.currency or "EUR"
    housekeeping = find_default_assignee_for_role(db, StaffRole.housekeeping, defaults.cleaning_default_assignee)
    reception = find_default_assignee_for_role(db, StaffRole.reception_day, housekeeping)
    kitchen = find_default_assignee_for_role(db, StaffRole.kitchen, housekeeping)
    late = bool(booking.has_late_checkout)
    specs = [
        ("checkin", booking.checkin_date, booking.estimated_arrival_time or time(15), "checkin", reception, hours),
        ("checkout", booking.checkout_date, time(16 if late else 10), "checkout", reception, hours),
        ("cleaning", booking.checkout_date, time(17 if late else 11), "cleaning", housekeeping, hours * (1.5 if late else 1)),
    ]
    if late:
        specs.append(("extra_cleaning", booking.checkout_date, time(19), "cleaning", housekeeping, hours * 0.5))
    day = booking.checkin_date + timedelta(days=1)
    while day < booking.checkout_date:
        specs.append((f"breakfast:{day.isoformat()}", day, time(8, 30), "breakfast", kitchen, hours * 0.5))
        day += timedelta(days=1)

    by_key = {task.auto_key: task for task in existing}
    desired = {spec[0] for spec in specs}
    for task in existing:
        if task.auto_key not in desired and task.status not in {"done", "completed"}:
            task.status = "cancelled"
    for key, day, at, kind, assignee, estimate in specs:
        task = by_key.get(key)
        if task is not None:
            # Work that has started is an operational record, not a template.
            if task.status in {"done", "completed", "in_progress"}:
                continue
            task.date, task.time, task.unit_id = day, at, booking.unit_id
            task.estimated_hours = estimate
            task.status = "planned"
        else:
            db.add(StaffTask(
                auto_key=key, booking_id=booking.id, unit_id=booking.unit_id,
                date=day, time=at, task_type=kind, assignee_name=assignee,
                estimated_hours=estimate, status="planned", currency=currency,
                notes=f"AUTO: {kind} per prenotazione #{booking.id}",
            ))
    db.flush()
