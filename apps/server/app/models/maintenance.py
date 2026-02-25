from sqlalchemy import Column, Integer, String, ForeignKey, Numeric, DateTime, Boolean
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.db import Base
from app.models.tenant_scoped import TenantScopedMixin


class MaintenanceTicket(TenantScopedMixin, Base):
    __tablename__ = "maintenance_tickets"

    id = Column(Integer, primary_key=True, index=True)

    # Titolo breve (es. "Lampadina bagno")
    title = Column(String, nullable=False)
    
    # Dettagli (es. "Quella sopra lo specchio, serve scala")
    description = Column(String, nullable=True)

    # Collegamenti opzionali
    unit_id = Column(Integer, ForeignKey("units.id"), nullable=True)
    unit = relationship("Unit")

    # Assegnato a (es. Manutentore o Manager)
    assigned_to_id = Column(Integer, ForeignKey("staff_members.id"), nullable=True)
    assigned_to = relationship("StaffMember")

    # --- STATI E TIPI ---
    # status: "todo", "in_progress", "done"
    status = Column(String, default="todo", nullable=False)
    
    # priority: "low", "medium", "high", "urgent"
    priority = Column(String, default="medium", nullable=False)

    # type: "repair" (guasto), "improvement" (acquisto/miglioria)
    ticket_type = Column(String, default="repair", nullable=False)

    # --- ECONOMIA (Opzionale) ---
    # Se la riparazione ha un costo vivo (es. idraulico esterno o acquisto materiale)
    cost = Column(Numeric(10, 2), nullable=True)
    currency = Column(String(3), default="EUR")

    # Date
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
