from datetime import date

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.db import get_db
from app.domains.bookings.schemas import BookingCreate, BookingOut, BookingUpdate
from app.domains.bookings.service import (
    save_booking,
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
    return save_booking(db, payload)


@router.put("/bookings/{booking_id}", response_model=BookingOut)
def update_booking(booking_id: int, payload: BookingUpdate, db: Session = Depends(get_db)):
    return save_booking(db, payload, booking_id)


@router.delete("/bookings/{booking_id}", status_code=204)
def delete_booking(booking_id: int, db: Session = Depends(get_db)):
    booking = db.query(Booking).filter(Booking.id == booking_id).first()
    if not booking:
        raise HTTPException(status_code=404, detail="Prenotazione non trovata")

    # Cancel pending work before detaching history from a deleted reservation.
    for task in booking.staff_tasks:
        if task.auto_key and task.status not in {"done", "completed"}:
            task.status = "cancelled"
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
            Booking.status != "cancelled",
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
