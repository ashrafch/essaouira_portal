from sqlalchemy import Column, Integer, String, Numeric
from app.db import Base


class Unit(Base):
    __tablename__ = "units"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, index=True, nullable=False)
    size_m2 = Column(Integer, nullable=True)
    capacity = Column(Integer, nullable=True)

    # 💰 tariffa base consigliata per notte (può essere sovrascritta sulla singola prenotazione)
    base_nightly_rate = Column(Numeric(10, 2), nullable=True)
    currency = Column(String(3), nullable=False, default="EUR")
