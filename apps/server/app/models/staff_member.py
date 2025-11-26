from sqlalchemy import Column, Integer, String, Float, Boolean
from app.db import Base


class StaffMember(Base):
    __tablename__ = "staff_members"

    id = Column(Integer, primary_key=True, index=True)
    full_name = Column(String, nullable=False)
    role = Column(String, nullable=True)
    email = Column(String, nullable=True)
    phone = Column(String, nullable=True)
    color_hex = Column(String, nullable=True)
    hourly_cost = Column(Float, nullable=True)
    is_active = Column(Boolean, default=True)
