from datetime import date, time

from pydantic import BaseModel, ConfigDict, field_serializer


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
    pass


class BookingUpdate(BookingBase):
    pass


class BookingOut(BookingBase):
    id: int
