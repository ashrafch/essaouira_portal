"""Check-in / checkout guided assistants.

Split out of the former single-file ``service.py``; the method bodies are
unchanged. Every module is a mixin combined by ``SmartBuildingService``,
so cross-module ``self`` calls keep working exactly as before.
"""

from __future__ import annotations

from datetime import date, datetime, timedelta, timezone

from fastapi import HTTPException

from app.core.config import settings
from app.domains.smart_building.services.constants import (
    POWER_CATEGORIES,
    CLIMATE_CATEGORIES,
    LOCK_CATEGORIES,
)
from app.models.booking import Booking
from app.models.maintenance import MaintenanceTicket
from app.models.property import Property
from app.models.staff_task import StaffTask
from app.models.unit import Unit
from app.models.smart_building import (
    Alert,
    AutomationExecution,
    Device,
    DeviceState,
    Scene,
    SceneAction,
)


class AssistantsMixin:
    """Check-in / checkout guided assistants."""

    def _assistant_default_window(self) -> tuple[date, date]:
        today = date.today()
        return today, today + timedelta(days=3)

    def _assistant_bookings_query(
        self,
        *,
        assistant_type: str,
        property_id: int | None,
        unit_id: int | None,
        date_from: date | None,
        date_to: date | None,
    ):
        window_from, window_to = self._assistant_default_window()
        effective_from = date_from or window_from
        effective_to = date_to or window_to
        if effective_from > effective_to:
            raise HTTPException(status_code=400, detail="Intervallo date assistant non valido")

        scope_unit_ids = self._scope_unit_ids_for_operations(property_id=property_id, unit_id=unit_id)
        query = self.db.query(Booking).join(Unit, Booking.unit_id == Unit.id)
        if scope_unit_ids is not None:
            if not scope_unit_ids:
                return [], effective_from, effective_to
            query = query.filter(Booking.unit_id.in_(list(scope_unit_ids)))
        if assistant_type == "checkin":
            query = query.filter(Booking.checkin_date >= effective_from, Booking.checkin_date <= effective_to)
            query = query.order_by(Booking.checkin_date.asc(), Booking.id.asc())
        else:
            query = query.filter(Booking.checkout_date >= effective_from, Booking.checkout_date <= effective_to)
            query = query.order_by(Booking.checkout_date.asc(), Booking.id.asc())
        return query.all(), effective_from, effective_to

    def _assistant_scene_keywords(self, assistant_type: str) -> tuple[str, ...]:
        if assistant_type == "checkin":
            return ("welcome", "check-in", "checkin", "arrival")
        return ("checkout", "check-out", "eco", "vacancy", "off")

    def _find_scene_for_assistant(self, assistant_type: str, unit_id: int) -> Scene | None:
        keywords = self._assistant_scene_keywords(assistant_type)
        unit_device_ids = {
            row[0]
            for row in self.db.query(Device.id).filter(Device.unit_id == unit_id).all()
        }
        candidates = (
            self._scoped_query(Scene)
            .filter(Scene.is_active.is_(True))
            .order_by(Scene.updated_at.desc(), Scene.id.desc())
            .limit(50)
            .all()
        )
        for scene in candidates:
            haystack = f"{scene.name or ''} {scene.description or ''}".lower()
            if not any(keyword in haystack for keyword in keywords):
                continue
            actions = (
                self._scoped_query(SceneAction)
                .filter(SceneAction.scene_id == scene.id, SceneAction.is_active.is_(True))
                .all()
            )
            if not actions:
                return scene
            for action in actions:
                if action.target_unit_id == unit_id:
                    return scene
                if action.target_device_id is not None and action.target_device_id in unit_device_ids:
                    return scene
            if not any(action.target_unit_id or action.target_device_id for action in actions):
                return scene
        return None

    def _assistant_status_label(self, device_record: dict[str, object]) -> str:
        connectivity = str(device_record.get("connectivity_status") or "unknown")
        health = str(device_record.get("health_status") or "unknown")
        if connectivity == "online" and health == "healthy":
            return "OK"
        if connectivity == "online":
            return f"Online / {health}"
        return f"{connectivity} / {health}"

    def _is_device_active_for_checkout(self, device: Device, state: DeviceState | None) -> bool:
        if state is None:
            return False
        raw = self._safe_json_loads(state.raw_payload_json)
        attrs = raw.get("attributes") if isinstance(raw.get("attributes"), dict) else {}
        raw_state = str(raw.get("state") or attrs.get("state") or "").strip().lower()
        power_state = str(state.power_state or "").strip().lower()
        category = str(device.category or "").strip().lower()
        if category in POWER_CATEGORIES:
            return power_state == "on" or raw_state == "on"
        if category in CLIMATE_CATEGORIES:
            hvac_mode = str(attrs.get("hvac_mode") or raw_state).strip().lower()
            hvac_action = str(attrs.get("hvac_action") or "").strip().lower()
            return hvac_mode not in {"", "off", "idle", "unavailable"} or hvac_action in {"cooling", "heating", "fan"}
        if category in LOCK_CATEGORIES:
            return raw_state == "unlocked"
        return False

    def _unit_occupancy_state(self, unit_id: int | None) -> bool | None:
        """Is somebody still inside the unit?

        ``None`` when the building exposes no presence at all — a site without
        those sensors must not be told the unit is empty, only that it is
        unknown. Prefers the aggregated occupancy sensor, which VillaCore
        debounces, over a raw motion reading.
        """
        if unit_id is None:
            return None
        for capability in ("sensor.occupancy", "sensor.motion"):
            device = self.find_capability_device(capability, unit_id=unit_id)
            if device is None:
                continue
            state = self._state_value(device)
            if not state.get("online"):
                continue
            if state.get("motion_detected") is not None:
                return bool(state["motion_detected"])
            raw = str(state.get("value") or "").strip().lower()
            if raw in {"on", "true", "detected", "occupied"}:
                return True
            if raw in {"off", "false", "clear", "vacant"}:
                return False
        return None

    def _assistant_recent_failures_by_unit(self, unit_ids: set[int]) -> dict[int, list[AutomationExecution]]:
        if not unit_ids:
            return {}
        threshold = datetime.now(timezone.utc) - timedelta(hours=72)
        executions = (
            self._scoped_query(AutomationExecution)
            .filter(AutomationExecution.started_at >= threshold)
            .order_by(AutomationExecution.started_at.desc(), AutomationExecution.id.desc())
            .limit(500)
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
        return failures_by_unit

    def _assistant_recent_timeline(self, unit_id: int, limit: int = 6) -> list[dict[str, object]]:
        try:
            return list(self.get_unit_timeline(unit_id=unit_id, limit=limit).get("items", []))
        except HTTPException:
            return []

    def _assistant_relevant_task_types(self, assistant_type: str) -> set[str]:
        if assistant_type == "checkin":
            return {"checkin", "cleaning", "breakfast"}
        return {"checkout", "cleaning", "housekeeping", "maintenance"}

    def _assistant_quick_actions(
        self,
        *,
        assistant_type: str,
        booking: Booking,
        scene: Scene | None,
        alerts_open: list[Alert],
        maintenance_open: list[MaintenanceTicket],
        staff_tasks: list[StaffTask],
    ) -> list[dict[str, object]]:
        actions = [
            {
                "action_type": "open_unit_detail",
                "label": "Apri unita smart",
                "unit_id": booking.unit_id,
                "booking_id": booking.id,
                "route": f"/smart-units/{booking.unit_id}",
                "enabled": True,
            },
            {
                "action_type": "open_bookings",
                "label": "Apri prenotazioni",
                "unit_id": booking.unit_id,
                "booking_id": booking.id,
                "route": "/bookings",
                "enabled": True,
            },
        ]
        if scene is not None:
            actions.append(
                {
                    "action_type": "run_scene",
                    "label": "Trigger welcome scene" if assistant_type == "checkin" else "Trigger eco / checkout scene",
                    "scene_id": scene.id,
                    "unit_id": booking.unit_id,
                    "booking_id": booking.id,
                    "route": "/smart-automation",
                    "enabled": True,
                }
            )
        if staff_tasks:
            actions.append(
                {
                    "action_type": "open_staff_tasks",
                    "label": "Apri task staff",
                    "unit_id": booking.unit_id,
                    "booking_id": booking.id,
                    "route": "/staff-planner",
                    "enabled": True,
                }
            )
        if maintenance_open:
            actions.append(
                {
                    "action_type": "open_maintenance",
                    "label": "Apri manutenzioni",
                    "unit_id": booking.unit_id,
                    "booking_id": booking.id,
                    "route": "/maintenance",
                    "enabled": True,
                }
            )
        if alerts_open:
            actions.append(
                {
                    "action_type": "acknowledge_alert",
                    "label": "Prendi in carico alert",
                    "alert_id": alerts_open[0].id,
                    "unit_id": booking.unit_id,
                    "booking_id": booking.id,
                    "route": "/smart-alerts",
                    "enabled": True,
                }
            )
        return actions

    def _assistant_summary(
        self,
        assistant_type: str,
        assistant_status: str,
        blocking_reasons: list[str],
        warning_reasons: list[str],
        active_devices: list[dict[str, object]],
    ) -> str:
        if assistant_type == "checkin":
            if assistant_status == "READY":
                return "Unita pronta per l'arrivo ospite."
            if assistant_status == "BLOCKED":
                return f"Arrivo non pronto: {blocking_reasons[0]}"
            if assistant_status == "UNKNOWN":
                return "Dati smart insufficienti per validare l'arrivo."
            return f"Arrivo da verificare: {warning_reasons[0] if warning_reasons else 'controllo operativo richiesto'}"
        if assistant_status == "READY":
            return "Unita pronta per uscire dalla guest mode."
        if assistant_status == "BLOCKED":
            return f"Checkout non validabile: {blocking_reasons[0]}"
        if assistant_status == "UNKNOWN":
            return "Dati smart insufficienti per validare il checkout."
        if active_devices:
            return f"{len(active_devices)} dispositivi ancora attivi dopo il soggiorno."
        return f"Checkout da verificare: {warning_reasons[0] if warning_reasons else 'controllo operativo richiesto'}"

    def _build_assistant_item(
        self,
        *,
        assistant_type: str,
        booking: Booking,
        readiness: dict[str, object] | None,
        property_name: str | None,
        unit_device_health: list[dict[str, object]],
        device_map: dict[int, Device],
        state_by_device_id: dict[int, DeviceState],
        alerts_open: list[Alert],
        maintenance_open: list[MaintenanceTicket],
        relevant_tasks: list[StaffTask],
        automation_failures: list[AutomationExecution],
        recent_events: list[dict[str, object]],
        scene: Scene | None,
    ) -> dict[str, object] | None:
        readiness_status = str((readiness or {}).get("readiness_status") or "UNKNOWN")
        readiness_score = int((readiness or {}).get("readiness_score") or 0)
        blocking_reasons = list((readiness or {}).get("blocking_reasons") or [])
        warning_reasons = list((readiness or {}).get("warning_reasons") or [])
        essential_categories = set(settings.readiness_essential_device_categories)

        essential_devices = [
            {
                "device_id": int(record["device_id"]),
                "name": str(record["name"]),
                "category": str(record["category"]),
                "provider": str(record["provider"]),
                "connectivity_status": str(record["connectivity_status"]),
                "health_status": str(record["health_status"]),
                "status_label": self._assistant_status_label(record),
                "is_essential": True,
                "ok": record.get("connectivity_status") == "online" and record.get("health_status") == "healthy",
                "last_seen_at": self._as_utc_datetime(record.get("last_seen_at")),
            }
            for record in unit_device_health
            if str(record.get("category") or "").lower() in essential_categories
        ]

        active_devices: list[dict[str, object]] = []
        if assistant_type == "checkout":
            for record in unit_device_health:
                device_id = int(record["device_id"])
                device = device_map.get(device_id)
                if device is None:
                    continue
                state = state_by_device_id.get(device_id)
                if not self._is_device_active_for_checkout(device, state):
                    continue
                active_devices.append(
                    {
                        "device_id": device_id,
                        "name": str(record["name"]),
                        "category": str(record["category"]),
                        "provider": str(record["provider"]),
                        "connectivity_status": str(record["connectivity_status"]),
                        "health_status": str(record["health_status"]),
                        "status_label": self._assistant_status_label(record),
                        "is_essential": str(record.get("category") or "").lower() in essential_categories,
                        "ok": False,
                        "last_seen_at": self._as_utc_datetime(record.get("last_seen_at")),
                    }
                )

        pending_relevant_tasks = [
            task for task in relevant_tasks if (task.status or "").strip().lower() != "done"
        ]
        blocking_maintenance = [ticket for ticket in maintenance_open if self._is_blocking_maintenance(ticket)]
        if assistant_type == "checkin":
            critical_pending = [
                task for task in pending_relevant_tasks if str(task.task_type or "").strip().lower() in {"checkin", "cleaning"}
            ]
            if critical_pending:
                warning_reasons.append(f"{len(critical_pending)} task operative pre-arrivo aperte")
        else:
            if active_devices:
                warning_reasons.append(f"{len(active_devices)} dispositivi ancora attivi")
            if pending_relevant_tasks:
                warning_reasons.append(f"{len(pending_relevant_tasks)} task post-checkout aperte")
            if scene is None:
                warning_reasons.append("Scena eco / checkout non configurata")
            occupancy = self._unit_occupancy_state(booking.unit_id)
            if occupancy is True:
                # Closing a stay while someone is still inside is worth stopping
                # for, so this is a blocker rather than a warning.
                blocking_reasons.append("Presenza ancora rilevata nell'unita")

        if automation_failures:
            warning_reasons.append(f"{len(automation_failures)} failure automazione recenti")
        if blocking_maintenance:
            blocking_reasons.append(f"{len(blocking_maintenance)} ticket manutenzione bloccanti")

        blocking_reasons = self._dedupe_strings(blocking_reasons)
        warning_reasons = self._dedupe_strings(warning_reasons)

        tenant_scoped_signal = bool(unit_device_health or alerts_open or automation_failures)
        has_any_signal = bool(tenant_scoped_signal or maintenance_open or relevant_tasks)
        if self.tenant_id != "default" and not tenant_scoped_signal:
            return None
        if not has_any_signal:
            assistant_status = "UNKNOWN"
        elif blocking_reasons:
            assistant_status = "BLOCKED"
        elif warning_reasons:
            assistant_status = "NEEDS_ATTENTION"
        else:
            assistant_status = "READY"

        last_updated_candidates: list[datetime | None] = [
            self._as_utc_datetime((readiness or {}).get("last_evaluated_at")),
            *(self._as_utc_datetime(alert.last_seen_at or alert.first_seen_at) for alert in alerts_open),
            *(self._as_utc_datetime(ticket.updated_at or ticket.created_at) for ticket in maintenance_open),
            *(self._as_utc_datetime(item.get("occurred_at")) for item in recent_events),
            *(self._as_utc_datetime(execution.finished_at or execution.started_at) for execution in automation_failures),
        ]
        last_updated_at = max([ts for ts in last_updated_candidates if ts is not None], default=datetime.now(timezone.utc))

        return {
            "assistant_type": assistant_type,
            "booking": {
                "id": booking.id,
                "guest_name": booking.guest_name,
                "checkin_date": booking.checkin_date,
                "checkout_date": booking.checkout_date,
                "estimated_arrival_time": booking.estimated_arrival_time,
                "source": booking.source,
                "unit_id": booking.unit_id,
                "unit_name": booking.unit.name if booking.unit is not None else f"Unita {booking.unit_id}",
                "property_id": booking.unit.property_id if booking.unit is not None else None,
                "property_name": property_name,
            },
            "assistant_status": assistant_status,
            "readiness_status": readiness_status,
            "readiness_score": readiness_score,
            "assistant_summary": self._assistant_summary(
                assistant_type,
                assistant_status,
                blocking_reasons,
                warning_reasons,
                active_devices,
            ),
            "blocking_reasons": blocking_reasons,
            "warning_reasons": warning_reasons,
            "essential_devices": essential_devices,
            "devices_still_active": active_devices,
            "open_alerts": [
                {
                    "alert_id": alert.id,
                    "title": alert.title,
                    "alert_type": alert.alert_type,
                    "severity": alert.severity,
                    "status": alert.status,
                    "last_seen_at": self._as_utc_datetime(alert.last_seen_at),
                    "device_id": alert.device_id,
                }
                for alert in alerts_open[:6]
            ],
            "maintenance_issues": [
                {
                    "maintenance_id": ticket.id,
                    "title": ticket.title,
                    "status": ticket.status,
                    "priority": ticket.priority,
                    "blocking": self._is_blocking_maintenance(ticket),
                    "updated_at": self._as_utc_datetime(ticket.updated_at or ticket.created_at),
                }
                for ticket in maintenance_open[:6]
            ],
            "staff_tasks": [
                {
                    "task_id": task.id,
                    "task_type": task.task_type,
                    "status": task.status,
                    "date": task.date,
                    "time": task.time,
                    "assignee_name": task.assignee_name,
                    "booking_id": task.booking_id,
                    "notes": task.notes,
                }
                for task in relevant_tasks[:8]
            ],
            "recent_events": recent_events[:6],
            "automation_failures": [
                {
                    "execution_id": execution.id,
                    "status": execution.status,
                    "trigger_type": execution.trigger_type,
                    "started_at": self._as_utc_datetime(execution.started_at),
                    "finished_at": self._as_utc_datetime(execution.finished_at),
                    "scene_id": execution.scene_id,
                    "rule_id": execution.rule_id,
                    "error_message": execution.error_message,
                }
                for execution in automation_failures[:5]
            ],
            "quick_actions": self._assistant_quick_actions(
                assistant_type=assistant_type,
                booking=booking,
                scene=scene,
                alerts_open=alerts_open,
                maintenance_open=maintenance_open,
                staff_tasks=relevant_tasks,
            ),
            "last_updated_at": last_updated_at,
            "data_freshness_status": self._compute_data_freshness(last_updated_at),
        }

    def _list_assistant(
        self,
        *,
        assistant_type: str,
        property_id: int | None = None,
        unit_id: int | None = None,
        status: str | None = None,
        date_from: date | None = None,
        date_to: date | None = None,
    ) -> list[dict[str, object]]:
        normalized_status = self._normalize_readiness_status(status)
        bookings, effective_from, effective_to = self._assistant_bookings_query(
            assistant_type=assistant_type,
            property_id=property_id,
            unit_id=unit_id,
            date_from=date_from,
            date_to=date_to,
        )
        if not bookings:
            return []

        unit_ids = {int(booking.unit_id) for booking in bookings}
        units = self.db.query(Unit).filter(Unit.id.in_(list(unit_ids))).all()
        units_by_id = {unit.id: unit for unit in units}
        property_ids = {unit.property_id for unit in units if unit.property_id is not None}
        properties_by_id: dict[int, Property] = {}
        if property_ids:
            properties_by_id = {
                prop.id: prop
                for prop in self._scoped_query(Property).filter(Property.id.in_(list(property_ids))).all()
            }
        readiness_rows = self.list_unit_readiness(property_id=property_id, unit_id=unit_id)
        readiness_by_unit = {int(row["unit_id"]): row for row in readiness_rows}

        health = self.get_device_health_overview(property_id=property_id, unit_id=unit_id)
        health_by_unit: dict[int, list[dict[str, object]]] = {}
        for record in health.get("devices", []):
            mapped_unit_id = record.get("unit_id")
            if mapped_unit_id is None:
                continue
            health_by_unit.setdefault(int(mapped_unit_id), []).append(record)

        devices = (
            self._scoped_query(Device)
            .filter(Device.unit_id.in_(list(unit_ids)))
            .order_by(Device.unit_id.asc(), Device.id.asc())
            .all()
        )
        device_map = {device.id: device for device in devices}
        states = []
        if device_map:
            states = (
                self._scoped_query(DeviceState)
                .filter(DeviceState.device_id.in_(list(device_map.keys())))
                .all()
            )
        state_by_device_id = {state.device_id: state for state in states}

        alerts = (
            self._scoped_query(Alert)
            .filter(Alert.status == "open", Alert.unit_id.in_(list(unit_ids)))
            .order_by(Alert.last_seen_at.desc(), Alert.id.desc())
            .all()
        )
        alerts_by_unit: dict[int, list[Alert]] = {}
        for alert in alerts:
            if alert.unit_id is None:
                continue
            alerts_by_unit.setdefault(int(alert.unit_id), []).append(alert)

        maintenance = (
            self.db.query(MaintenanceTicket)
            .filter(
                MaintenanceTicket.status != "done",
                MaintenanceTicket.unit_id.in_(list(unit_ids)),
            )
            .order_by(MaintenanceTicket.updated_at.desc(), MaintenanceTicket.id.desc())
            .all()
        )
        maintenance_by_unit: dict[int, list[MaintenanceTicket]] = {}
        for ticket in maintenance:
            if ticket.unit_id is None:
                continue
            maintenance_by_unit.setdefault(int(ticket.unit_id), []).append(ticket)

        task_types = self._assistant_relevant_task_types(assistant_type)
        task_window_start = effective_from - timedelta(days=1)
        task_window_end = effective_to + timedelta(days=1)
        tasks = (
            self.db.query(StaffTask)
            .filter(
                StaffTask.unit_id.in_(list(unit_ids)),
                StaffTask.date >= task_window_start,
                StaffTask.date <= task_window_end,
                StaffTask.task_type.in_(list(task_types)),
            )
            .order_by(StaffTask.date.asc(), StaffTask.id.asc())
            .all()
        )
        tasks_by_unit: dict[int, list[StaffTask]] = {}
        tasks_by_booking: dict[int, list[StaffTask]] = {}
        for task in tasks:
            if task.unit_id is not None:
                tasks_by_unit.setdefault(int(task.unit_id), []).append(task)
            if task.booking_id is not None:
                tasks_by_booking.setdefault(int(task.booking_id), []).append(task)

        failures_by_unit = self._assistant_recent_failures_by_unit(unit_ids)
        timeline_cache: dict[int, list[dict[str, object]]] = {}
        scene_cache: dict[tuple[str, int], Scene | None] = {}

        items: list[dict[str, object]] = []
        for booking in bookings:
            unit_id_value = int(booking.unit_id)
            booking_tasks = tasks_by_booking.get(booking.id)
            relevant_tasks = booking_tasks if booking_tasks else tasks_by_unit.get(unit_id_value, [])
            if unit_id_value not in timeline_cache:
                timeline_cache[unit_id_value] = self._assistant_recent_timeline(unit_id_value)
            scene_key = (assistant_type, unit_id_value)
            if scene_key not in scene_cache:
                scene_cache[scene_key] = self._find_scene_for_assistant(assistant_type, unit_id_value)
            unit_obj = units_by_id.get(unit_id_value)
            property_name = None
            if unit_obj is not None and unit_obj.property_id is not None:
                property_obj = properties_by_id.get(int(unit_obj.property_id))
                property_name = property_obj.name if property_obj is not None else None
            item = self._build_assistant_item(
                assistant_type=assistant_type,
                booking=booking,
                readiness=readiness_by_unit.get(unit_id_value),
                property_name=property_name,
                unit_device_health=health_by_unit.get(unit_id_value, []),
                device_map=device_map,
                state_by_device_id=state_by_device_id,
                alerts_open=alerts_by_unit.get(unit_id_value, []),
                maintenance_open=maintenance_by_unit.get(unit_id_value, []),
                relevant_tasks=relevant_tasks,
                automation_failures=failures_by_unit.get(unit_id_value, []),
                recent_events=timeline_cache[unit_id_value],
                scene=scene_cache[scene_key],
            )
            if item is None:
                continue
            if normalized_status and item["assistant_status"] != normalized_status:
                continue
            items.append(item)
        return items

    def list_checkin_assistant(
        self,
        *,
        property_id: int | None = None,
        unit_id: int | None = None,
        status: str | None = None,
        date_from: date | None = None,
        date_to: date | None = None,
    ) -> list[dict[str, object]]:
        return self._list_assistant(
            assistant_type="checkin",
            property_id=property_id,
            unit_id=unit_id,
            status=status,
            date_from=date_from,
            date_to=date_to,
        )

    def get_checkin_assistant_booking(self, booking_id: int) -> dict[str, object]:
        booking = self.db.query(Booking).filter(Booking.id == booking_id).first()
        if booking is None:
            raise HTTPException(status_code=404, detail="Prenotazione non trovata")
        self._ensure_unit_visible(int(booking.unit_id))
        items = self._list_assistant(
            assistant_type="checkin",
            unit_id=booking.unit_id,
            date_from=booking.checkin_date,
            date_to=booking.checkin_date,
        )
        for item in items:
            if int(item["booking"]["id"]) == booking_id:
                return item
        raise HTTPException(status_code=404, detail="Assistant check-in non disponibile")

    def list_checkout_assistant(
        self,
        *,
        property_id: int | None = None,
        unit_id: int | None = None,
        status: str | None = None,
        date_from: date | None = None,
        date_to: date | None = None,
    ) -> list[dict[str, object]]:
        return self._list_assistant(
            assistant_type="checkout",
            property_id=property_id,
            unit_id=unit_id,
            status=status,
            date_from=date_from,
            date_to=date_to,
        )

    def get_checkout_assistant_booking(self, booking_id: int) -> dict[str, object]:
        booking = self.db.query(Booking).filter(Booking.id == booking_id).first()
        if booking is None:
            raise HTTPException(status_code=404, detail="Prenotazione non trovata")
        self._ensure_unit_visible(int(booking.unit_id))
        items = self._list_assistant(
            assistant_type="checkout",
            unit_id=booking.unit_id,
            date_from=booking.checkout_date,
            date_to=booking.checkout_date,
        )
        for item in items:
            if int(item["booking"]["id"]) == booking_id:
                return item
        raise HTTPException(status_code=404, detail="Assistant checkout non disponibile")
