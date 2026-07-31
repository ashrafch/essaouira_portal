"""Guest readiness scoring per unit.

Split out of the former single-file ``service.py``; the method bodies are
unchanged. Every module is a mixin combined by ``SmartBuildingService``,
so cross-module ``self`` calls keep working exactly as before.
"""

from __future__ import annotations

from datetime import date, datetime, timedelta, timezone

from fastapi import HTTPException

from app.core.config import settings
from app.domains.smart_building.services.constants import (
    READINESS_STATUSES,
    BLOCKING_MAINTENANCE_PRIORITIES,
    BLOCKING_MAINTENANCE_KEYWORDS,
)
from app.models.maintenance import MaintenanceTicket
from app.models.property import Property
from app.models.staff_task import StaffTask
from app.models.unit import Unit
from app.models.smart_building import (
    Alert,
    AutomationExecution,
)


class ReadinessMixin:
    """Guest readiness scoring per unit."""

    def _is_blocking_maintenance(self, ticket: MaintenanceTicket) -> bool:
        priority = (ticket.priority or "medium").strip().lower()
        if priority in BLOCKING_MAINTENANCE_PRIORITIES:
            return True
        haystack = f"{ticket.title or ''} {ticket.description or ''}".lower()
        return any(keyword in haystack for keyword in BLOCKING_MAINTENANCE_KEYWORDS)

    def _normalize_readiness_status(self, status: str | None) -> str | None:
        if not status:
            return None
        normalized = status.strip().upper()
        if normalized not in READINESS_STATUSES:
            raise HTTPException(status_code=400, detail="status readiness non valido")
        return normalized

    def _readiness_overview(self, rows: list[dict[str, object]]) -> dict[str, int]:
        counts = {"total_units": len(rows), "ready": 0, "needs_attention": 0, "blocked": 0, "unknown": 0}
        for row in rows:
            status = str(row.get("readiness_status") or "UNKNOWN")
            if status == "READY":
                counts["ready"] += 1
            elif status == "NEEDS_ATTENTION":
                counts["needs_attention"] += 1
            elif status == "BLOCKED":
                counts["blocked"] += 1
            else:
                counts["unknown"] += 1
        return counts

    def list_unit_readiness(
        self,
        *,
        property_id: int | None = None,
        unit_id: int | None = None,
        status: str | None = None,
        min_score: int | None = None,
        max_score: int | None = None,
    ) -> list[dict[str, object]]:
        scope_unit_ids = self._scope_unit_ids_for_operations(property_id=property_id, unit_id=unit_id)
        normalized_status = self._normalize_readiness_status(status)
        if min_score is not None and max_score is not None and min_score > max_score:
            raise HTTPException(status_code=400, detail="Intervallo score non valido")

        units_query = self.db.query(Unit)
        if scope_unit_ids is not None:
            if not scope_unit_ids:
                return []
            units_query = units_query.filter(Unit.id.in_(list(scope_unit_ids)))
        units = units_query.order_by(Unit.name.asc(), Unit.id.asc()).all()
        if not units:
            return []

        unit_ids = [unit.id for unit in units]
        properties_by_id: dict[int, Property] = {}
        property_ids = {unit.property_id for unit in units if unit.property_id is not None}
        if property_ids:
            props = self._scoped_query(Property).filter(Property.id.in_(property_ids)).all()
            properties_by_id = {prop.id: prop for prop in props}

        health = self.get_device_health_overview(property_id=property_id, unit_id=unit_id)
        devices = health["devices"]
        devices_by_unit: dict[int, list[dict[str, object]]] = {}
        for device in devices:
            mapped_unit_id = device.get("unit_id")
            if mapped_unit_id is None:
                continue
            devices_by_unit.setdefault(int(mapped_unit_id), []).append(device)

        alerts_query = self._scoped_query(Alert).filter(Alert.status == "open")
        if unit_ids:
            alerts_query = alerts_query.filter(Alert.unit_id.in_(unit_ids))
        open_alerts = alerts_query.all()
        alerts_by_unit: dict[int, list[Alert]] = {}
        for alert in open_alerts:
            if alert.unit_id is None:
                continue
            alerts_by_unit.setdefault(int(alert.unit_id), []).append(alert)

        telemetry_open_insights = self.list_telemetry_insights(
            property_id=property_id,
            unit_id=unit_id,
            status="open",
        )
        telemetry_by_unit: dict[int, list[dict[str, object]]] = {}
        for insight in telemetry_open_insights:
            mapped_unit_id = insight.get("unit_id")
            if mapped_unit_id is None:
                continue
            telemetry_by_unit.setdefault(int(mapped_unit_id), []).append(insight)

        maintenance_query = self.db.query(MaintenanceTicket).filter(MaintenanceTicket.status != "done")
        if unit_ids:
            maintenance_query = maintenance_query.filter(MaintenanceTicket.unit_id.in_(unit_ids))
        maintenance_open = maintenance_query.all()
        maintenance_by_unit: dict[int, list[MaintenanceTicket]] = {}
        for ticket in maintenance_open:
            if ticket.unit_id is None:
                continue
            maintenance_by_unit.setdefault(int(ticket.unit_id), []).append(ticket)

        task_query = self.db.query(StaffTask).filter(StaffTask.status.in_(["planned", "in_progress"]))
        if unit_ids:
            task_query = task_query.filter(StaffTask.unit_id.in_(unit_ids))
        open_tasks = task_query.all()
        tasks_by_unit: dict[int, list[StaffTask]] = {}
        for task in open_tasks:
            if task.unit_id is None:
                continue
            tasks_by_unit.setdefault(int(task.unit_id), []).append(task)

        execution_threshold = datetime.now(timezone.utc) - timedelta(hours=72)
        executions = (
            self._scoped_query(AutomationExecution)
            .filter(AutomationExecution.started_at >= execution_threshold)
            .order_by(AutomationExecution.started_at.desc(), AutomationExecution.id.desc())
            .limit(300)
            .all()
        )
        failures_by_unit: dict[int, list[AutomationExecution]] = {}
        for execution in executions:
            if execution.status not in {"failed", "partial"}:
                continue
            scope = self._extract_execution_scope(execution)
            mapped_unit_id = scope.get("unit_id")
            if mapped_unit_id is None:
                continue
            mapped_unit_id = int(mapped_unit_id)
            if mapped_unit_id not in unit_ids:
                continue
            failures_by_unit.setdefault(mapped_unit_id, []).append(execution)

        essential_categories = set(settings.readiness_essential_device_categories)
        now = datetime.now(timezone.utc)
        today = date.today()
        rows: list[dict[str, object]] = []
        for unit in units:
            unit_devices = devices_by_unit.get(unit.id, [])
            unit_alerts = alerts_by_unit.get(unit.id, [])
            unit_insights = telemetry_by_unit.get(unit.id, [])
            unit_maintenance = maintenance_by_unit.get(unit.id, [])
            unit_tasks = tasks_by_unit.get(unit.id, [])
            unit_failures = failures_by_unit.get(unit.id, [])

            score = 100
            blocking_reasons: list[str] = []
            warning_reasons: list[str] = []

            leak_alerts = [a for a in unit_alerts if "leak" in (a.alert_type or "")]
            critical_alerts = [a for a in unit_alerts if (a.severity or "warning") == "critical"]
            warning_alerts = [a for a in unit_alerts if (a.severity or "warning") == "warning"]
            if leak_alerts:
                score -= 40 * len(leak_alerts)
                blocking_reasons.append(f"{len(leak_alerts)} alert leak aperti")
            if critical_alerts:
                score -= 25 * len(critical_alerts)
                blocking_reasons.append(f"{len(critical_alerts)} alert critici aperti")
            if warning_alerts:
                score -= 5 * len(warning_alerts)
                warning_reasons.append(f"{len(warning_alerts)} alert warning aperti")

            critical_devices = [d for d in unit_devices if d.get("health_status") == "critical"]
            offline_devices = [d for d in unit_devices if d.get("connectivity_status") == "offline"]
            if critical_devices:
                score -= 25 * len(critical_devices)
                blocking_reasons.append(f"{len(critical_devices)} dispositivi critical")
            elif offline_devices:
                score -= 10 * len(offline_devices)
                warning_reasons.append(f"{len(offline_devices)} dispositivi offline")

            essential_devices = [d for d in unit_devices if str(d.get("category") or "").lower() in essential_categories]
            essential_offline = [d for d in essential_devices if d.get("connectivity_status") != "online"]
            if essential_offline:
                score -= 25 * len(essential_offline)
                blocking_reasons.append(f"{len(essential_offline)} dispositivi essenziali non online")

            critical_insights = [i for i in unit_insights if i.get("severity") == "critical"]
            warning_insights = [i for i in unit_insights if i.get("severity") in {"warning", "info"}]
            if critical_insights:
                score -= 15 * len(critical_insights)
                warning_reasons.append(f"{len(critical_insights)} anomalie telemetry critiche")
            if warning_insights:
                score -= 10 * len(warning_insights)
                warning_reasons.append(f"{len(warning_insights)} anomalie telemetry")

            blocking_maintenance = [t for t in unit_maintenance if self._is_blocking_maintenance(t)]
            non_blocking_maintenance = [t for t in unit_maintenance if t not in blocking_maintenance]
            if blocking_maintenance:
                score -= 35 * len(blocking_maintenance)
                blocking_reasons.append(f"{len(blocking_maintenance)} ticket manutenzione bloccanti")
            if non_blocking_maintenance:
                score -= 8 * len(non_blocking_maintenance)
                warning_reasons.append(f"{len(non_blocking_maintenance)} ticket manutenzione aperti")

            failed_automations = [e for e in unit_failures if e.status == "failed"]
            partial_automations = [e for e in unit_failures if e.status == "partial"]
            if failed_automations:
                score -= 10 * len(failed_automations)
                warning_reasons.append(f"{len(failed_automations)} automazioni fallite")
            if partial_automations:
                score -= 5 * len(partial_automations)
                warning_reasons.append(f"{len(partial_automations)} automazioni parziali")

            overdue_tasks = [t for t in unit_tasks if t.date < today]
            if overdue_tasks:
                score -= 5 * len(overdue_tasks)
                warning_reasons.append(f"{len(overdue_tasks)} task staff in ritardo")

            score = max(0, min(int(score), 100))
            tenant_scoped_signal = bool(
                unit_devices
                or unit_alerts
                or unit_insights
                or unit_failures
            )
            has_any_signal = bool(
                tenant_scoped_signal
                or unit_maintenance
                or unit_tasks
            )
            if self.tenant_id != "default" and not tenant_scoped_signal:
                continue
            if not has_any_signal:
                readiness_status = "UNKNOWN"
                score = 0
            elif blocking_reasons:
                readiness_status = "BLOCKED"
                score = min(score, 40)
            elif warning_reasons:
                readiness_status = "NEEDS_ATTENTION"
                score = min(score, 85)
            else:
                readiness_status = "READY"

            property_obj = properties_by_id.get(unit.property_id) if unit.property_id is not None else None
            row = {
                "unit_id": unit.id,
                "unit_name": unit.name,
                "property_id": unit.property_id,
                "property_name": property_obj.name if property_obj else None,
                "tenant_id": self.tenant_id,
                "readiness_status": readiness_status,
                "readiness_score": score,
                "blocking_reasons": blocking_reasons,
                "warning_reasons": warning_reasons,
                "last_evaluated_at": now,
            }
            if normalized_status and row["readiness_status"] != normalized_status:
                continue
            if min_score is not None and row["readiness_score"] < min_score:
                continue
            if max_score is not None and row["readiness_score"] > max_score:
                continue
            rows.append(row)
        rows.sort(
            key=lambda item: (
                item["readiness_status"] == "READY",
                item["readiness_status"] == "UNKNOWN",
                item["readiness_score"],
            )
        )
        return rows

    def get_unit_readiness(self, unit_id: int) -> dict[str, object]:
        self._ensure_unit_visible(unit_id)
        rows = self.list_unit_readiness(unit_id=unit_id)
        if not rows:
            raise HTTPException(status_code=404, detail="Readiness unita non disponibile")
        return rows[0]
