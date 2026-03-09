from sqlalchemy import Boolean, Column, DateTime, Integer, String, Text, UniqueConstraint
from sqlalchemy.sql import func

from app.db import Base
from app.models.tenant_scoped import TenantScopedMixin


class Property(TenantScopedMixin, Base):
    __tablename__ = "properties"
    __table_args__ = (
        UniqueConstraint("tenant_id", "code", name="uq_properties_tenant_code"),
    )

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(128), nullable=False)
    code = Column(String(64), nullable=False)
    status = Column(String(16), nullable=False, default="active")
    timezone = Column(String(64), nullable=False, default="Africa/Casablanca")
    address_line1 = Column(String(255), nullable=True)
    city = Column(String(128), nullable=True)
    country = Column(String(64), nullable=True)
    metadata_json = Column(Text, nullable=True)
    is_active = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)
