from datetime import date

from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from pydantic import BaseModel

from app.db import Base, engine, get_db
from app.models.unit import Unit
from app.models.booking import Booking

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
    # Crea le tabelle
    Base.metadata.create_all(bind=engine)

    db = next(get_db())

    # Seed unità se non ci sono
    if db.query(Unit).count() == 0:
        units_seed = [
            Unit(name="Unit A", size_m2=64, capacity=6),
            Unit(name="Unit B", size_m2=62, capacity=6),
            Unit(name="Unit C", size_m2=60, capacity=6),
            Unit(name="Unit D", size_m2=61, capacity=6),
            Unit(name="Unit E", size_m2=63, capacity=6),
            Unit(name="Unit F", size_m2=60, capacity=6),
        ]
        db.add_all(units_seed)
        db.commit()


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/units")
def list_units(db: Session = Depends(get_db)):
    units = db.query(Unit).all()
    return [
        {
            "id": u.id,
            "name": u.name,
            "size_m2": u.size_m2,
            "capacity": u.capacity,
        }
        for u in units
    ]


# ---------- Booking Schemas ----------


class BookingCreate(BaseModel):
    unit_id: int
    guest_name: str
    guest_email: str | None = None
    source: str = "direct"
    checkin_date: date
    checkout_date: date
    notes: str | None = None


class BookingUpdate(BaseModel):
    unit_id: int
    guest_name: str
    guest_email: str | None = None
    source: str = "direct"
    checkin_date: date
    checkout_date: date
    notes: str | None = None


class BookingOut(BaseModel):
    id: int
    unit_id: int
    guest_name: str
    guest_email: str | None
    source: str
    checkin_date: date
    checkout_date: date
    notes: str | None

    class Config:
        from_attributes = True


# ---------- Booking endpoints ----------


@app.get("/bookings", response_model=list[BookingOut])
def list_bookings(db: Session = Depends(get_db)):
    bookings = db.query(Booking).order_by(Booking.checkin_date).all()
    return bookings


@app.post("/bookings", response_model=BookingOut)
def create_booking(payload: BookingCreate, db: Session = Depends(get_db)):
    # 1) controlla che l'unità esista
    unit = db.query(Unit).filter(Unit.id == payload.unit_id).first()
    if not unit:
        raise HTTPException(status_code=400, detail="Unità inesistente")

    # 2) controllo date semplice
    if payload.checkout_date <= payload.checkin_date:
        raise HTTPException(
            status_code=400,
            detail="checkout_date deve essere dopo checkin_date",
        )

    # 3) controllo overlap prenotazioni sulla stessa unità
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

    # 4) crea la prenotazione
    booking = Booking(
        unit_id=payload.unit_id,
        guest_name=payload.guest_name,
        guest_email=payload.guest_email,
        source=payload.source,
        checkin_date=payload.checkin_date,
        checkout_date=payload.checkout_date,
        notes=payload.notes,
    )
    db.add(booking)
    db.commit()
    db.refresh(booking)
    return booking


@app.put("/bookings/{booking_id}", response_model=BookingOut)
def update_booking(
    booking_id: int, payload: BookingUpdate, db: Session = Depends(get_db)
):
    booking = db.query(Booking).filter(Booking.id == booking_id).first()
    if not booking:
        raise HTTPException(status_code=404, detail="Prenotazione non trovata")

    # controlla unità
    unit = db.query(Unit).filter(Unit.id == payload.unit_id).first()
    if not unit:
        raise HTTPException(status_code=400, detail="Unità inesistente")

    # controllo date
    if payload.checkout_date <= payload.checkin_date:
        raise HTTPException(
            status_code=400,
            detail="checkout_date deve essere dopo checkin_date",
        )

    # controllo overlap escludendo questa stessa prenotazione
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

    # applica modifiche
    booking.unit_id = payload.unit_id
    booking.guest_name = payload.guest_name
    booking.guest_email = payload.guest_email
    booking.source = payload.source
    booking.checkin_date = payload.checkin_date
    booking.checkout_date = payload.checkout_date
    booking.notes = payload.notes

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
