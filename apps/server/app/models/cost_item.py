from sqlalchemy import Column, Integer, String, Date, Numeric, ForeignKey
from sqlalchemy.orm import relationship

from app.db import Base


class CostItem(Base):
    __tablename__ = "cost_items"

    id = Column(Integer, primary_key=True, index=True)

    date = Column(Date, nullable=False)
    category = Column(
        String, nullable=False
    )  # es: "cleaning", "utilities", "maintenance", "taxes", "marketing", "other"

    description = Column(String, nullable=True)

    amount = Column(Numeric(10, 2), nullable=False)
    currency = Column(String(3), nullable=False, default="EUR")

    # se il costo è associato a un appartamento specifico (es. manutenzione)
    unit_id = Column(Integer, ForeignKey("units.id"), nullable=True)
    unit = relationship("Unit", backref="cost_items")
