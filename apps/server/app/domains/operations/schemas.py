from datetime import date, datetime
from enum import Enum
from typing import Optional

from pydantic import BaseModel, ConfigDict

from app.main_types import StaffRole


# ---------- STAFF TASKS ----------


class StaffTaskBase(BaseModel):
    date: date
    # lato API: stringa "HH:MM" oppure null
    time: str | None = None
    task_type: str
    assignee_name: Optional[str] = None
    estimated_hours: Optional[float] = None
    status: str = "planned"
    notes: Optional[str] = None
    cost: Optional[float] = None
    currency: str = "EUR"
    booking_id: Optional[int] = None
    unit_id: Optional[int] = None


class StaffTaskCreate(StaffTaskBase):
    pass


class StaffTaskUpdate(StaffTaskBase):
    pass


class StaffTaskOut(StaffTaskBase):
    model_config = ConfigDict(from_attributes=True)

    id: int


# ---------- COST ITEMS ----------


class CostItemBase(BaseModel):
    date: date
    category: str
    description: str | None = None
    amount: float
    currency: str = "EUR"
    unit_id: int | None = None


class CostItemCreate(CostItemBase):
    pass


class CostItemUpdate(CostItemBase):
    pass


class CostItemOut(CostItemBase):
    model_config = ConfigDict(from_attributes=True)

    id: int


# ---------- STAFF DEFAULTS ----------


class StaffDefaultsOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    cleaning_default_assignee: str | None = None
    cleaning_default_cost: float | None = None
    cleaning_default_hours: float | None = None
    currency: str = "EUR"


class StaffDefaultsUpdate(BaseModel):
    cleaning_default_assignee: str | None = None
    cleaning_default_cost: float | None = None
    cleaning_default_hours: float | None = None
    currency: str | None = None


# ---------- STAFF MEMBERS ----------


class StaffMemberBase(BaseModel):
    name: str
    role: StaffRole | None = None
    color_hex: str | None = None
    hourly_cost: float | None = None
    is_active: bool = True


class StaffMemberCreate(StaffMemberBase):
    pass


class StaffMemberUpdate(BaseModel):
    name: str | None = None
    role: StaffRole | None = None
    color_hex: str | None = None
    hourly_cost: float | None = None
    is_active: bool | None = None


class StaffMemberOut(StaffMemberBase):
    model_config = ConfigDict(from_attributes=True)

    id: int


# ---------- PRICING DEFAULTS ----------


class PricingDefaultsOut(BaseModel):
    default_cleaning_fee: float | None = None
    default_city_tax_per_night: float | None = None
    default_channel_fee_percent: float | None = None
    default_currency: str = "EUR"


class PricingDefaultsUpdate(BaseModel):
    default_cleaning_fee: float | None = None
    default_city_tax_per_night: float | None = None
    default_channel_fee_percent: float | None = None
    default_currency: str | None = None


# ---------- MAINTENANCE ----------


class TicketStatus(str, Enum):
    todo = "todo"
    in_progress = "in_progress"
    done = "done"


class TicketPriority(str, Enum):
    low = "low"
    medium = "medium"
    high = "high"
    urgent = "urgent"


class TicketType(str, Enum):
    repair = "repair"
    improvement = "improvement"
    purchase = "purchase"


class MaintenanceBase(BaseModel):
    title: str
    description: str | None = None
    unit_id: int | None = None
    assigned_to_id: int | None = None
    status: TicketStatus = TicketStatus.todo
    priority: TicketPriority = TicketPriority.medium
    ticket_type: TicketType = TicketType.repair
    cost: float | None = None
    currency: str = "EUR"


class MaintenanceCreate(MaintenanceBase):
    pass


class MaintenanceUpdate(BaseModel):
    title: str | None = None
    description: str | None = None
    unit_id: int | None = None
    assigned_to_id: int | None = None
    status: TicketStatus | None = None
    priority: TicketPriority | None = None
    ticket_type: TicketType | None = None
    cost: float | None = None
    currency: str | None = None


class MaintenanceOut(MaintenanceBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    created_at: datetime | None = None
    updated_at: datetime | None = None
