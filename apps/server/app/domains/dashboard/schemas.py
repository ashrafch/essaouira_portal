from datetime import date

from pydantic import BaseModel


class SmartSnapshot(BaseModel):
    """Lightweight smart-building snapshot reused from SmartBuildingService.

    If a datum cannot be computed cheaply for the current tenant (e.g. smart
    building context is unavailable), it is returned as 0 rather than
    raising, so the dashboard summary never fails because of smart data.
    """

    devices_total: int = 0
    devices_online: int = 0
    devices_offline: int = 0
    alerts_open: int = 0
    units_needing_attention: int = 0


class DashboardSummary(BaseModel):
    """One lightweight, server-computed snapshot of today's operations.

    Meant to replace client-side fetching of full bookings/staff-tasks/
    maintenance-tickets collections just to derive counts for sidebar
    badges or the home mission-control view.
    """

    date: date
    arrivals_today: int
    departures_today: int
    in_house: int
    staff_tasks_today: int
    staff_tasks_open: int
    maintenance_open: int
    smart: SmartSnapshot
