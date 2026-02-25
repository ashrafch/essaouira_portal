from sqlalchemy import Boolean, Column, DateTime, Integer, String, Text, func

from app.db import Base
from app.models.tenant_scoped import TenantScopedMixin


class MessageTemplate(TenantScopedMixin, Base):
    __tablename__ = "message_templates"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(128), nullable=False)
    trigger_type = Column(String(32), nullable=False)  # checkin / checkout
    offset_hours = Column(Integer, nullable=False, default=-24)
    channel = Column(String(32), nullable=False, default="email")  # email / whatsapp / sms
    subject = Column(String(255), nullable=True)
    body = Column(Text, nullable=False)
    is_active = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
