from sqlalchemy import Boolean, Column, DateTime, Integer, Numeric, String, Text, func

from app.db import Base
from app.models.tenant_scoped import TenantScopedMixin


class RevenueRule(TenantScopedMixin, Base):
    __tablename__ = "revenue_rules"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(128), nullable=False)
    is_active = Column(Boolean, nullable=False, default=True)
    priority = Column(Integer, nullable=False, default=100)
    min_occupancy_percent = Column(Numeric(5, 2), nullable=False, default=0)
    max_occupancy_percent = Column(Numeric(5, 2), nullable=False, default=100)
    min_lead_days = Column(Integer, nullable=False, default=0)
    max_lead_days = Column(Integer, nullable=False, default=365)
    adjustment_percent = Column(Numeric(6, 2), nullable=False, default=0)
    min_price = Column(Numeric(10, 2), nullable=True)
    max_price = Column(Numeric(10, 2), nullable=True)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

