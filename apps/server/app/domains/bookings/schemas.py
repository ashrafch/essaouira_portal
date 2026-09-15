from datetime import date, time

from pydantic import BaseModel, ConfigDict, Field, field_serializer, field_validator


class BookingBase(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    unit_id: int
    guest_name: str
    guest_email: str | None = None

    guest_phone: str | None = None
    num_adults: int = 1
    num_children: int = 0
    estimated_arrival_time: time | None = None

    source: str = "direct"
    # pending / confirmed / cancelled / hold
    status: str = "confirmed"
    checkin_date: date
    checkout_date: date
    notes: str | None = None

    # campi economici
    nightly_rate: float | None = None
    total_price: float | None = None
    cleaning_fee: float | None = None
    city_tax: float | None = None
    channel_fee: float | None = None
    currency: str = "EUR"
    is_paid: bool = False

    # late check-out
    has_late_checkout: bool = False

    @field_serializer("estimated_arrival_time")
    def _serialize_estimated_arrival_time(self, value: time | None) -> str | None:
        # Mantiene il formato storico "HH:MM" (ex json_encoders di Pydantic v1).
        if value is None:
            return None
        return value.strftime("%H:%M")


class BookingCreate(BookingBase):
    num_adults: int = Field(default=1, ge=1)
    num_children: int = Field(default=0, ge=0)

    @field_validator("status")
    @classmethod
    def validate_status(cls, value: str) -> str:
        if value not in {"pending", "confirmed", "cancelled", "hold"}:
            raise ValueError("Invalid booking status")
        return value

    @field_validator("nightly_rate", "total_price", "cleaning_fee", "city_tax", "channel_fee")
    @classmethod
    def validate_amount(cls, value: float | None) -> float | None:
        import math
        if value is not None and (not math.isfinite(value) or value < 0):
            raise ValueError("Amount must be finite and non-negative")
        return value


class BookingUpdate(BookingCreate):
    pass


class BookingOut(BookingBase):
    id: int
