from sqlalchemy import (
    Column,
    Integer,
    String,
    Date,
    ForeignKey,
    Numeric,
    Boolean,
    Time,
)
from sqlalchemy.orm import relationship

from app.db import Base
from app.models.tenant_scoped import TenantScopedMixin


class Booking(TenantScopedMixin, Base):
    __tablename__ = "bookings"
    __table_args__ = {"extend_existing": True}  # evita conflitti se recreate_all

    id = Column(Integer, primary_key=True, index=True)

    # ----------------------
    #   RELAZIONI
    # ----------------------
    unit_id = Column(Integer, ForeignKey("units.id"), nullable=False)
    unit = relationship("Unit")

    # ----------------------
    #   DATI OSPITE
    # ----------------------
    guest_name = Column(String, nullable=False)
    guest_email = Column(String, nullable=True)
    guest_phone = Column(String, nullable=True)  # <-- Nuovo: Telefono/WhatsApp

    # Composizione gruppo
    num_adults = Column(Integer, nullable=False, default=1)  # <-- Nuovo
    num_children = Column(Integer, nullable=False, default=0)  # <-- Nuovo

    # Orario previsto di arrivo
    estimated_arrival_time = Column(Time, nullable=True)  # <-- Nuovo

    # direct / airbnb / booking / other
    source = Column(String, nullable=False, default="direct")

    # ----------------------
    #   DATE
    # ----------------------
    checkin_date = Column(Date, nullable=False)
    checkout_date = Column(Date, nullable=False)

    notes = Column(String, nullable=True)

    # ----------------------
    #   ECONOMIA DELLA PRENOTAZIONE
    # ----------------------
    nightly_rate = Column(Numeric(10, 2), nullable=True)
    total_price = Column(Numeric(10, 2), nullable=True)
    currency = Column(String(3), nullable=False, default="EUR")

    cleaning_fee = Column(Numeric(10, 2), nullable=True)
    city_tax = Column(Numeric(10, 2), nullable=True)
    channel_fee = Column(Numeric(10, 2), nullable=True)

    is_paid = Column(Boolean, nullable=False, default=False)

    # ----------------------
    #   LATE CHECKOUT
    # ----------------------
    has_late_checkout = Column(Boolean, nullable=False, default=False)
