from sqlalchemy import Boolean, Column, DateTime, Integer, String, UniqueConstraint, func

from app.db import Base
from app.models.tenant_scoped import TenantScopedMixin


class User(TenantScopedMixin, Base):
    __tablename__ = "users"
    __table_args__ = (UniqueConstraint("tenant_id", "username", name="uq_users_tenant_username"),)

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(64), nullable=False, index=True)
    password_hash = Column(String(255), nullable=False)
    role = Column(String(32), nullable=False, default="viewer")
    is_active = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
