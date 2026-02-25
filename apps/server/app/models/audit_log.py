from sqlalchemy import Column, DateTime, Integer, String, Text, func

from app.db import Base
from app.models.tenant_scoped import TenantScopedMixin


class AuditLog(TenantScopedMixin, Base):
    __tablename__ = "audit_logs"

    id = Column(Integer, primary_key=True, index=True)
    event_type = Column(String(32), nullable=False, default="write")
    username = Column(String(128), nullable=True)
    role = Column(String(32), nullable=True)
    method = Column(String(8), nullable=False)
    path = Column(String(255), nullable=False)
    status_code = Column(Integer, nullable=False)
    client_ip = Column(String(64), nullable=True)
    details = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
