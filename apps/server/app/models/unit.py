from sqlalchemy import Column, Integer, String, Numeric, UniqueConstraint
from app.db import Base
from app.models.tenant_scoped import TenantScopedMixin


class Unit(TenantScopedMixin, Base):
    __tablename__ = "units"
    __table_args__ = (UniqueConstraint("tenant_id", "name", name="uq_units_tenant_name"),)

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, index=True, nullable=False)
    size_m2 = Column(Integer, nullable=True)
    capacity = Column(Integer, nullable=True)

    # 💰 tariffa base consigliata per notte (può essere sovrascritta sulla singola prenotazione)
    base_nightly_rate = Column(Numeric(10, 2), nullable=True)
    currency = Column(String(3), nullable=False, default="EUR")
