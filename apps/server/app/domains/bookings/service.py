from datetime import time, timedelta

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

    total_price = payload.total_price or base_total

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


def create_auto_staff_tasks_for_booking(db: Session, booking: Booking) -> None:
    defaults = get_or_create_staff_defaults(db)

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

    housekeeping_assignee = find_default_assignee_for_role(
        db, StaffRole.housekeeping, defaults.cleaning_default_assignee
    )
    reception_assignee = find_default_assignee_for_role(
        db, StaffRole.reception_day, housekeeping_assignee
    )
    kitchen_assignee = find_default_assignee_for_role(
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
