"""Analytics computations, extracted from the route handlers.

All functions keep the exact behaviour of the original implementations in
``app/main.py`` so the API contracts stay identical.
"""

from datetime import date, datetime, time, timedelta
from typing import Dict, List

from sqlalchemy.orm import Session

from app.domains.analytics.schemas import (
    AdvancedKpiSummary,
    AlertItem,
    CostByCategory,
    MonthSummary,
    OwnerMonthlyReport,
    PnLMonthSummary,
    RevenueByUnit,
)
from app.models.booking import Booking
from app.models.cost_item import CostItem
from app.models.maintenance import MaintenanceTicket
from app.models.staff_task import StaffTask
from app.models.unit import Unit


def get_month_range(year: int, month: int):
    month_start = date(year, month, 1)
    if month == 12:
        next_month_start = date(year + 1, 1, 1)
    else:
        next_month_start = date(year, month + 1, 1)
    days_in_month = (next_month_start - month_start).days
    return month_start, next_month_start, days_in_month


def _compute_month_revenue_and_occupancy(
    db: Session, month_start: date, next_month_start: date, days_in_month: int
):
    """Revenue/occupancy aggregation shared by month-summary and month-pnl."""
    bookings = (
        db.query(Booking)
        .filter(
            Booking.checkin_date < next_month_start,
            Booking.checkout_date > month_start,
        )
        .all()
    )

    units_count = db.query(Unit).count()
    nights_total = days_in_month * units_count

    occupied_nights = 0
    revenue_total = 0.0
    revenue_by_source: Dict[str, float] = {}
    revenue_by_unit_map: Dict[int, RevenueByUnit] = {}

    for b in bookings:
        stay_start = max(b.checkin_date, month_start)
        stay_end = min(b.checkout_date, next_month_start)
        nights_in_month = (stay_end - stay_start).days

        occupied_nights += nights_in_month

        if (
            b.total_price is not None
            and b.checkin_date >= month_start
            and b.checkout_date <= next_month_start
        ):
            booking_revenue = float(b.total_price)
        else:
            if b.nightly_rate is not None:
                booking_revenue = float(b.nightly_rate) * nights_in_month
            else:
                booking_revenue = 0.0

        revenue_total += booking_revenue

        src = b.source or "unknown"
        revenue_by_source[src] = revenue_by_source.get(src, 0.0) + booking_revenue

        u = b.unit
        if not u:
            continue

        existing = revenue_by_unit_map.get(u.id)
        if existing is None:
            revenue_by_unit_map[u.id] = RevenueByUnit(
                unit_id=u.id,
                unit_name=u.name,
                revenue=booking_revenue,
                nights_occupied=nights_in_month,
            )
        else:
            existing.revenue += booking_revenue
            existing.nights_occupied += nights_in_month

    occupancy_rate = (
        (occupied_nights / nights_total) * 100 if nights_total > 0 else 0.0
    )
    adr = revenue_total / occupied_nights if occupied_nights > 0 else None

    return (
        nights_total,
        occupied_nights,
        occupancy_rate,
        adr,
        revenue_total,
        revenue_by_source,
        revenue_by_unit_map,
    )


def compute_month_summary(db: Session, year: int, month: int) -> MonthSummary:
    month_start, next_month_start, days_in_month = get_month_range(year, month)
    (
        nights_total,
        occupied_nights,
        occupancy_rate,
        adr,
        revenue_total,
        revenue_by_source,
        revenue_by_unit_map,
    ) = _compute_month_revenue_and_occupancy(
        db, month_start, next_month_start, days_in_month
    )

    return MonthSummary(
        year=year,
        month=month,
        nights_total=nights_total,
        nights_occupied=occupied_nights,
        occupancy_rate=round(occupancy_rate, 2),
        revenue_total=round(revenue_total, 2),
        adr=round(adr, 2) if adr is not None else None,
        revenue_by_source={k: round(v, 2) for k, v in revenue_by_source.items()},
        revenue_by_unit=list(revenue_by_unit_map.values()),
    )


def collect_costs_for_month(
    db: Session, month_start: date, next_month_start: date
):
    costs_total = 0.0
    costs_by_category_map: Dict[str, float] = {}
    cost_lines: list[dict] = []

    # --- Costi manuali (CostItem) ---
    cost_items = (
        db.query(CostItem)
        .filter(
            CostItem.date >= month_start,
            CostItem.date < next_month_start,
        )
        .all()
    )

    for c in cost_items:
        amount = float(c.amount)
        costs_total += amount
        cat = c.category or "Altro"
        costs_by_category_map[cat] = costs_by_category_map.get(cat, 0.0) + amount

        cost_lines.append(
            {
                "date": c.date,
                "category": cat,
                "description": c.description,
                "amount": amount,
                "currency": c.currency or "EUR",
                "unit_id": c.unit_id,
                "booking_id": None,
                "staff_task_id": None,
                "origin": "manual",
            }
        )

    # --- Costi da prenotazioni (cleaning_fee, channel_fee, city_tax) ---
    bookings_for_costs = (
        db.query(Booking)
        .filter(
            Booking.checkout_date >= month_start,
            Booking.checkout_date < next_month_start,
        )
        .all()
    )

    for b in bookings_for_costs:
        desc = (
            f"Prenotazione #{b.id} - {b.guest_name}"
            if b.guest_name
            else f"Prenotazione #{b.id}"
        )
        curr = b.currency or "EUR"

        # cleaning fee
        if b.cleaning_fee is not None:
            cf = float(b.cleaning_fee)
            costs_total += cf
            cat = "Booking - Cleaning fee"
            costs_by_category_map[cat] = costs_by_category_map.get(cat, 0.0) + cf

            cost_lines.append(
                {
                    "date": b.checkout_date,
                    "category": cat,
                    "description": desc,
                    "amount": cf,
                    "currency": curr,
                    "unit_id": b.unit_id,
                    "booking_id": b.id,
                    "staff_task_id": None,
                    "origin": "booking_cleaning_fee",
                }
            )

        # commissioni canale
        if b.channel_fee is not None:
            ch = float(b.channel_fee)
            costs_total += ch
            cat = "Booking - Channel fee"
            costs_by_category_map[cat] = costs_by_category_map.get(cat, 0.0) + ch

            cost_lines.append(
                {
                    "date": b.checkout_date,
                    "category": cat,
                    "description": desc,
                    "amount": ch,
                    "currency": curr,
                    "unit_id": b.unit_id,
                    "booking_id": b.id,
                    "staff_task_id": None,
                    "origin": "booking_channel_fee",
                }
            )

        # tassa di soggiorno → trattata come costo/pass-through
        if b.city_tax is not None:
            ct = float(b.city_tax)
            costs_total += ct
            cat = "Booking - City tax"
            costs_by_category_map[cat] = costs_by_category_map.get(cat, 0.0) + ct

            cost_lines.append(
                {
                    "date": b.checkout_date,
                    "category": cat,
                    "description": desc,
                    "amount": ct,
                    "currency": curr,
                    "unit_id": b.unit_id,
                    "booking_id": b.id,
                    "staff_task_id": None,
                    "origin": "booking_city_tax",
                }
            )

    # --- Costi staff (StaffTask.cost) ---
    staff_tasks = (
        db.query(StaffTask)
        .filter(
            StaffTask.date >= month_start,
            StaffTask.date < next_month_start,
        )
        .all()
    )

    for t in staff_tasks:
        if t.cost is None:
            continue
        amount = float(t.cost)
        costs_total += amount
        cat = f"Staff - {t.task_type or 'Altro'}"
        costs_by_category_map[cat] = costs_by_category_map.get(cat, 0.0) + amount

        desc = t.notes or f"Task staff #{t.id}"
        cost_lines.append(
            {
                "date": t.date,
                "category": cat,
                "description": desc,
                "amount": amount,
                "currency": t.currency or "EUR",
                "unit_id": t.unit_id,
                "booking_id": t.booking_id,
                "staff_task_id": t.id,
                "origin": "staff_task",
            }
        )

    # --- Costi manutenzione ---
    # Convertiamo le date in datetime per confrontare con created_at (che è timestamp)
    ms_dt = datetime.combine(month_start, time.min)
    nms_dt = datetime.combine(next_month_start, time.min)

    tickets = db.query(MaintenanceTicket).filter(
        MaintenanceTicket.created_at >= ms_dt,
        MaintenanceTicket.created_at < nms_dt,
        MaintenanceTicket.cost.isnot(None)
    ).all()

    for t in tickets:
        amount = float(t.cost)
        if amount > 0:
            costs_total += amount
            cat = "Manutenzione & Acquisti"
            costs_by_category_map[cat] = costs_by_category_map.get(cat, 0.0) + amount
            # Usiamo created_at come data di competenza
            cost_lines.append({
                "date": t.created_at.date(),
                "category": cat,
                "description": f"{t.ticket_type.capitalize()}: {t.title}",
                "amount": amount,
                "currency": t.currency,
                "unit_id": t.unit_id,
                "booking_id": None,
                "staff_task_id": None,
                "origin": "maintenance_ticket"
            })

    return costs_total, costs_by_category_map, cost_lines


def compute_month_pnl(db: Session, year: int, month: int) -> PnLMonthSummary:
    month_start, next_month_start, days_in_month = get_month_range(year, month)
    (
        nights_total,
        occupied_nights,
        occupancy_rate,
        adr,
        revenue_total,
        revenue_by_source,
        revenue_by_unit_map,
    ) = _compute_month_revenue_and_occupancy(
        db, month_start, next_month_start, days_in_month
    )

    costs_total, costs_by_category_map, _ = collect_costs_for_month(
        db, month_start, next_month_start
    )

    costs_by_category = [
        CostByCategory(category=cat, total=round(total, 2))
        for cat, total in costs_by_category_map.items()
    ]
    costs_by_category.sort(key=lambda x: x.category)

    profit = revenue_total - costs_total

    return PnLMonthSummary(
        year=year,
        month=month,
        nights_total=nights_total,
        nights_occupied=occupied_nights,
        occupancy_rate=round(occupancy_rate, 2),
        adr=round(adr, 2) if adr is not None else None,
        revenue_total=round(revenue_total, 2),
        revenue_by_source={k: round(v, 2) for k, v in revenue_by_source.items()},
        revenue_by_unit=list(revenue_by_unit_map.values()),
        costs_total=round(costs_total, 2),
        costs_by_category=costs_by_category,
        profit=round(profit, 2),
    )


def compute_advanced_kpis(db: Session, year: int, month: int) -> AdvancedKpiSummary:
    month_start, next_month_start, days_in_month = get_month_range(year, month)

    bookings = (
        db.query(Booking)
        .filter(
            Booking.checkin_date < next_month_start,
            Booking.checkout_date > month_start,
        )
        .all()
    )
    units_count = db.query(Unit).count()
    nights_total = max(days_in_month * units_count, 1)

    occupied_nights = 0
    revenue_total = 0.0
    direct_revenue = 0.0
    paid_count = 0
    lengths_of_stay: list[int] = []

    for booking in bookings:
        stay_start = max(booking.checkin_date, month_start)
        stay_end = min(booking.checkout_date, next_month_start)
        nights_in_month = max((stay_end - stay_start).days, 0)
        occupied_nights += nights_in_month

        if booking.total_price is not None:
            booking_revenue = float(booking.total_price)
        elif booking.nightly_rate is not None:
            booking_revenue = float(booking.nightly_rate) * nights_in_month
        else:
            booking_revenue = 0.0

        revenue_total += booking_revenue
        if (booking.source or "").lower() == "direct":
            direct_revenue += booking_revenue
        if booking.is_paid:
            paid_count += 1

        if booking.checkin_date and booking.checkout_date:
            los = max((booking.checkout_date - booking.checkin_date).days, 0)
            if los > 0:
                lengths_of_stay.append(los)

    revpar = revenue_total / nights_total
    avg_los = sum(lengths_of_stay) / len(lengths_of_stay) if lengths_of_stay else None
    direct_share = (direct_revenue / revenue_total * 100) if revenue_total > 0 else 0.0
    paid_percent = (paid_count / len(bookings) * 100) if bookings else 0.0

    today = date.today()
    next_30 = today + timedelta(days=30)
    next_7 = today + timedelta(days=7)

    upcoming_bookings = (
        db.query(Booking)
        .filter(Booking.checkin_date >= today, Booking.checkin_date <= next_30)
        .all()
    )
    pipeline_revenue = sum(float(b.total_price or 0) for b in upcoming_bookings)
    upcoming_arrivals_7 = sum(1 for b in upcoming_bookings if b.checkin_date <= next_7)

    return AdvancedKpiSummary(
        year=year,
        month=month,
        revpar=round(revpar, 2),
        avg_length_of_stay=round(avg_los, 2) if avg_los is not None else None,
        direct_share_percent=round(direct_share, 2),
        paid_booking_percent=round(paid_percent, 2),
        pipeline_revenue_next_30_days=round(pipeline_revenue, 2),
        upcoming_arrivals_next_7_days=upcoming_arrivals_7,
    )


def compute_owner_monthly_report(db: Session, year: int, month: int) -> OwnerMonthlyReport:
    """Consolidated owner report: composes existing computations, no new logic.

    Reuses ``compute_month_pnl`` (occupancy, revenue, costs, profit) and
    ``compute_advanced_kpis`` (RevPAR) — both already exercised by the
    existing ``/analytics/month-pnl`` and ``/analytics/advanced-kpis``
    endpoints — instead of recomputing anything.
    """
    pnl = compute_month_pnl(db, year, month)
    kpis = compute_advanced_kpis(db, year, month)

    return OwnerMonthlyReport(
        year=year,
        month=month,
        nights_total=pnl.nights_total,
        nights_occupied=pnl.nights_occupied,
        occupancy_rate=pnl.occupancy_rate,
        adr=pnl.adr,
        revpar=kpis.revpar,
        revenue_total=pnl.revenue_total,
        revenue_by_source=pnl.revenue_by_source,
        revenue_by_unit=pnl.revenue_by_unit,
        costs_total=pnl.costs_total,
        costs_by_category=pnl.costs_by_category,
        profit=pnl.profit,
    )


def compute_alerts_today(db: Session) -> List[AlertItem]:
    today = date.today()
    alerts: list[AlertItem] = []

    unpaid_checkouts = (
        db.query(Booking)
        .filter(Booking.checkout_date < today, Booking.is_paid.is_(False))
        .count()
    )
    if unpaid_checkouts > 0:
        alerts.append(
            AlertItem(
                severity="high",
                code="unpaid_checkout",
                title="Prenotazioni non saldate dopo il check-out",
                count=unpaid_checkouts,
                details="Verificare pagamenti e riconciliazione contabile.",
            )
        )

    overdue_tasks = (
        db.query(StaffTask)
        .filter(
            StaffTask.date < today,
            StaffTask.status.notin_(["done", "cancelled"]),
        )
        .count()
    )
    if overdue_tasks > 0:
        alerts.append(
            AlertItem(
                severity="medium",
                code="overdue_staff_tasks",
                title="Task staff scaduti non completati",
                count=overdue_tasks,
                details="Prioritizzare i task in ritardo nel planner staff.",
            )
        )

    open_tickets = (
        db.query(MaintenanceTicket)
        .filter(MaintenanceTicket.status.in_(["todo", "in_progress"]))
        .count()
    )
    if open_tickets > 0:
        alerts.append(
            AlertItem(
                severity="medium",
                code="open_maintenance",
                title="Ticket manutenzione aperti",
                count=open_tickets,
                details="Verificare ticket urgenti e stato avanzamento.",
            )
        )

    return alerts
