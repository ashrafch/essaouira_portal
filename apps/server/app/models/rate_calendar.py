from sqlalchemy import (
    Boolean,
    Column,
    Date,
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
    String,
    UniqueConstraint,
)
from sqlalchemy.sql import func

from app.db import Base
from app.models.tenant_scoped import TenantScopedMixin


class RateCalendar(TenantScopedMixin, Base):
    """Per-unit, per-date nightly price and minimum-stay.

    This is the core primitive the revenue engine writes to and the booking
    financials read from. One row per (unit, date). Absence of a row means
    "fall back to Unit.base_nightly_rate" — so an empty calendar keeps the
    legacy flat-rate behaviour unchanged.
    """

    __tablename__ = "rate_calendar"
    __table_args__ = (
        UniqueConstraint("unit_id", "date", name="uq_rate_calendar_unit_date"),
        {"extend_existing": True},
    )

    id = Column(Integer, primary_key=True, index=True)
    unit_id = Column(Integer, ForeignKey("units.id"), nullable=False, index=True)
    date = Column(Date, nullable=False, index=True)

    price = Column(Numeric(10, 2), nullable=False)
    # Minimum nights required to start a stay on this date (None = no constraint).
    min_stay = Column(Integer, nullable=True)
    currency = Column(String(3), nullable=False, default="EUR")

    # Provenance of the price: base | rule | reco | manual.
    price_source = Column(String(16), nullable=False, default="manual")
    # A manual override locks the day: recomputes/recommendations must skip it.
    is_override = Column(Boolean, nullable=False, default=False)

    created_at = Column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )
