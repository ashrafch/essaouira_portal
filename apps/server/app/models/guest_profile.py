from sqlalchemy import Column, DateTime, Integer, Numeric, String, UniqueConstraint, func

from app.db import Base
from app.models.tenant_scoped import TenantScopedMixin


class GuestProfile(TenantScopedMixin, Base):
    __tablename__ = "guest_profiles"
    __table_args__ = (UniqueConstraint("tenant_id", "email", name="uq_guest_profiles_tenant_email"),)

    id = Column(Integer, primary_key=True, index=True)
    full_name = Column(String(128), nullable=False)
    email = Column(String(255), nullable=False, index=True)
    phone = Column(String(64), nullable=True)
    notes = Column(String(500), nullable=True)
    total_stays = Column(Integer, nullable=False, default=0)
    total_revenue = Column(Numeric(12, 2), nullable=False, default=0)
    last_stay_date = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
