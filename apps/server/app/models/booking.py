from datetime import date
from sqlalchemy import Column, Integer, String, Date, ForeignKey
from sqlalchemy.orm import relationship

from app.db import Base


class Booking(Base):
    __tablename__ = "bookings"

    id = Column(Integer, primary_key=True, index=True)

    unit_id = Column(Integer, ForeignKey("units.id"), nullable=False)

    guest_name = Column(String, nullable=False)
    guest_email = Column(String, nullable=True)
    source = Column(String, nullable=False, default="direct")  # direct, airbnb, booking, ecc.

    checkin_date = Column(Date, nullable=False)
    checkout_date = Column(Date, nullable=False)

    notes = Column(String, nullable=True)

    unit = relationship("Unit", backref="bookings")
