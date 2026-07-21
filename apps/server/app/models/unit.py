from sqlalchemy import Column, Integer, String, Numeric, ForeignKey
from app.db import Base


class Unit(Base):
    __tablename__ = "units"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, index=True, nullable=False)
    property_id = Column(Integer, ForeignKey("properties.id"), nullable=True, index=True)
    size_m2 = Column(Integer, nullable=True)
    capacity = Column(Integer, nullable=True)

    # 💰 tariffa base consigliata per notte (può essere sovrascritta sulla singola prenotazione)
    base_nightly_rate = Column(Numeric(10, 2), nullable=True)
    currency = Column(String(3), nullable=False, default="EUR")

    # Guardrail per il motore revenue: le tariffe consigliate vengono limitate a
    # questa banda [min_price, max_price] (nullable = nessun vincolo).
    min_price = Column(Numeric(10, 2), nullable=True)
    max_price = Column(Numeric(10, 2), nullable=True)
