from datetime import datetime

from pydantic import BaseModel, ConfigDict


class UnitOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    property_id: int | None = None
    name: str
    size_m2: int | None
    capacity: int | None
    base_nightly_rate: float | None
    currency: str
    min_price: float | None = None
    max_price: float | None = None


class UnitUpdate(BaseModel):
    property_id: int | None = None
    name: str | None = None
    size_m2: int | None = None
    capacity: int | None = None
    base_nightly_rate: float | None = None
    currency: str | None = None
    min_price: float | None = None
    max_price: float | None = None


class PropertyOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    tenant_id: str
    name: str
    code: str
    status: str
    timezone: str
    address_line1: str | None = None
    city: str | None = None
    country: str | None = None
    metadata_json: str | None = None
    is_active: bool
    created_at: datetime | None = None
    updated_at: datetime | None = None


class PropertyCreate(BaseModel):
    name: str
    code: str | None = None
    status: str = "active"
    timezone: str = "Africa/Casablanca"
    address_line1: str | None = None
    city: str | None = None
    country: str | None = None
    metadata_json: str | None = None
    is_active: bool = True


class PropertyUpdate(BaseModel):
    name: str | None = None
    code: str | None = None
    status: str | None = None
    timezone: str | None = None
    address_line1: str | None = None
    city: str | None = None
    country: str | None = None
    metadata_json: str | None = None
    is_active: bool | None = None
