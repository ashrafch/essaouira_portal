from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
)
from sqlalchemy.sql import func

from app.db import Base
from app.models.tenant_scoped import TenantScopedMixin


class ChannelConnection(TenantScopedMixin, Base):
    """An external calendar (iCal) connection for a unit.

    Fase 3 covers *availability* sync: we import the channel's busy dates to
    block our calendar (anti double-booking) and expose our own dates for the
    channel to import. Price push is a later phase behind a channel adapter.
    """

    __tablename__ = "channel_connections"

    id = Column(Integer, primary_key=True, index=True)
    unit_id = Column(Integer, ForeignKey("units.id"), nullable=False, index=True)
    # airbnb / booking / vrbo / other
    channel = Column(String(32), nullable=False, default="other")
    # Remote .ics URL to poll for busy dates (None = export-only connection).
    ical_import_url = Column(Text, nullable=True)
    external_ref = Column(String(128), nullable=True)
    is_active = Column(Boolean, nullable=False, default=True)

    last_sync_at = Column(DateTime(timezone=True), nullable=True)
    # never / ok / partial / error
    last_sync_status = Column(String(16), nullable=False, default="never")
    last_sync_message = Column(Text, nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )
