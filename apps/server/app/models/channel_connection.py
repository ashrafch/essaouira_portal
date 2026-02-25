from sqlalchemy import Boolean, Column, DateTime, Integer, Numeric, String, Text, UniqueConstraint, func

from app.db import Base
from app.models.tenant_scoped import TenantScopedMixin


class ChannelConnection(TenantScopedMixin, Base):
    __tablename__ = "channel_connections"
    __table_args__ = (
        UniqueConstraint("tenant_id", "channel", name="uq_channel_connections_tenant_channel"),
    )

    id = Column(Integer, primary_key=True, index=True)
    channel = Column(String(32), nullable=False)
    listing_external_id = Column(String(128), nullable=True)
    commission_percent = Column(Numeric(5, 2), nullable=False, default=0)
    payout_delay_days = Column(Integer, nullable=False, default=0)
    is_active = Column(Boolean, nullable=False, default=True)
    sync_enabled = Column(Boolean, nullable=False, default=False)
    last_sync_at = Column(DateTime(timezone=True), nullable=True)
    last_sync_status = Column(String(32), nullable=True)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

