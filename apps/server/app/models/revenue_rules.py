from sqlalchemy import (
    Boolean,
    Column,
    Date,
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
    String,
)
from sqlalchemy.sql import func

from app.db import Base
from app.models.tenant_scoped import TenantScopedMixin


class PricingSeason(TenantScopedMixin, Base):
    """A date range that shifts recommended prices by a percentage.

    ``unit_id`` NULL means the season applies to every unit (portfolio-wide).
    When several seasons cover the same date, the highest ``priority`` wins.
    """

    __tablename__ = "pricing_seasons"

    id = Column(Integer, primary_key=True, index=True)
    unit_id = Column(Integer, ForeignKey("units.id"), nullable=True, index=True)
    name = Column(String(64), nullable=False)
    start_date = Column(Date, nullable=False)
    end_date = Column(Date, nullable=False)  # inclusive
    # e.g. 30 = +30%, -20 = -20%
    adjustment_percent = Column(Numeric(6, 2), nullable=False, default=0)
    priority = Column(Integer, nullable=False, default=0)
    is_active = Column(Boolean, nullable=False, default=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )


class LeadTimeRule(TenantScopedMixin, Base):
    """Adjust recommended prices by how far a date is from today (lead time).

    Matches when ``min_days <= lead_time <= max_days`` (``max_days`` NULL = open
    ended). Applies to every unit. Typical use: last-minute discounts for near
    dates, early-bird premiums for far-out dates.
    """

    __tablename__ = "lead_time_rules"

    id = Column(Integer, primary_key=True, index=True)
    label = Column(String(64), nullable=False)
    min_days = Column(Integer, nullable=False, default=0)
    max_days = Column(Integer, nullable=True)
    adjustment_percent = Column(Numeric(6, 2), nullable=False, default=0)
    is_active = Column(Boolean, nullable=False, default=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )
