"""Dashboard summary computations.

This module composes existing domain read-models into one lightweight,
server-computed snapshot. It intentionally does NOT duplicate business logic
that already lives elsewhere (e.g. smart building health/readiness scoring):
it calls into ``SmartBuildingService`` for the smart snapshot and issues
targeted COUNT-style queries against the legacy PMS tables (bookings,
staff_tasks, maintenance_tickets) instead of loading full collections.

Legacy PMS tables (bookings, staff_tasks, maintenance_tickets, units) have no
``tenant_id`` column, so — consistent with every other handler in this
codebase — those queries are not tenant-scoped. Smart building data IS
tenant-scoped and is read through ``SmartBuildingService``, which already
handles that scoping internally.
"""

from __future__ import annotations

import logging
from datetime import date

from sqlalchemy.orm import Session

from app.domains.dashboard.schemas import DashboardSummary, SmartSnapshot
from app.domains.smart_building.service import SmartBuildingService
from app.models.booking import Booking
from app.models.maintenance import MaintenanceTicket
from app.models.staff_task import StaffTask

logger = logging.getLogger("app.domains.dashboard")

STAFF_TASK_CLOSED_STATUSES = ("done", "cancelled")
UNITS_NEEDING_ATTENTION_STATUSES = {"NEEDS_ATTENTION", "BLOCKED"}


def _compute_smart_snapshot(db: Session, tenant_id: str | None, role: str | None) -> SmartSnapshot:
    """Reuse SmartBuildingService read models for the smart snapshot.

    Never raises: any failure (missing tenant context, empty/missing smart
    tables, etc.) degrades to a zeroed snapshot rather than a 500.
    """
    if not tenant_id:
        return SmartSnapshot()

    try:
        service = SmartBuildingService(db=db, tenant_id=tenant_id, role=role or "viewer")
        overview = service.smart_overview()

        units_needing_attention = 0
        try:
            readiness_rows = service.list_unit_readiness()
            units_needing_attention = sum(
                1
                for row in readiness_rows
                if row.get("readiness_status") in UNITS_NEEDING_ATTENTION_STATUSES
            )
        except Exception:  # pragma: no cover - defensive, readiness is best-effort
            logger.warning(
                "dashboard.summary: units_needing_attention unavailable, defaulting to 0",
                exc_info=True,
            )
            units_needing_attention = 0

        return SmartSnapshot(
            devices_total=int(overview.get("total_devices", 0) or 0),
            devices_online=int(overview.get("online_devices", 0) or 0),
            devices_offline=int(overview.get("offline_devices", 0) or 0),
            alerts_open=int(overview.get("open_alerts", 0) or 0),
            units_needing_attention=units_needing_attention,
        )
    except Exception:  # pragma: no cover - defensive, smart data is best-effort
        logger.warning("dashboard.summary: smart snapshot unavailable, defaulting to zeros", exc_info=True)
        return SmartSnapshot()


def compute_dashboard_summary(
    db: Session,
    *,
    tenant_id: str | None,
    role: str | None,
    today: date | None = None,
) -> DashboardSummary:
    reference_date = today or date.today()

    arrivals_today = (
        db.query(Booking).filter(Booking.checkin_date == reference_date).count()
    )
    departures_today = (
        db.query(Booking).filter(Booking.checkout_date == reference_date).count()
    )
    in_house = (
        db.query(Booking)
        .filter(
            Booking.checkin_date <= reference_date,
            Booking.checkout_date > reference_date,
        )
        .count()
    )

    staff_tasks_today = db.query(StaffTask).filter(StaffTask.date == reference_date).count()
    staff_tasks_open = (
        db.query(StaffTask)
        .filter(StaffTask.status.notin_(STAFF_TASK_CLOSED_STATUSES))
        .count()
    )

    maintenance_open = (
        db.query(MaintenanceTicket).filter(MaintenanceTicket.status != "done").count()
    )

    smart = _compute_smart_snapshot(db, tenant_id, role)

    return DashboardSummary(
        date=reference_date,
        arrivals_today=arrivals_today,
        departures_today=departures_today,
        in_house=in_house,
        staff_tasks_today=staff_tasks_today,
        staff_tasks_open=staff_tasks_open,
        maintenance_open=maintenance_open,
        smart=smart,
    )
