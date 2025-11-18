from sqlalchemy import (
    Column,
    Integer,
    String,
    Date,
    ForeignKey,
    Numeric,
    Boolean,
)
from sqlalchemy.orm import relationship

from app.db import Base


class Booking(Base):
    __tablename__ = "bookings"
    __table_args__ = {"extend_existing": True}  # evita il casino di doppia definizione

    id = Column(Integer, primary_key=True, index=True)

    unit_id = Column(Integer, ForeignKey("units.id"), nullable=False)
    unit = relationship("Unit")

    guest_name = Column(String, nullable=False)
    guest_email = Column(String, nullable=True)

    # direct / airbnb / booking / other
    source = Column(String, nullable=False, default="direct")

    checkin_date = Column(Date, nullable=False)
    checkout_date = Column(Date, nullable=False)

    notes = Column(String, nullable=True)

    # 💰 prezzi
    nightly_rate = Column(Numeric(10, 2), nullable=True)
    total_price = Column(Numeric(10, 2), nullable=True)
    currency = Column(String(3), nullable=False, default="EUR")

    cleaning_fee = Column(Numeric(10, 2), nullable=True)
    city_tax = Column(Numeric(10, 2), nullable=True)
    channel_fee = Column(Numeric(10, 2), nullable=True)

    is_paid = Column(Boolean, nullable=False, default=False)
