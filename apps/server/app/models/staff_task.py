from sqlalchemy import (
    Column,
    Integer,
    String,
    Date,
    Time,
    ForeignKey,
    Numeric,
)
from sqlalchemy.orm import relationship

from app.db import Base


class StaffTask(Base):
    __tablename__ = "staff_tasks"

    id = Column(Integer, primary_key=True, index=True)

    # opzionale: collegata a una prenotazione o solo all'unità / struttura
    booking_id = Column(Integer, ForeignKey("bookings.id"), nullable=True)
    unit_id = Column(Integer, ForeignKey("units.id"), nullable=True)

    date = Column(Date, nullable=False)
    # opzionale, se ti serve orario preciso
    time = Column(Time, nullable=True)

    task_type = Column(
        String, nullable=False
    )  # es: "cleaning", "checkin", "breakfast", "maintenance"
    assignee_name = Column(String, nullable=True)

    estimated_hours = Column(Numeric(5, 2), nullable=True)
    status = Column(
        String, nullable=False, default="planned"
    )  # planned / in_progress / done / cancelled

    notes = Column(String, nullable=True)

    # costo interno associato alla task (es. costo pulizie singolo turno)
    cost = Column(Numeric(10, 2), nullable=True)
    currency = Column(String(3), nullable=False, default="EUR")

    booking = relationship("Booking", backref="staff_tasks")
    unit = relationship("Unit", backref="staff_tasks")
