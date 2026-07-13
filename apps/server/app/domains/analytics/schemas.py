from datetime import date
from typing import Dict, List

from pydantic import BaseModel, ConfigDict


class RevenueByUnit(BaseModel):
    unit_id: int
    unit_name: str
    revenue: float
    nights_occupied: int


class MonthSummary(BaseModel):
    year: int
    month: int
    nights_total: int
    nights_occupied: int
    occupancy_rate: float
    revenue_total: float
    adr: float | None  # Average Daily Rate
    revenue_by_source: dict[str, float]
    revenue_by_unit: list[RevenueByUnit]


class CostByCategory(BaseModel):
    category: str
    total: float


class PnLMonthSummary(BaseModel):
    year: int
    month: int

    nights_total: int
    nights_occupied: int
    occupancy_rate: float
    adr: float | None

    revenue_total: float
    revenue_by_source: Dict[str, float]
    revenue_by_unit: List[RevenueByUnit]

    costs_total: float
    costs_by_category: List[CostByCategory]

    profit: float


class MonthCostLine(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    date: date
    category: str
    description: str | None = None
    amount: float
    currency: str = "EUR"
    unit_id: int | None = None
    booking_id: int | None = None
    staff_task_id: int | None = None
    origin: str


class AdvancedKpiSummary(BaseModel):
    year: int
    month: int
    revpar: float
    avg_length_of_stay: float | None
    direct_share_percent: float
    paid_booking_percent: float
    pipeline_revenue_next_30_days: float
    upcoming_arrivals_next_7_days: int


class AlertItem(BaseModel):
    severity: str
    code: str
    title: str
    count: int
    details: str


class OwnerMonthlyReport(BaseModel):
    """Consolidated owner-facing monthly report.

    Purely a composition of MonthSummary/PnLMonthSummary/AdvancedKpiSummary —
    no business logic is recomputed here.
    """

    year: int
    month: int

    nights_total: int
    nights_occupied: int
    occupancy_rate: float
    adr: float | None
    revpar: float

    revenue_total: float
    revenue_by_source: Dict[str, float]
    revenue_by_unit: List[RevenueByUnit]

    costs_total: float
    costs_by_category: List[CostByCategory]

    profit: float
