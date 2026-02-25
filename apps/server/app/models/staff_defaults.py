from sqlalchemy import Column, Integer, String, Float
from app.db import Base
from app.models.tenant_scoped import TenantScopedMixin


class StaffDefaults(TenantScopedMixin, Base):
    __tablename__ = "staff_defaults"

    id = Column(Integer, primary_key=True, index=True)
    cleaning_default_assignee = Column(String(100), nullable=True)
    cleaning_default_cost = Column(Float, nullable=True)
    cleaning_default_hours = Column(Float, nullable=True)
    currency = Column(String(3), nullable=False, default="EUR")
