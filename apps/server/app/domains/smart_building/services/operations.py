"""Action-first operational read model (Smart Operations).

Split out of the former single-file ``service.py``; the method bodies are
unchanged. Every module is a mixin combined by ``SmartBuildingService``,
so cross-module ``self`` calls keep working exactly as before.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from app.domains.smart_building.services.constants import SMART_MAINTENANCE_KEYWORDS
from app.models.maintenance import MaintenanceTicket
from app.models.property import Property
from app.models.staff_task import StaffTask
from app.models.unit import Unit
from app.models.smart_building import (
    Alert,
    AutomationExecution,
)


class OperationsMixin:
    """Action-first operational read model (Smart Operations)."""

    def _is_smart_related_maintenance(self, ticket: MaintenanceTicket) -> bool:
        haystack = f"{ticket.title or ''} {ticket.description or ''}".lower()
        return any(keyword in haystack for keyword in SMART_MAINTENANCE_KEYWORDS)

    def _issue_sort_key(self, issue: dict[str, object]) -> datetime:
        candidate = issue.get("last_seen_at") or issue.get("occurred_at")
        if isinstance(candidate, datetime):
            return self._as_utc_datetime(candidate) or datetime.min.replace(tzinfo=timezone.utc)
        return datetime.min.replace(tzinfo=timezone.utc)

    def _severity_allowed(self, severity_filter: str | None, severity_value: str) -> bool:
        normalized = (severity_filter or "").strip().lower()
        if not normalized:
            return True
        return severity_value == normalized

    def _status_allowed(self, status_filter: str | None, status_value: str) -> bool:
        normalized = (status_filter or "").strip().lower()
        if not normalized:
            return True
        return status_value == normalized

    def _issue_type_allowed(self, issue_type_filter: str | None, issue_type_value: str) -> bool:
        normalized = (issue_type_filter or "").strip().lower()
        if not normalized:
            return True
        return issue_type_value == normalized

    def _build_smart_operations_payload(
        self,
        *,
        property_id: int | None = None,
        unit_id: int | None = None,
        severity: str | None = None,
        issue_type: str | None = None,
        status: str | None = None,
    ) -> dict[str, object]:
        scope_unit_ids = self._scope_unit_ids_for_operations(property_id=property_id, unit_id=unit_id)
        health = self.get_device_health_overview(property_id=property_id, unit_id=unit_id)
        devices = health["devices"]
        health_units = [u for u in health["units"] if u.get("unit_id") is not None]
        health_by_unit = {
            int(item["unit_id"]): item for item in health_units if item.get("unit_id") is not None
        }

        units_query = self.db.query(Unit)
        if scope_unit_ids:
            units_query = units_query.filter(Unit.id.in_(list(scope_unit_ids)))
        units_rows = units_query.all()
        units_by_id = {unit.id: unit for unit in units_rows}
        readiness_rows = self.list_unit_readiness(
            property_id=property_id,
            unit_id=unit_id,
        )
        readiness_by_unit = {int(row["unit_id"]): row for row in readiness_rows}
        property_ids = {unit.property_id for unit in units_rows if unit.property_id is not None}
        properties_by_id: dict[int, Property] = {}
        if property_ids:
            props = self._scoped_query(Property).filter(Property.id.in_(property_ids)).all()
            properties_by_id = {prop.id: prop for prop in props}

        alerts_query = self._scoped_query(Alert)
        if scope_unit_ids:
            alerts_query = alerts_query.filter(Alert.unit_id.in_(list(scope_unit_ids)))
        open_alerts = (
            alerts_query.filter(Alert.status == "open")
            .order_by(Alert.last_seen_at.desc(), Alert.id.desc())
            .all()
        )
        all_alerts_recent = (
            alerts_query.order_by(Alert.last_seen_at.desc(), Alert.id.desc()).limit(120).all()
        )
        alerts_by_unit: dict[int, list[Alert]] = {}
        for alert in open_alerts:
            if alert.unit_id is None:
                continue
            alerts_by_unit.setdefault(int(alert.unit_id), []).append(alert)

        execution_threshold = datetime.now(timezone.utc) - timedelta(hours=72)
        executions = (
            self._scoped_query(AutomationExecution)
            .filter(AutomationExecution.started_at >= execution_threshold)
            .order_by(AutomationExecution.started_at.desc(), AutomationExecution.id.desc())
            .limit(240)
            .all()
        )
        executions = [
            execution for execution in executions
            if self._execution_matches_scope(execution, unit_id=unit_id, unit_ids=scope_unit_ids)
        ]
        executions_by_unit: dict[int, list[AutomationExecution]] = {}
        for execution in executions:
            scope = self._extract_execution_scope(execution)
            if scope.get("unit_id") is None:
                continue
            executions_by_unit.setdefault(int(scope["unit_id"]), []).append(execution)

        maintenance_query = self.db.query(MaintenanceTicket)
        if scope_unit_ids:
            maintenance_query = maintenance_query.filter(MaintenanceTicket.unit_id.in_(list(scope_unit_ids)))
        maintenance_recent = (
            maintenance_query
            .filter(MaintenanceTicket.status != "done")
            .order_by(MaintenanceTicket.updated_at.desc(), MaintenanceTicket.id.desc())
            .limit(200)
            .all()
        )
        smart_maintenance = [ticket for ticket in maintenance_recent if self._is_smart_related_maintenance(ticket)]
        maintenance_by_unit: dict[int, list[MaintenanceTicket]] = {}
        for ticket in smart_maintenance:
            if ticket.unit_id is None:
                continue
            maintenance_by_unit.setdefault(int(ticket.unit_id), []).append(ticket)

        telemetry_open_insights = self.list_telemetry_insights(
            property_id=property_id,
            unit_id=unit_id,
            status="open",
        )
        telemetry_by_unit: dict[int, list[dict[str, object]]] = {}
        for insight in telemetry_open_insights:
            insight_unit_id = insight.get("unit_id")
            if insight_unit_id is None:
                continue
            telemetry_by_unit.setdefault(int(insight_unit_id), []).append(insight)

        if self.tenant_id != "default" and scope_unit_ids is None:
            tenant_visible_unit_ids = (
                set(health_by_unit.keys())
                | set(alerts_by_unit.keys())
                | set(executions_by_unit.keys())
                | set(telemetry_by_unit.keys())
            )
            maintenance_by_unit = {
                key: value
                for key, value in maintenance_by_unit.items()
                if key in tenant_visible_unit_ids
            }

        task_query = self.db.query(StaffTask)
        if scope_unit_ids:
            task_query = task_query.filter(StaffTask.unit_id.in_(list(scope_unit_ids)))
        task_rows = (
            task_query
            .filter(StaffTask.status.in_(["planned", "in_progress"]))
            .order_by(StaffTask.date.asc(), StaffTask.id.desc())
            .limit(200)
            .all()
        )
        tasks_by_unit: dict[int, list[StaffTask]] = {}
        for task in task_rows:
            if task.unit_id is None:
                continue
            tasks_by_unit.setdefault(int(task.unit_id), []).append(task)

        if self.tenant_id != "default" and scope_unit_ids is None:
            tenant_visible_unit_ids = (
                set(health_by_unit.keys())
                | set(alerts_by_unit.keys())
                | set(executions_by_unit.keys())
                | set(telemetry_by_unit.keys())
            )
            tasks_by_unit = {
                key: value
                for key, value in tasks_by_unit.items()
                if key in tenant_visible_unit_ids
            }

        union_unit_ids = (
            set(health_by_unit.keys())
            | set(alerts_by_unit.keys())
            | set(executions_by_unit.keys())
            | set(maintenance_by_unit.keys())
            | set(telemetry_by_unit.keys())
            | set(readiness_by_unit.keys())
        )
        if scope_unit_ids:
            union_unit_ids &= scope_unit_ids

        units_attention: list[dict[str, object]] = []
        issues: list[dict[str, object]] = []
        activity: list[dict[str, object]] = []

        for unit_id_value in sorted(union_unit_ids):
            health_item = health_by_unit.get(unit_id_value, {})
            unit_alerts = alerts_by_unit.get(unit_id_value, [])
            unit_executions = executions_by_unit.get(unit_id_value, [])
            unit_maintenance = maintenance_by_unit.get(unit_id_value, [])
            unit_tasks = tasks_by_unit.get(unit_id_value, [])
            unit_obj = units_by_id.get(unit_id_value)
            property_obj = properties_by_id.get(unit_obj.property_id) if unit_obj and unit_obj.property_id else None

            open_alerts_count = len(unit_alerts)
            critical_alerts = sum(1 for alert in unit_alerts if (alert.severity or "warning") == "critical")
            leak_alerts = sum(1 for alert in unit_alerts if "leak" in (alert.alert_type or ""))
            offline_devices = int(health_item.get("offline_devices") or 0)
            warning_devices = int(health_item.get("warning_devices") or 0)
            critical_devices = int(health_item.get("critical_devices") or 0)
            failed_exec = sum(1 for execution in unit_executions if execution.status == "failed")
            partial_exec = sum(1 for execution in unit_executions if execution.status == "partial")
            smart_maintenance_open = len(unit_maintenance)
            telemetry_critical = sum(1 for insight in telemetry_by_unit.get(unit_id_value, []) if insight.get("severity") == "critical")
            telemetry_warning = sum(1 for insight in telemetry_by_unit.get(unit_id_value, []) if insight.get("severity") == "warning")

            score = (
                (critical_alerts * 60)
                + (open_alerts_count * 20)
                + (leak_alerts * 40)
                + (offline_devices * 25)
                + (critical_devices * 20)
                + (warning_devices * 10)
                + (failed_exec * 20)
                + (partial_exec * 10)
                + (smart_maintenance_open * 15)
                + (telemetry_critical * 25)
                + (telemetry_warning * 10)
            )
            readiness = readiness_by_unit.get(unit_id_value)
            readiness_status = readiness["readiness_status"] if readiness else "UNKNOWN"
            readiness_score = int(readiness["readiness_score"]) if readiness else 0
            readiness_blocking_reasons = list(readiness["blocking_reasons"]) if readiness else []
            readiness_warning_reasons = list(readiness["warning_reasons"]) if readiness else []
            if readiness_status == "BLOCKED":
                score += 80
            elif readiness_status == "NEEDS_ATTENTION":
                score += 30
            reasons: list[str] = []
            if critical_alerts:
                reasons.append(f"{critical_alerts} alert critici aperti")
            if leak_alerts:
                reasons.append(f"{leak_alerts} alert leak")
            if offline_devices:
                reasons.append(f"{offline_devices} dispositivi offline")
            if critical_devices:
                reasons.append(f"{critical_devices} dispositivi in stato critical")
            if warning_devices:
                reasons.append(f"{warning_devices} dispositivi in warning")
            if failed_exec:
                reasons.append(f"{failed_exec} automazioni fallite")
            if partial_exec:
                reasons.append(f"{partial_exec} automazioni parziali")
            if smart_maintenance_open:
                reasons.append(f"{smart_maintenance_open} ticket smart aperti")
            if telemetry_critical:
                reasons.append(f"{telemetry_critical} insight telemetry critici")
            if telemetry_warning:
                reasons.append(f"{telemetry_warning} insight telemetry warning")
            if readiness_blocking_reasons:
                reasons.extend(readiness_blocking_reasons[:2])
            if readiness_warning_reasons:
                reasons.extend(readiness_warning_reasons[:2])

            if critical_alerts > 0 or leak_alerts > 0 or offline_devices > 0 or failed_exec > 0 or telemetry_critical > 0:
                unit_severity = "critical"
            elif score > 0:
                unit_severity = "warning"
            else:
                unit_severity = "info"

            related_times: list[datetime] = []
            related_times.extend([self._as_utc_datetime(alert.last_seen_at) for alert in unit_alerts if alert.last_seen_at])
            related_times.extend([self._as_utc_datetime(execution.started_at) for execution in unit_executions if execution.started_at])
            related_times.extend([self._as_utc_datetime(ticket.updated_at or ticket.created_at) for ticket in unit_maintenance if (ticket.updated_at or ticket.created_at)])
            recent_issue_at = max(related_times) if related_times else None

            if score > 0:
                units_attention.append(
                    {
                        "unit_id": unit_id_value,
                        "unit_name": unit_obj.name if unit_obj else f"Unit {unit_id_value}",
                        "property_id": property_obj.id if property_obj else None,
                        "property_name": property_obj.name if property_obj else None,
                        "attention_score": score,
                        "severity": unit_severity,
                        "status": "needs_attention",
                        "reasons": reasons,
                        "open_alerts": open_alerts_count,
                        "critical_alerts": critical_alerts,
                        "offline_devices": offline_devices,
                        "warning_devices": warning_devices,
                        "critical_devices": critical_devices,
                        "automation_failures": failed_exec,
                        "automation_partial": partial_exec,
                        "smart_maintenance_open": smart_maintenance_open,
                        "readiness_status": readiness_status,
                        "readiness_score": readiness_score,
                        "readiness_blocking_reasons": readiness_blocking_reasons,
                        "readiness_warning_reasons": readiness_warning_reasons,
                        "recent_issue_at": recent_issue_at,
                    }
                )
            elif readiness_status in {"BLOCKED", "NEEDS_ATTENTION"}:
                units_attention.append(
                    {
                        "unit_id": unit_id_value,
                        "unit_name": unit_obj.name if unit_obj else f"Unit {unit_id_value}",
                        "property_id": property_obj.id if property_obj else None,
                        "property_name": property_obj.name if property_obj else None,
                        "attention_score": max(100 - readiness_score, 1),
                        "severity": "critical" if readiness_status == "BLOCKED" else "warning",
                        "status": "needs_attention",
                        "reasons": (readiness_blocking_reasons + readiness_warning_reasons)[:6],
                        "open_alerts": open_alerts_count,
                        "critical_alerts": critical_alerts,
                        "offline_devices": offline_devices,
                        "warning_devices": warning_devices,
                        "critical_devices": critical_devices,
                        "automation_failures": failed_exec,
                        "automation_partial": partial_exec,
                        "smart_maintenance_open": smart_maintenance_open,
                        "readiness_status": readiness_status,
                        "readiness_score": readiness_score,
                        "readiness_blocking_reasons": readiness_blocking_reasons,
                        "readiness_warning_reasons": readiness_warning_reasons,
                        "recent_issue_at": recent_issue_at or datetime.now(timezone.utc),
                    }
                )

            if unit_severity != "info":
                activity.append(
                    {
                        "id": f"unit-attention-{unit_id_value}",
                        "title": f"Unita da attenzionare: {(unit_obj.name if unit_obj else f'Unit {unit_id_value}')}",
                        "subtitle": ", ".join(reasons[:2]) if reasons else "Issue operativo smart",
                        "severity": unit_severity,
                        "occurred_at": recent_issue_at,
                        "refs": {"unit_id": unit_id_value, "property_id": property_obj.id if property_obj else None},
                    }
                )

            if readiness_status in {"BLOCKED", "NEEDS_ATTENTION"}:
                issues.append(
                    {
                        "issue_id": f"readiness-{unit_id_value}",
                        "issue_type": "readiness.blocked" if readiness_status == "BLOCKED" else "readiness.needs_attention",
                        "severity": "critical" if readiness_status == "BLOCKED" else "warning",
                        "status": "open",
                        "title": f"Guest readiness: {readiness_status}",
                        "description": ", ".join((readiness_blocking_reasons + readiness_warning_reasons)[:4]) or "Unita non pronta per ospite",
                        "property_id": property_obj.id if property_obj else None,
                        "property_name": property_obj.name if property_obj else None,
                        "unit_id": unit_id_value,
                        "unit_name": unit_obj.name if unit_obj else f"Unit {unit_id_value}",
                        "device_id": None,
                        "alert_id": None,
                        "execution_id": None,
                        "maintenance_id": None,
                        "task_id": None,
                        "suggested_action": "open_unit",
                        "occurred_at": self._as_utc_datetime(readiness.get("last_evaluated_at") if readiness else None),
                        "last_seen_at": self._as_utc_datetime(readiness.get("last_evaluated_at") if readiness else None),
                        "refs": {"unit_id": unit_id_value},
                    }
                )

            for alert in unit_alerts:
                issue = {
                    "issue_id": f"alert-{alert.id}",
                    "issue_type": "alert.open",
                    "severity": (alert.severity or "warning"),
                    "status": alert.status or "open",
                    "title": alert.title,
                    "description": alert.description,
                    "property_id": property_obj.id if property_obj else None,
                    "property_name": property_obj.name if property_obj else None,
                    "unit_id": unit_id_value,
                    "unit_name": unit_obj.name if unit_obj else f"Unit {unit_id_value}",
                    "device_id": alert.device_id,
                    "alert_id": alert.id,
                    "execution_id": None,
                    "maintenance_id": None,
                    "task_id": None,
                    "suggested_action": "acknowledge_alert",
                    "occurred_at": self._as_utc_datetime(alert.first_seen_at),
                    "last_seen_at": self._as_utc_datetime(alert.last_seen_at),
                    "refs": {"alert_id": alert.id, "unit_id": unit_id_value, "device_id": alert.device_id},
                }
                issues.append(issue)

            for device in devices:
                if int(device.get("unit_id") or -1) != unit_id_value:
                    continue
                freshness = str(device.get("data_freshness_status") or "fresh")
                if not device.get("needs_attention") and freshness == "fresh":
                    continue
                issue_type_value = "device.offline" if device.get("connectivity_status") == "offline" else f"device.health.{device.get('health_status') or 'warning'}"
                if freshness == "stale" and issue_type_value == "device.health.healthy":
                    issue_type_value = "device.stale"
                issue_severity = "critical" if issue_type_value == "device.offline" or device.get("health_status") == "critical" else "warning"
                issue = {
                    "issue_id": f"device-{device['device_id']}-{issue_type_value}",
                    "issue_type": issue_type_value,
                    "severity": issue_severity,
                    "status": "open",
                    "title": f"Issue dispositivo: {device.get('name')}",
                    "description": ", ".join(device.get("reasons") or []),
                    "property_id": property_obj.id if property_obj else None,
                    "property_name": property_obj.name if property_obj else None,
                    "unit_id": unit_id_value,
                    "unit_name": unit_obj.name if unit_obj else f"Unit {unit_id_value}",
                    "device_id": device["device_id"],
                    "alert_id": None,
                    "execution_id": None,
                    "maintenance_id": None,
                    "task_id": None,
                    "suggested_action": "open_device",
                    "occurred_at": self._as_utc_datetime(device.get("last_seen_at")),
                    "last_seen_at": self._as_utc_datetime(device.get("last_seen_at")),
                    "refs": {"device_id": device["device_id"], "unit_id": unit_id_value},
                }
                issues.append(issue)

            for execution in unit_executions:
                if execution.status not in {"failed", "partial"}:
                    continue
                issue = {
                    "issue_id": f"execution-{execution.id}",
                    "issue_type": f"automation.{execution.status}",
                    "severity": "critical" if execution.status == "failed" else "warning",
                    "status": "open",
                    "title": f"Automazione {execution.status}: #{execution.id}",
                    "description": execution.error_message or f"{execution.trigger_type} · {execution.trigger_source}",
                    "property_id": property_obj.id if property_obj else None,
                    "property_name": property_obj.name if property_obj else None,
                    "unit_id": unit_id_value,
                    "unit_name": unit_obj.name if unit_obj else f"Unit {unit_id_value}",
                    "device_id": None,
                    "alert_id": None,
                    "execution_id": execution.id,
                    "maintenance_id": None,
                    "task_id": None,
                    "suggested_action": "open_automation",
                    "occurred_at": self._as_utc_datetime(execution.started_at),
                    "last_seen_at": self._as_utc_datetime(execution.finished_at or execution.started_at),
                    "refs": {"execution_id": execution.id, "rule_id": execution.rule_id, "scene_id": execution.scene_id, "unit_id": unit_id_value},
                }
                issues.append(issue)

            for insight in telemetry_by_unit.get(unit_id_value, []):
                insight_type = str(insight.get("insight_type") or "telemetry.sensor_value_out_of_range")
                issue = {
                    "issue_id": f"telemetry-{insight['id']}",
                    "issue_type": insight_type,
                    "severity": insight.get("severity") or "warning",
                    "status": insight.get("status") or "open",
                    "title": f"Insight telemetry: {insight_type}",
                    "description": f"Valore {insight.get('value')} soglia {insight.get('threshold')}",
                    "property_id": property_obj.id if property_obj else None,
                    "property_name": property_obj.name if property_obj else None,
                    "unit_id": unit_id_value,
                    "unit_name": unit_obj.name if unit_obj else f"Unit {unit_id_value}",
                    "device_id": insight.get("device_id"),
                    "alert_id": None,
                    "execution_id": None,
                    "maintenance_id": None,
                    "task_id": None,
                    "suggested_action": "open_device",
                    "occurred_at": self._as_utc_datetime(insight.get("detected_at")),
                    "last_seen_at": self._as_utc_datetime(insight.get("detected_at")),
                    "refs": {"telemetry_insight_id": insight.get("id"), "device_id": insight.get("device_id"), "unit_id": unit_id_value},
                }
                issues.append(issue)

            for ticket in unit_maintenance:
                ticket_priority = (ticket.priority or "medium").lower()
                issue = {
                    "issue_id": f"maintenance-{ticket.id}",
                    "issue_type": "maintenance.smart_related",
                    "severity": "critical" if ticket_priority in {"urgent", "high"} else "warning",
                    "status": ticket.status or "todo",
                    "title": ticket.title,
                    "description": ticket.description,
                    "property_id": property_obj.id if property_obj else None,
                    "property_name": property_obj.name if property_obj else None,
                    "unit_id": unit_id_value,
                    "unit_name": unit_obj.name if unit_obj else f"Unit {unit_id_value}",
                    "device_id": None,
                    "alert_id": None,
                    "execution_id": None,
                    "maintenance_id": ticket.id,
                    "task_id": None,
                    "suggested_action": "open_maintenance",
                    "occurred_at": self._as_utc_datetime(ticket.created_at),
                    "last_seen_at": self._as_utc_datetime(ticket.updated_at or ticket.created_at),
                    "refs": {"maintenance_id": ticket.id, "unit_id": unit_id_value},
                }
                issues.append(issue)

            if score > 0:
                for task in unit_tasks[:3]:
                    issue = {
                        "issue_id": f"task-{task.id}",
                        "issue_type": "staff_task.impacted",
                        "severity": "warning",
                        "status": task.status or "planned",
                        "title": f"Task impattata: {task.task_type}",
                        "description": f"Task del {task.date.isoformat()} da allineare con lo stato smart dell'unita",
                        "property_id": property_obj.id if property_obj else None,
                        "property_name": property_obj.name if property_obj else None,
                        "unit_id": unit_id_value,
                        "unit_name": unit_obj.name if unit_obj else f"Unit {unit_id_value}",
                        "device_id": None,
                        "alert_id": None,
                        "execution_id": None,
                        "maintenance_id": None,
                        "task_id": task.id,
                        "suggested_action": "open_staff_planner",
                        "occurred_at": self._combine_date_time(task.date, task.time),
                        "last_seen_at": self._combine_date_time(task.date, task.time),
                        "refs": {"task_id": task.id, "unit_id": unit_id_value},
                    }
                    issues.append(issue)

        for alert in all_alerts_recent[:20]:
            activity.append(
                {
                    "id": f"alert-activity-{alert.id}",
                    "title": alert.title,
                    "subtitle": f"{alert.alert_type} · {alert.status}",
                    "severity": alert.severity or "warning",
                    "occurred_at": self._as_utc_datetime(alert.last_seen_at or alert.first_seen_at),
                    "refs": {"alert_id": alert.id, "unit_id": alert.unit_id, "device_id": alert.device_id},
                }
            )

        for execution in executions[:20]:
            if execution.status not in {"failed", "partial"}:
                continue
            scope = self._extract_execution_scope(execution)
            activity.append(
                {
                    "id": f"execution-activity-{execution.id}",
                    "title": f"Esecuzione automazione {execution.status}",
                    "subtitle": f"{execution.trigger_type} · {execution.trigger_source}",
                    "severity": "critical" if execution.status == "failed" else "warning",
                    "occurred_at": self._as_utc_datetime(execution.started_at),
                    "refs": {"execution_id": execution.id, "rule_id": execution.rule_id, "scene_id": execution.scene_id, "unit_id": scope.get("unit_id")},
                }
            )

        activity.sort(key=lambda item: self._as_utc_datetime(item.get("occurred_at")) or datetime.min.replace(tzinfo=timezone.utc), reverse=True)
        units_attention.sort(key=lambda item: (item["attention_score"], self._as_utc_datetime(item.get("recent_issue_at")) or datetime.min.replace(tzinfo=timezone.utc)), reverse=True)
        issues.sort(key=self._issue_sort_key, reverse=True)

        filtered_issues = [
            issue for issue in issues
            if self._severity_allowed(severity, issue["severity"])
            and self._issue_type_allowed(issue_type, issue["issue_type"])
            and self._status_allowed(status, issue["status"])
        ]
        filtered_activity = [
            item for item in activity if self._severity_allowed(severity, item["severity"])
        ]

        summary = {
            "units_needing_attention": len(units_attention),
            "open_issues": len([issue for issue in filtered_issues if issue["status"] in {"open", "planned", "in_progress", "todo"}]),
            "critical_issues": len([issue for issue in filtered_issues if issue["severity"] == "critical"]),
            "open_alerts": len(open_alerts),
            "offline_devices": len([device for device in devices if device.get("connectivity_status") == "offline"]),
            "unhealthy_devices": len([device for device in devices if device.get("health_status") in {"warning", "critical"}]),
            "automation_failures_recent": len([execution for execution in executions if execution.status in {"failed", "partial"}]),
            "readiness_blocked_units": len([row for row in readiness_rows if row["readiness_status"] == "BLOCKED"]),
            "readiness_not_ready_units": len([row for row in readiness_rows if row["readiness_status"] in {"BLOCKED", "NEEDS_ATTENTION"}]),
        }
        freshness_times = [
            self._as_utc_datetime(item.get("occurred_at"))
            for item in (filtered_activity[:40])
            if item.get("occurred_at") is not None
        ]
        freshness_times.extend(
            [
                self._as_utc_datetime(issue.get("last_seen_at") or issue.get("occurred_at"))
                for issue in filtered_issues[:40]
                if issue.get("last_seen_at") is not None or issue.get("occurred_at") is not None
            ]
        )
        last_updated_at = max([ts for ts in freshness_times if ts is not None], default=datetime.now(timezone.utc))
        return {
            "filters": {
                "property_id": property_id,
                "unit_id": unit_id,
                "severity": severity,
                "issue_type": issue_type,
                "status": status,
            },
            "summary": summary,
            "units_needing_attention": units_attention,
            "issues": filtered_issues[:120],
            "activity": filtered_activity[:80],
            "last_updated_at": last_updated_at,
            "data_freshness_status": self._compute_data_freshness(last_updated_at),
        }

    def smart_operations(
        self,
        *,
        property_id: int | None = None,
        unit_id: int | None = None,
        severity: str | None = None,
        issue_type: str | None = None,
        status: str | None = None,
    ) -> dict[str, object]:
        return self._build_smart_operations_payload(
            property_id=property_id,
            unit_id=unit_id,
            severity=severity,
            issue_type=issue_type,
            status=status,
        )

    def list_smart_operations_units_needing_attention(
        self,
        *,
        property_id: int | None = None,
        unit_id: int | None = None,
        severity: str | None = None,
    ) -> list[dict[str, object]]:
        payload = self._build_smart_operations_payload(
            property_id=property_id,
            unit_id=unit_id,
            severity=severity,
        )
        units = payload["units_needing_attention"]
        if severity:
            normalized = severity.strip().lower()
            units = [unit for unit in units if unit["severity"] == normalized]
        return units

    def list_smart_operations_issues(
        self,
        *,
        property_id: int | None = None,
        unit_id: int | None = None,
        severity: str | None = None,
        issue_type: str | None = None,
        status: str | None = None,
    ) -> list[dict[str, object]]:
        payload = self._build_smart_operations_payload(
            property_id=property_id,
            unit_id=unit_id,
            severity=severity,
            issue_type=issue_type,
            status=status,
        )
        return payload["issues"]

    def list_smart_operations_activity(
        self,
        *,
        property_id: int | None = None,
        unit_id: int | None = None,
        severity: str | None = None,
    ) -> list[dict[str, object]]:
        payload = self._build_smart_operations_payload(
            property_id=property_id,
            unit_id=unit_id,
            severity=severity,
        )
        return payload["activity"]
