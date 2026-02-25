from sqlalchemy import Column, DateTime, ForeignKey, Integer, Numeric, String, func
from sqlalchemy.orm import relationship

from app.db import Base
from app.models.tenant_scoped import TenantScopedMixin


class PaymentTransaction(TenantScopedMixin, Base):
    __tablename__ = "payment_transactions"

    id = Column(Integer, primary_key=True, index=True)
    booking_id = Column(Integer, ForeignKey("bookings.id"), nullable=False, index=True)
    amount = Column(Numeric(10, 2), nullable=False)
    currency = Column(String(3), nullable=False, default="EUR")
    method = Column(String(32), nullable=False, default="cash")
    status = Column(String(32), nullable=False, default="captured")
    external_ref = Column(String(128), nullable=True)
    notes = Column(String(500), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    booking = relationship("Booking")
