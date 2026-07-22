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


class SeasonIn(BaseModel):
    name: str
    start_date: date
    end_date: date
    adjustment_percent: float = 0
    unit_id: int | None = None
    priority: int = 0
    is_active: bool = True


class SeasonOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    start_date: date
    end_date: date
    adjustment_percent: float
    unit_id: int | None = None
    priority: int
    is_active: bool


class LeadTimeRuleIn(BaseModel):
    label: str
    min_days: int = 0
    max_days: int | None = None
    adjustment_percent: float = 0
    is_active: bool = True


class LeadTimeRuleOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    label: str
    min_days: int
    max_days: int | None = None
    adjustment_percent: float
    is_active: bool
