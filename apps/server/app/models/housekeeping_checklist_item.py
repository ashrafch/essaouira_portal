from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String, func
from sqlalchemy.orm import relationship

from app.db import Base
from app.models.tenant_scoped import TenantScopedMixin


class HousekeepingChecklistItem(TenantScopedMixin, Base):
    __tablename__ = "housekeeping_checklist_items"

    id = Column(Integer, primary_key=True, index=True)
    staff_task_id = Column(Integer, ForeignKey("staff_tasks.id"), nullable=False, index=True)
    title = Column(String(255), nullable=False)
    is_done = Column(Boolean, nullable=False, default=False)
    done_at = Column(DateTime(timezone=True), nullable=True)
    notes = Column(String(500), nullable=True)
    photo_url = Column(String(500), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    staff_task = relationship("StaffTask")
