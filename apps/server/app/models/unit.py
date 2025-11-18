from sqlalchemy import Column, Integer, String
from app.db import Base


class Unit(Base):
    __tablename__ = "units"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, index=True, nullable=False)
    size_m2 = Column(Integer, nullable=True)
    capacity = Column(Integer, nullable=False, default=6)
