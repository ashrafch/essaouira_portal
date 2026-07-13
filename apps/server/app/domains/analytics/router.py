import csv
import io
from typing import List

from fastapi import APIRouter, Depends, Query
from fastapi.responses import Response, StreamingResponse
from sqlalchemy.orm import Session

from app.db import get_db
from app.domains.analytics.schemas import (
    AdvancedKpiSummary,
    AlertItem,
    MonthCostLine,
    MonthSummary,
    OwnerMonthlyReport,
    PnLMonthSummary,
)
from app.domains.analytics.service import (
    collect_costs_for_month,
    compute_advanced_kpis,
    compute_alerts_today,
    compute_month_pnl,
    compute_month_summary,
    compute_owner_monthly_report,
    get_month_range,
)

router = APIRouter()


@router.get("/analytics/month-summary", response_model=MonthSummary)
def month_summary(
    year: int = Query(..., ge=2000, le=2100),
    month: int = Query(..., ge=1, le=12),
    db: Session = Depends(get_db),
):
    return compute_month_summary(db, year, month)


@router.get("/analytics/month-pnl", response_model=PnLMonthSummary)
def month_pnl(
    year: int = Query(..., ge=2000, le=2100),
    month: int = Query(..., ge=1, le=12),
    db: Session = Depends(get_db),
):
    return compute_month_pnl(db, year, month)


@router.get("/analytics/month-cost-lines", response_model=List[MonthCostLine])
def month_cost_lines(
    year: int = Query(..., ge=2000, le=2100),
    month: int = Query(..., ge=1, le=12),
    db: Session = Depends(get_db),
):
    month_start, next_month_start, _ = get_month_range(year, month)
    _, _, cost_lines = collect_costs_for_month(db, month_start, next_month_start)
    return [MonthCostLine(**line) for line in cost_lines]


@router.get("/analytics/advanced-kpis", response_model=AdvancedKpiSummary)
def advanced_kpis(
    year: int = Query(..., ge=2000, le=2100),
    month: int = Query(..., ge=1, le=12),
    db: Session = Depends(get_db),
):
    return compute_advanced_kpis(db, year, month)


@router.get("/alerts/today", response_model=List[AlertItem])
def alerts_today(db: Session = Depends(get_db)):
    return compute_alerts_today(db)


@router.get("/analytics/month-cost-lines.csv")
def month_cost_lines_csv(
    year: int = Query(..., ge=2000, le=2100),
    month: int = Query(..., ge=1, le=12),
    db: Session = Depends(get_db),
):
    month_start, next_month_start, _ = get_month_range(year, month)
    _, _, cost_lines = collect_costs_for_month(db, month_start, next_month_start)

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(
        [
            "date",
            "category",
            "description",
            "amount",
            "currency",
            "unit_id",
            "booking_id",
            "staff_task_id",
            "origin",
        ]
    )
    for line in cost_lines:
        writer.writerow(
            [
                line.get("date"),
                line.get("category"),
                line.get("description"),
                line.get("amount"),
                line.get("currency"),
                line.get("unit_id"),
                line.get("booking_id"),
                line.get("staff_task_id"),
                line.get("origin"),
            ]
        )

    filename = f"month_cost_lines_{year}_{month:02d}.csv"
    return Response(
        content=output.getvalue(),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename=\"{filename}\"'},
    )


@router.get("/analytics/report/monthly", response_model=OwnerMonthlyReport)
def owner_monthly_report(
    year: int = Query(..., ge=2000, le=2100),
    month: int = Query(..., ge=1, le=12),
    db: Session = Depends(get_db),
):
    """Consolidated owner report (occupancy, revenue, costs, profit, ADR/RevPAR).

    Composes the existing month-pnl and advanced-kpis computations; no
    business logic is recomputed here.
    """
    return compute_owner_monthly_report(db, year, month)


def _owner_monthly_report_csv_text(report: OwnerMonthlyReport) -> str:
    output = io.StringIO()
    writer = csv.writer(output)

    writer.writerow(["section", "metric", "value"])
    writer.writerow(["summary", "year", report.year])
    writer.writerow(["summary", "month", report.month])
    writer.writerow(["summary", "nights_total", report.nights_total])
    writer.writerow(["summary", "nights_occupied", report.nights_occupied])
    writer.writerow(["summary", "occupancy_rate_percent", report.occupancy_rate])
    writer.writerow(["summary", "adr", report.adr if report.adr is not None else ""])
    writer.writerow(["summary", "revpar", report.revpar])
    writer.writerow(["summary", "revenue_total", report.revenue_total])
    writer.writerow(["summary", "costs_total", report.costs_total])
    writer.writerow(["summary", "profit", report.profit])

    writer.writerow([])
    writer.writerow(["revenue_by_unit", "unit_id", "unit_name", "revenue", "nights_occupied"])
    for item in report.revenue_by_unit:
        writer.writerow(["revenue_by_unit", item.unit_id, item.unit_name, item.revenue, item.nights_occupied])

    writer.writerow([])
    writer.writerow(["costs_by_category", "category", "total"])
    for item in report.costs_by_category:
        writer.writerow(["costs_by_category", item.category, item.total])

    writer.writerow([])
    writer.writerow(["revenue_by_source", "source", "revenue"])
    for source, revenue in report.revenue_by_source.items():
        writer.writerow(["revenue_by_source", source, revenue])

    return output.getvalue()


@router.get("/analytics/report/monthly.csv")
def owner_monthly_report_csv(
    year: int = Query(..., ge=2000, le=2100),
    month: int = Query(..., ge=1, le=12),
    db: Session = Depends(get_db),
):
    report = compute_owner_monthly_report(db, year, month)
    csv_text = _owner_monthly_report_csv_text(report)

    filename = f"owner_monthly_report_{year}_{month:02d}.csv"
    return StreamingResponse(
        iter([csv_text]),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
