from datetime import date

from pydantic import BaseModel, ConfigDict


class RateDayOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    date: date
    price: float | None = None
    min_stay: int | None = None
    currency: str = "EUR"
    # base | rule | reco | manual
    price_source: str = "base"
    is_override: bool = False
    # True when a rate_calendar row exists; False when falling back to base rate.
    is_stored: bool = False


class RateCalendarOut(BaseModel):
    unit_id: int
    unit_name: str
    from_date: date
    to_date: date
    currency: str = "EUR"
    days: list[RateDayOut]


class RateEntryUpsert(BaseModel):
    date: date
    price: float
    min_stay: int | None = None
    currency: str | None = None


class RateCalendarUpsertIn(BaseModel):
    unit_id: int
    entries: list[RateEntryUpsert]


class RecommendationDay(BaseModel):
    unit_id: int
    date: date
    base_price: float
    recommended_price: float
    occupancy: float
    reason: str


class RecommendationsOut(BaseModel):
    unit_id: int
    unit_name: str
    from_date: date
    to_date: date
    recommendations: list[RecommendationDay]


class ApplyRecommendationsIn(BaseModel):
    unit_id: int
    from_date: date
    to_date: date


class ApplyRecommendationsOut(BaseModel):
    unit_id: int
    applied: int
    skipped_overrides: int
