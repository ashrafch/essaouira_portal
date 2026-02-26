from sqlalchemy import Boolean, Column, DateTime, Integer, String, func

from app.db import Base


class Tenant(Base):
    __tablename__ = "tenants"

    id = Column(Integer, primary_key=True, index=True)
    tenant_id = Column(String(64), nullable=False, unique=True, index=True)
    name = Column(String(128), nullable=False)
    brand_primary_color = Column(String(16), nullable=True)
    brand_logo_url = Column(String(500), nullable=True)
    is_active = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
