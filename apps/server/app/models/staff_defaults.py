from sqlalchemy import Column, Integer, String, Float
from app.db import Base


class StaffDefaults(Base):
    __tablename__ = "staff_defaults"

    id = Column(Integer, primary_key=True, index=True)
    cleaning_default_assignee = Column(String(100), nullable=True)
    cleaning_default_cost = Column(Float, nullable=True)
    cleaning_default_hours = Column(Float, nullable=True)
    currency = Column(String(3), nullable=False, default="EUR")
