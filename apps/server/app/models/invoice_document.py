from sqlalchemy import Column, Date, DateTime, ForeignKey, Integer, Numeric, String, UniqueConstraint, func
from sqlalchemy.orm import relationship

from app.db import Base
from app.models.tenant_scoped import TenantScopedMixin


class InvoiceDocument(TenantScopedMixin, Base):
    __tablename__ = "invoice_documents"
    __table_args__ = (UniqueConstraint("tenant_id", "invoice_number", name="uq_invoice_tenant_number"),)

    id = Column(Integer, primary_key=True, index=True)
    booking_id = Column(Integer, ForeignKey("bookings.id"), nullable=False, index=True)
    invoice_number = Column(String(64), nullable=False, index=True)
    issue_date = Column(Date, nullable=False)
    amount = Column(Numeric(10, 2), nullable=False)
    currency = Column(String(3), nullable=False, default="EUR")
    status = Column(String(32), nullable=False, default="issued")
    notes = Column(String(500), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    booking = relationship("Booking")
