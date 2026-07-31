"""Composed read models: dashboard, overview, unit detail, timeline.

Split out of the former single-file ``service.py``; the method bodies are
unchanged. Every module is a mixin combined by ``SmartBuildingService``,
so cross-module ``self`` calls keep working exactly as before.
"""

from __future__ import annotations

from datetime import datetime, time, timedelta, timezone

from sqlalchemy import and_, func, or_

from app.models.booking import Booking
from app.models.maintenance import MaintenanceTicket
from app.models.property import Property
from app.models.staff_task import StaffTask
from app.models.unit import Unit
from app.models.smart_building import (
    Alert,
    AutomationExecution,
    Device,
    DeviceCommand,
    DeviceEvent,
    DeviceState,
    SmartProviderConnection,
)


class ReadModelsMixin:
    """Composed read models: dashboard, overview, unit detail, timeline."""

    def smart_dashboard(
        self,
        *,
        property_id: int | None = None,
        unit_id: int | None = None,
    ) -> dict[str, object]:
        unit_ids_for_scope: set[int] | None = None
        if property_id is not None:
            self._property_or_404(property_id)
            scoped_units = self._property_units(property_id)
            unit_ids_for_scope = {u.id for u in scoped_units}
        if unit_id is not None:
            self._ensure_unit_visible(unit_id)
            unit_ids_for_scope = {unit_id}

        health = self.get_device_health_overview(
            unit_id=unit_id,
            property_id=property_id,
        )
        device_records = health["devices"]
        total_devices = len(device_records)
        online_devices = sum(1 for d in device_records if d.get("connectivity_status") == "online")
        offline_devices = sum(1 for d in device_records if d.get("connectivity_status") == "offline")
        warning_devices = sum(1 for d in device_records if d.get("health_status") == "warning")
        critical_devices = sum(1 for d in device_records if d.get("health_status") == "critical")

        properties_query = self._scoped_query(Property)
        if property_id is not None:
            properties_query = properties_query.filter(Property.id == property_id)
        total_properties = properties_query.with_entities(func.count(Property.id)).scalar() or 0

        units_query = self.db.query(Unit)
        if unit_ids_for_scope:
            units_query = units_query.filter(Unit.id.in_(list(unit_ids_for_scope)))
        total_units = units_query.with_entities(func.count(Unit.id)).scalar() or 0

        alerts_query = self._scoped_query(Alert)
        if unit_ids_for_scope:
            alerts_query = alerts_query.filter(Alert.unit_id.in_(list(unit_ids_for_scope)))
        open_alerts = alerts_query.filter(Alert.status == "open").with_entities(func.count(Alert.id)).scalar() or 0
        recent_alert_rows = (
            alerts_query.order_by(Alert.last_seen_at.desc(), Alert.id.desc()).limit(8).all()
        )
        recent_alerts = [
            {
                "id": f"alert-{a.id}",
                "title": a.title,
                "subtitle": a.description,
                "severity": a.severity or "warning",
                "occurred_at": a.last_seen_at,
                "refs": {"alert_id": a.id, "unit_id": a.unit_id, "device_id": a.device_id},
            }
            for a in recent_alert_rows
        ]

        start_today = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
        executions_query = self._scoped_query(AutomationExecution).filter(AutomationExecution.started_at >= start_today)
        executions_today = executions_query.order_by(AutomationExecution.started_at.desc(), AutomationExecution.id.desc()).all()
        executions_today = [
            e for e in executions_today
            if self._execution_matches_scope(e, unit_id=unit_id, unit_ids=unit_ids_for_scope)
        ]
        automation_executions_today = len(executions_today)
        automation_failures_today = sum(1 for e in executions_today if e.status == "failed")
        automation_partial_today = sum(1 for e in executions_today if e.status == "partial")

        recent_executions_rows = (
            self._scoped_query(AutomationExecution)
            .order_by(AutomationExecution.started_at.desc(), AutomationExecution.id.desc())
            .limit(120)
            .all()
        )
        recent_executions_rows = [
            e for e in recent_executions_rows
            if self._execution_matches_scope(e, unit_id=unit_id, unit_ids=unit_ids_for_scope)
        ][:10]
        recent_executions = [
            {
                "id": f"exec-{e.id}",
                "title": f"Esecuzione #{e.id} ({e.status})",
                "subtitle": f"{e.trigger_type} · {e.trigger_source}",
                "severity": "critical" if e.status == "failed" else ("warning" if e.status == "partial" else "info"),
                "occurred_at": e.started_at,
                "refs": {"execution_id": e.id, "rule_id": e.rule_id, "scene_id": e.scene_id},
            }
            for e in recent_executions_rows
        ]
        recent_automation_failures = [
            {
                "id": f"exec-{e.id}",
                "title": f"Esecuzione #{e.id} ({e.status})",
                "subtitle": f"{e.trigger_type} · {e.trigger_source}",
                "severity": "critical" if e.status == "failed" else "warning",
                "occurred_at": e.started_at,
                "refs": {"execution_id": e.id, "rule_id": e.rule_id, "scene_id": e.scene_id},
            }
            for e in recent_executions_rows
            if e.status in {"failed", "partial"}
        ][:8]

        provider_query = self._scoped_query(SmartProviderConnection)
        if property_id is not None:
            provider_query = provider_query.filter(SmartProviderConnection.property_id == property_id)
        provider_statuses = [
            {
                "connection_id": conn.id,
                "property_id": conn.property_id,
                "provider_name": conn.provider_name,
                "status": conn.status,
                "is_active": conn.is_active,
                "last_sync_at": conn.last_sync_at,
                "last_error": conn.last_error,
            }
            for conn in provider_query.order_by(SmartProviderConnection.updated_at.desc()).limit(20).all()
        ]

        problematic_units = [
            item for item in health["units"]
            if item["offline_devices"] > 0 or item["warning_devices"] > 0 or item["critical_devices"] > 0
        ][:8]
        top_device_issues = [
            item for item in device_records if item.get("needs_attention")
        ][:10]
        readiness_rows = self.list_unit_readiness(
            property_id=property_id,
            unit_id=unit_id,
        )
        readiness_overview = self._readiness_overview(readiness_rows)
        units_not_ready = [
            row for row in readiness_rows if row["readiness_status"] in {"BLOCKED", "NEEDS_ATTENTION"}
        ][:12]
        telemetry_anomalies = self.list_telemetry_insights(
            property_id=property_id,
            unit_id=unit_id,
            status="open",
        )[:12]
        recent_abnormal_readings = self.list_telemetry_insights(
            property_id=property_id,
            unit_id=unit_id,
        )[:12]
        environment_summary, energy_summary = self._telemetry_scope_summaries(
            property_id=property_id,
            unit_id=unit_id,
        )
        timestamps: list[datetime] = []
        timestamps.extend(
            [
                self._as_utc_datetime(item.get("occurred_at"))
                for item in (recent_alerts + recent_executions + recent_automation_failures)
                if item.get("occurred_at") is not None
            ]
        )
        timestamps.extend(
            [
                self._as_utc_datetime(item.get("detected_at"))
                for item in (telemetry_anomalies + recent_abnormal_readings)
                if item.get("detected_at") is not None
            ]
        )
        timestamps.extend(
            [
                self._as_utc_datetime(item.get("last_evaluated_at"))
                for item in units_not_ready
                if item.get("last_evaluated_at") is not None
            ]
        )
        last_updated_at = max([ts for ts in timestamps if ts is not None], default=datetime.now(timezone.utc))

        return {
            "filters": {"property_id": property_id, "unit_id": unit_id},
            "kpis": {
                "total_properties": int(total_properties),
                "total_units": int(total_units),
                "total_devices": int(total_devices),
                "online_devices": int(online_devices),
                "offline_devices": int(offline_devices),
                "warning_devices": int(warning_devices),
                "critical_devices": int(critical_devices),
                "open_alerts": int(open_alerts),
                "automation_executions_today": int(automation_executions_today),
                "automation_failures_today": int(automation_failures_today),
                "automation_partial_today": int(automation_partial_today),
            },
            "problematic_units": problematic_units,
            "top_device_issues": top_device_issues,
            "recent_alerts": recent_alerts,
            "recent_automation_failures": recent_automation_failures,
            "recent_executions": recent_executions,
            "telemetry_anomalies": telemetry_anomalies,
            "recent_abnormal_readings": recent_abnormal_readings,
            "energy_summary": energy_summary,
            "environment_summary": environment_summary,
            "readiness_overview": readiness_overview,
            "units_not_ready": units_not_ready,
            "provider_statuses": provider_statuses,
            "last_updated_at": last_updated_at,
            "data_freshness_status": self._compute_data_freshness(last_updated_at),
        }

    def get_unit_smart_detail(self, unit_id: int, events_limit: int = 50) -> dict[str, object]:
        unit = self._ensure_unit_visible(unit_id)
        guest_readiness = self.get_unit_readiness(unit_id)
        telemetry_insights_active = self.list_telemetry_insights(unit_id=unit_id, status="open")
        environment_summary, energy_summary = self._telemetry_scope_summaries(unit_id=unit_id)

        devices = (
            self._scoped_query(Device)
            .filter(Device.unit_id == unit_id)
            .order_by(Device.name.asc(), Device.id.asc())
            .all()
        )
        device_ids = [d.id for d in devices]

        states: list[DeviceState] = []
        if device_ids:
            states = (
                self._scoped_query(DeviceState)
                .filter(DeviceState.device_id.in_(device_ids))
                .order_by(DeviceState.device_id.asc())
                .all()
            )

        open_alerts = (
            self._scoped_query(Alert)
            .filter(Alert.unit_id == unit_id, Alert.status == "open")
            .order_by(Alert.last_seen_at.desc(), Alert.id.desc())
            .all()
        )
        resolved_alerts = (
            self._scoped_query(Alert)
            .filter(Alert.unit_id == unit_id, Alert.status != "open")
            .order_by(Alert.last_seen_at.desc(), Alert.id.desc())
            .all()
        )

        events_query = self._scoped_query(DeviceEvent).outerjoin(Device, DeviceEvent.device_id == Device.id)
        events_query = events_query.filter(
            or_(
                DeviceEvent.unit_id == unit_id,
                and_(DeviceEvent.unit_id.is_(None), Device.unit_id == unit_id),
            )
        ).order_by(DeviceEvent.occurred_at.desc(), DeviceEvent.id.desc())
        events = events_query.limit(max(1, min(events_limit, 200))).all()

        state_by_device = {state.device_id: state for state in states}
        online_devices = 0
        offline_devices = 0
        warning_devices = 0
        critical_devices = 0
        now = datetime.now(timezone.utc)
        for device in devices:
            health = self._build_device_health_record(
                device,
                state_by_device.get(device.id),
                now=now,
            )
            connectivity = health["connectivity_status"]
            if connectivity == "online":
                online_devices += 1
            elif connectivity == "offline":
                offline_devices += 1
            health_status = health["health_status"]
            if health_status == "warning":
                warning_devices += 1
            elif health_status == "critical":
                critical_devices += 1

        total_devices = len(devices)
        unknown_state_devices = max(total_devices - online_devices - offline_devices, 0)
        detail_timestamps: list[datetime] = []
        detail_timestamps.extend(
            [self._as_utc_datetime(event.occurred_at) for event in events if event.occurred_at is not None]
        )
        detail_timestamps.extend(
            [
                self._as_utc_datetime(alert.last_seen_at or alert.first_seen_at)
                for alert in (open_alerts + resolved_alerts)
                if (alert.last_seen_at or alert.first_seen_at) is not None
            ]
        )
        detail_timestamps.extend(
            [
                self._as_utc_datetime(insight.get("detected_at"))
                for insight in telemetry_insights_active
                if insight.get("detected_at") is not None
            ]
        )
        detail_timestamps.append(self._as_utc_datetime(guest_readiness.get("last_evaluated_at")))
        last_updated_at = max([ts for ts in detail_timestamps if ts is not None], default=datetime.now(timezone.utc))

        return {
            "unit": unit,
            "summary": {
                "total_devices": total_devices,
                "online_devices": online_devices,
                "offline_devices": offline_devices,
                "unknown_state_devices": unknown_state_devices,
                "open_alerts": len(open_alerts),
                "resolved_alerts": len(resolved_alerts),
                "warning_devices": warning_devices,
                "critical_devices": critical_devices,
            },
            "devices": devices,
            "states": states,
            "alerts_open": open_alerts,
            "alerts_resolved": resolved_alerts,
            "events_recent": events,
            "telemetry_insights_active": telemetry_insights_active,
            "environment_summary": environment_summary,
            "energy_summary": energy_summary,
            "guest_readiness": guest_readiness,
            "last_updated_at": last_updated_at,
            "data_freshness_status": self._compute_data_freshness(last_updated_at),
        }

    def get_unit_timeline(
        self, unit_id: int, limit: int = 50, before: datetime | None = None
    ) -> dict[str, object]:
        unit = self._ensure_unit_visible(unit_id)

        safe_limit = max(1, min(limit, 200))
        scan_limit = max(60, min(safe_limit * 6, 600))
        before_utc = self._as_utc_datetime(before)
        items: list[dict[str, object]] = []

        smart_events_query = self._scoped_query(DeviceEvent).outerjoin(Device, DeviceEvent.device_id == Device.id)
        smart_events_query = smart_events_query.filter(
            or_(
                DeviceEvent.unit_id == unit_id,
                and_(DeviceEvent.unit_id.is_(None), Device.unit_id == unit_id),
            )
        ).order_by(DeviceEvent.occurred_at.desc(), DeviceEvent.id.desc())
        smart_events = smart_events_query.limit(scan_limit).all()
        for event in smart_events:
            occurred = self._as_utc_datetime(event.occurred_at)
            if occurred is None:
                continue
            items.append(
                {
                    "timeline_id": f"smart-event-{event.id}",
                    "category": "smart",
                    "event_type": event.event_type,
                    "source": f"smart.event:{event.source}",
                    "severity": event.severity or "info",
                    "title": f"Device event: {event.event_type}",
                    "description": event.payload_json,
                    "occurred_at": occurred,
                    "unit_id": unit_id,
                    "device_id": event.device_id,
                }
            )

        alerts = (
            self._scoped_query(Alert)
            .filter(Alert.unit_id == unit_id)
            .order_by(Alert.last_seen_at.desc(), Alert.id.desc())
            .limit(scan_limit)
            .all()
        )
        for alert in alerts:
            occurred = self._as_utc_datetime(alert.last_seen_at or alert.first_seen_at)
            if occurred is None:
                continue
            status = (alert.status or "open").strip().lower()
            severity = alert.severity or ("warning" if status == "open" else "info")
            items.append(
                {
                    "timeline_id": f"smart-alert-{alert.id}",
                    "category": "smart",
                    "event_type": f"alert_{status}",
                    "source": "smart.alert",
                    "severity": severity,
                    "title": alert.title,
                    "description": alert.description or f"Alert {alert.alert_type} ({status})",
                    "occurred_at": occurred,
                    "unit_id": unit_id,
                    "device_id": alert.device_id,
                    "alert_id": alert.id,
                }
            )

        commands = (
            self._scoped_query(DeviceCommand)
            .filter(DeviceCommand.unit_id == unit_id)
            .order_by(DeviceCommand.requested_at.desc(), DeviceCommand.id.desc())
            .limit(scan_limit)
            .all()
        )
        for command in commands:
            occurred = self._as_utc_datetime(
                command.executed_at
                or command.failed_at
                or command.expired_at
                or command.accepted_at
                or command.requested_at
            )
            if occurred is None:
                continue
            command_status = (command.status or "pending").strip().lower()
            items.append(
                {
                    "timeline_id": f"smart-command-{command.id}",
                    "category": "smart",
                    "event_type": f"command_{command_status}",
                    "source": f"smart.command:{command.provider}",
                    "severity": "warning" if command_status in {"failed", "expired"} else "info",
                    "title": f"Command {command.command_type}",
                    "description": command.error_message
                    or command.result_json
                    or f"Status: {command_status}",
                    "occurred_at": occurred,
                    "unit_id": unit_id,
                    "device_id": command.device_id,
                    "command_id": command.id,
                }
            )

        bookings = (
            self.db.query(Booking)
            .filter(Booking.unit_id == unit_id)
            .order_by(Booking.checkin_date.desc(), Booking.id.desc())
            .limit(scan_limit)
            .all()
        )
        for booking in bookings:
            checkin_dt = self._combine_date_time(booking.checkin_date, booking.estimated_arrival_time)
            checkout_dt = self._combine_date_time(booking.checkout_date, time(hour=11, minute=0))
            if checkin_dt is not None:
                items.append(
                    {
                        "timeline_id": f"ops-booking-checkin-{booking.id}-{booking.checkin_date.isoformat()}",
                        "category": "pms",
                        "event_type": "booking_checkin",
                        "source": "pms.booking",
                        "severity": "info",
                        "title": f"Check-in {booking.guest_name}",
                        "description": f"Sorgente {booking.source} - {booking.checkin_date.isoformat()}",
                        "occurred_at": checkin_dt,
                        "unit_id": unit_id,
                        "booking_id": booking.id,
                    }
                )
            if checkout_dt is not None:
                items.append(
                    {
                        "timeline_id": f"ops-booking-checkout-{booking.id}-{booking.checkout_date.isoformat()}",
                        "category": "pms",
                        "event_type": "booking_checkout",
                        "source": "pms.booking",
                        "severity": "info",
                        "title": f"Check-out {booking.guest_name}",
                        "description": f"Checkout previsto {booking.checkout_date.isoformat()}",
                        "occurred_at": checkout_dt,
                        "unit_id": unit_id,
                        "booking_id": booking.id,
                    }
                )

        tasks = (
            self.db.query(StaffTask)
            .filter(StaffTask.unit_id == unit_id)
            .order_by(StaffTask.date.desc(), StaffTask.id.desc())
            .limit(scan_limit)
            .all()
        )
        for task in tasks:
            occurred = self._combine_date_time(task.date, task.time)
            if occurred is None:
                continue
            status = (task.status or "planned").strip().lower()
            items.append(
                {
                    "timeline_id": f"ops-task-{task.id}",
                    "category": "ops",
                    "event_type": f"staff_task_{status}",
                    "source": "ops.staff_task",
                    "severity": "info" if status in {"done", "planned"} else "warning",
                    "title": f"Task {task.task_type}",
                    "description": task.notes
                    or f"Assegnato a {task.assignee_name or 'n/d'} - stato {status}",
                    "occurred_at": occurred,
                    "unit_id": unit_id,
                    "booking_id": task.booking_id,
                    "task_id": task.id,
                }
            )

        tickets = (
            self.db.query(MaintenanceTicket)
            .filter(MaintenanceTicket.unit_id == unit_id)
            .order_by(
                MaintenanceTicket.updated_at.desc(),
                MaintenanceTicket.created_at.desc(),
                MaintenanceTicket.id.desc(),
            )
            .limit(scan_limit)
            .all()
        )
        for ticket in tickets:
            occurred = self._as_utc_datetime(ticket.updated_at or ticket.created_at)
            if occurred is None:
                continue
            status = (ticket.status or "todo").strip().lower()
            items.append(
                {
                    "timeline_id": f"ops-maintenance-{ticket.id}",
                    "category": "ops",
                    "event_type": f"maintenance_{status}",
                    "source": "ops.maintenance",
                    "severity": "warning" if status in {"todo", "in_progress"} else "info",
                    "title": ticket.title,
                    "description": ticket.description or f"Priority {ticket.priority} - status {status}",
                    "occurred_at": occurred,
                    "unit_id": unit_id,
                    "maintenance_id": ticket.id,
                }
            )

        if before_utc is not None:
            items = [item for item in items if item["occurred_at"] < before_utc]

        items.sort(key=lambda item: (item["occurred_at"], item["timeline_id"]), reverse=True)
        has_more = len(items) > safe_limit
        sliced = items[:safe_limit]
        next_before = sliced[-1]["occurred_at"] if has_more and sliced else None

        return {
            "unit": unit,
            "items": sliced,
            "limit": safe_limit,
            "has_more": has_more,
            "next_before": next_before,
        }

    def smart_overview(self) -> dict[str, int]:
        devices = self._scoped_query(Device).all()
        total_devices = len(devices)
        device_ids = [device.id for device in devices]
        states_by_device: dict[int, DeviceState] = {}
        if device_ids:
            states = self._scoped_query(DeviceState).filter(DeviceState.device_id.in_(device_ids)).all()
            states_by_device = {state.device_id: state for state in states}
        now = datetime.now(timezone.utc)
        online_devices = sum(
            1
            for device in devices
            if self._build_device_health_record(device, states_by_device.get(device.id), now=now)[
                "connectivity_status"
            ]
            == "online"
        )
        open_alerts = (
            self._scoped_query(Alert).with_entities(func.count(Alert.id))
            .filter(Alert.status == "open")
            .scalar()
            or 0
        )
        critical_alerts = (
            self._scoped_query(Alert).with_entities(func.count(Alert.id))
            .filter(Alert.status == "open", Alert.severity == "critical")
            .scalar()
            or 0
        )
        threshold = datetime.now(timezone.utc) - timedelta(hours=12)
        recently_seen_devices = (
            self._scoped_query(Device).with_entities(func.count(Device.id))
            .filter(Device.last_seen_at.is_not(None), Device.last_seen_at >= threshold)
            .scalar()
            or 0
        )
        return {
            "total_devices": int(total_devices),
            "online_devices": int(online_devices),
            "offline_devices": int(max(total_devices - online_devices, 0)),
            "open_alerts": int(open_alerts),
            "critical_alerts": int(critical_alerts),
            "recently_seen_devices": int(recently_seen_devices),
        }
