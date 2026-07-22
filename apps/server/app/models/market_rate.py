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


class MarketRate(TenantScopedMixin, Base):
    """Manual competitor-set reference: a market nightly rate for a period.

    We have no live market feed (see the analysis doc), so the owner enters a few
    reference rates by hand. These drive the *out-of-band* pricing alert — they
    do not silently override the recommendation engine. ``unit_id`` NULL applies
    portfolio-wide.
    """

    __tablename__ = "market_rates"

    id = Column(Integer, primary_key=True, index=True)
    unit_id = Column(Integer, ForeignKey("units.id"), nullable=True, index=True)
    label = Column(String(96), nullable=False)
    nightly_rate = Column(Numeric(10, 2), nullable=False)
    start_date = Column(Date, nullable=False)
    end_date = Column(Date, nullable=False)  # inclusive
    is_active = Column(Boolean, nullable=False, default=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )
