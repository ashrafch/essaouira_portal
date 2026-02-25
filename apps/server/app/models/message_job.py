from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import relationship

from app.db import Base
from app.models.tenant_scoped import TenantScopedMixin


class MessageJob(TenantScopedMixin, Base):
    __tablename__ = "message_jobs"

    id = Column(Integer, primary_key=True, index=True)
    booking_id = Column(Integer, ForeignKey("bookings.id"), nullable=False, index=True)
    template_id = Column(Integer, ForeignKey("message_templates.id"), nullable=False, index=True)
    channel = Column(String(32), nullable=False, default="email")
    recipient = Column(String(255), nullable=True)
    scheduled_at = Column(DateTime(timezone=True), nullable=False)
    status = Column(String(32), nullable=False, default="scheduled")  # scheduled/sent/failed/cancelled
    payload = Column(Text, nullable=True)
    error_message = Column(Text, nullable=True)
    sent_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    booking = relationship("Booking")
    template = relationship("MessageTemplate")
