from sqlalchemy import Column, Integer, String, Numeric
from app.db import Base


class PricingDefaults(Base):
    __tablename__ = "pricing_defaults"

    id = Column(Integer, primary_key=True, index=True)

    # extra legati alle prenotazioni
    default_cleaning_fee = Column(Numeric(10, 2), nullable=True)
    default_city_tax_per_night = Column(Numeric(10, 2), nullable=True)

    # 🔥 NOME ALLINEATO AL BACKEND / Pydantic / main.py
    default_channel_commission_percent = Column(Numeric(5, 2), nullable=True)

    # 🔥 NOME ALLINEATO AL BACKEND / main.py
    currency = Column(String(3), nullable=False, default="EUR")
