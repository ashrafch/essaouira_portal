from datetime import date

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.db import get_db
from app.domains.bookings.schemas import BookingCreate, BookingOut, BookingUpdate
from app.domains.bookings.service import (
    compute_booking_financials,
    create_auto_staff_tasks_for_booking,
)
from app.models.booking import Booking
from app.models.staff_task import StaffTask
from app.models.unit import Unit

router = APIRouter()


# ---------- BOOKING endpoints ----------


@router.get("/bookings", response_model=list[BookingOut])
def list_bookings(db: Session = Depends(get_db)):
    bookings = db.query(Booking).order_by(Booking.checkin_date).all()
    return bookings


@router.post("/bookings", response_model=BookingOut)
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

    financials = compute_booking_financials(db, payload, unit)

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
        nightly_rate=financials["nightly_rate"],
        total_price=financials["total_price"],
        cleaning_fee=financials["cleaning_fee"],
        city_tax=financials["city_tax"],
        channel_fee=financials["channel_fee"],
        currency=payload.currency,
        is_paid=payload.is_paid,
        has_late_checkout=payload.has_late_checkout,
    )
    db.add(booking)
    db.commit()
    db.refresh(booking)

    create_auto_staff_tasks_for_booking(db, booking)

    return booking


@router.put("/bookings/{booking_id}", response_model=BookingOut)
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

    financials = compute_booking_financials(db, payload, unit)

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
    booking.nightly_rate = financials["nightly_rate"]
    booking.total_price = financials["total_price"]
    booking.cleaning_fee = financials["cleaning_fee"]
    booking.city_tax = financials["city_tax"]
    booking.channel_fee = financials["channel_fee"]
    booking.currency = payload.currency
    booking.is_paid = payload.is_paid
    booking.has_late_checkout = payload.has_late_checkout

    db.commit()
    db.refresh(booking)

    create_auto_staff_tasks_for_booking(db, booking)

    return booking


@router.delete("/bookings/{booking_id}", status_code=204)
def delete_booking(booking_id: int, db: Session = Depends(get_db)):
    booking = db.query(Booking).filter(Booking.id == booking_id).first()
    if not booking:
        raise HTTPException(status_code=404, detail="Prenotazione non trovata")

    db.delete(booking)
    db.commit()
    return


# ---------- UNIT SCHEDULE (TIMELINE SINGOLA UNITÀ) ----------


@router.get("/units/{unit_id}/schedule")
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
