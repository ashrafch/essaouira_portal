from __future__ import annotations

import json
import hashlib
import uuid
from datetime import date, datetime, time, timedelta, timezone

from fastapi import HTTPException
from sqlalchemy import and_, func, or_
from sqlalchemy.orm import Session

from app.domains.smart_building.providers.factory import get_provider
from app.domains.smart_building.providers.base import ProviderCommandRequest
from app.domains.smart_building.taxonomy import (
    CANONICAL_COMMAND_TYPES,
    CANONICAL_RULE_ACTION_TYPES,
    CANONICAL_RULE_TRIGGER_TYPES,
    CANONICAL_SCENE_ACTION_TYPES,
    is_automatic_trigger_source,
    normalize_alert_type,
    normalize_command_type,
    normalize_event_type,
    normalize_rule_action_type,
    normalize_rule_trigger_type,
    normalize_scene_action_type,
    normalize_trigger_source,
)
from app.domains.smart_building.schemas import (
    AlertCreate,
    AutomationRuleCreate,
    AutomationRuleUpdate,
    DeviceCommandCreate,
    DeviceCreate,
    DeviceEventCreate,
    DeviceStateUpdate,
    DeviceUpdate,
    RuleTriggerRequest,
    SceneActionCreate,
    SceneActionUpdate,
    SceneCreate,
    SceneUpdate,
)
from app.models.booking import Booking
from app.models.maintenance import MaintenanceTicket
from app.models.staff_task import StaffTask
from app.models.unit import Unit
from app.models.smart_building import (
    Alert,
    AutomationExecution,
    AutomationRule,
    Device,
    DeviceCommand,
    DeviceEvent,
    DeviceState,
    Scene,
    SceneAction,
)


SUPPORTED_COMMAND_STATUSES = {"pending", "accepted", "executed", "failed", "expired"}
POWER_CATEGORIES = {"smart_relay", "smart_light", "smart_plug", "relay", "light"}
CLIMATE_CATEGORIES = {"climate_controller", "thermostat", "hvac_controller"}
LOCK_CATEGORIES = {"smart_lock", "lock_controller"}
AUTOMATION_EXECUTION_STATUSES = {"running", "executed", "failed", "partial"}
AUTOMATION_DEDUP_WINDOW = timedelta(minutes=5)


class SmartBuildingService:
    def __init__(self, db: Session, tenant_id: str, role: str = "owner"):
        self.db = db
        self.tenant_id = tenant_id
        self.role = (role or "owner").strip().lower()

    def _scoped_query(self, model):
        return self.db.query(model).filter(model.tenant_id == self.tenant_id)

    def _require_write_access(self) -> None:
        if self.role in {"operator", "viewer"}:
            raise HTTPException(status_code=403, detail="Permesso insufficiente per modifiche smart")

    def _ensure_unit_visible(self, unit_id: int) -> Unit:
        unit = self.db.query(Unit).filter(Unit.id == unit_id).first()
        if unit is None:
            raise HTTPException(status_code=404, detail="Unita non trovata")
        if self.tenant_id != "default":
            has_device_binding = (
                self._scoped_query(Device).filter(Device.unit_id == unit_id).first()
            )
            if has_device_binding is None:
                raise HTTPException(status_code=404, detail="Unita non trovata")
        return unit

    def list_devices(self) -> list[Device]:
        return self._scoped_query(Device).order_by(Device.id.asc()).all()

    def _safe_json_dumps(self, value: dict | None) -> str | None:
        if value is None:
            return None
        return json.dumps(value, ensure_ascii=True, sort_keys=True)

    def _safe_json_loads(self, value: str | None) -> dict:
        if not value:
            return {}
        try:
            parsed = json.loads(value)
        except json.JSONDecodeError:
            return {}
        return parsed if isinstance(parsed, dict) else {}

    def _validate_scene_action_type(self, action_type: str) -> str:
        try:
            normalized = normalize_scene_action_type(action_type)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail="Tipo azione scena non supportato") from exc
        if normalized not in CANONICAL_SCENE_ACTION_TYPES:
            raise HTTPException(status_code=400, detail="Tipo azione scena non supportato")
        return normalized

    def _validate_rule_trigger_type(self, trigger_type: str) -> str:
        try:
            normalized = normalize_rule_trigger_type(trigger_type)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail="Tipo trigger regola non supportato") from exc
        if normalized not in CANONICAL_RULE_TRIGGER_TYPES:
            raise HTTPException(status_code=400, detail="Tipo trigger regola non supportato")
        return normalized

    def _validate_rule_action_type(self, action_type: str) -> str:
        try:
            normalized = normalize_rule_action_type(action_type)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail="Tipo azione regola non supportato") from exc
        if normalized not in CANONICAL_RULE_ACTION_TYPES:
            raise HTTPException(status_code=400, detail="Tipo azione regola non supportato")
        return normalized

    def _validate_target_unit(self, target_unit_id: int | None) -> int | None:
        if target_unit_id is None:
            return None
        exists = self.db.query(Unit).filter(Unit.id == target_unit_id).first()
        if exists is None:
            raise HTTPException(status_code=400, detail="Unita target non trovata")
        return target_unit_id

    def _as_utc_datetime(self, value: datetime | None) -> datetime | None:
        if value is None:
            return None
        if value.tzinfo is None:
            return value.replace(tzinfo=timezone.utc)
        return value.astimezone(timezone.utc)

    def _combine_date_time(self, day: date | None, at: time | None = None) -> datetime | None:
        if day is None:
            return None
        base = datetime.combine(day, at or time(hour=0, minute=0, second=0))
        return base.replace(tzinfo=timezone.utc)

    def get_unit_smart_detail(self, unit_id: int, events_limit: int = 50) -> dict[str, object]:
        unit = self._ensure_unit_visible(unit_id)

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
        for device in devices:
            device_state = state_by_device.get(device.id)
            online = device_state.online if device_state else None
            if online is True:
                online_devices += 1
            elif online is False:
                offline_devices += 1

        total_devices = len(devices)
        unknown_state_devices = max(total_devices - online_devices - offline_devices, 0)

        return {
            "unit": unit,
            "summary": {
                "total_devices": total_devices,
                "online_devices": online_devices,
                "offline_devices": offline_devices,
                "unknown_state_devices": unknown_state_devices,
                "open_alerts": len(open_alerts),
                "resolved_alerts": len(resolved_alerts),
            },
            "devices": devices,
            "states": states,
            "alerts_open": open_alerts,
            "alerts_resolved": resolved_alerts,
            "events_recent": events,
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

    def provider_debug(self, provider_name: str | None = None) -> dict[str, object]:
        provider = get_provider(provider_name)
        return {
            "provider_name": provider.provider_name,
            "supports_catalog_sync": bool(getattr(provider, "supports_catalog_sync", False)),
            "supports_webhook_ingest": bool(getattr(provider, "supports_webhook_ingest", False)),
            "supports_command_execution": bool(getattr(provider, "supports_command_execution", False)),
        }

    def get_device_or_404(self, device_id: int) -> Device:
        device = self._scoped_query(Device).filter(Device.id == device_id).first()
        if device is None:
            raise HTTPException(status_code=404, detail="Device non trovato")
        return device

    def get_device_by_provider_external(self, provider: str, external_id: str) -> Device | None:
        return (
            self._scoped_query(Device)
            .filter(Device.provider == provider, Device.external_id == external_id)
            .first()
        )

    def get_device_command_or_404(self, device_id: int, command_id: int) -> DeviceCommand:
        self.get_device_or_404(device_id)
        command = (
            self._scoped_query(DeviceCommand)
            .filter(DeviceCommand.id == command_id, DeviceCommand.device_id == device_id)
            .first()
        )
        if command is None:
            raise HTTPException(status_code=404, detail="Comando device non trovato")
        return command

    def _allowed_commands_for_category(self, category: str) -> set[str]:
        normalized = (category or "").strip().lower()
        if normalized in POWER_CATEGORIES:
            return {"device.power.on", "device.power.off"}
        if normalized in CLIMATE_CATEGORIES:
            return {"device.climate.set_mode", "device.climate.set_setpoint"}
        if normalized in LOCK_CATEGORIES:
            return {"device.lock.set_state"}
        return set()

    def _validate_command_payload(self, command_type: str, payload: dict) -> dict:
        if command_type in {"device.power.on", "device.power.off"}:
            return {}
        if command_type == "device.climate.set_mode":
            mode = str((payload or {}).get("mode", "")).strip().lower()
            if mode not in {"off", "heat", "cool", "eco", "auto"}:
                raise HTTPException(status_code=400, detail="device.climate.set_mode richiede mode valido")
            return {"mode": mode}
        if command_type == "device.climate.set_setpoint":
            try:
                setpoint_c = float((payload or {}).get("setpoint_c"))
            except (TypeError, ValueError):
                raise HTTPException(
                    status_code=400,
                    detail="device.climate.set_setpoint richiede setpoint_c numerico",
                )
            return {"setpoint_c": round(setpoint_c, 2)}
        if command_type == "device.lock.set_state":
            target = str((payload or {}).get("target", "")).strip().lower()
            if target not in {"lock", "unlock"}:
                raise HTTPException(
                    status_code=400,
                    detail="device.lock.set_state richiede target lock|unlock",
                )
            return {"target": target}
        raise HTTPException(status_code=400, detail="Tipo comando non supportato")

    def _resolve_unit_id_from_hint(self, unit_hint: str | None) -> int | None:
        if not unit_hint:
            return None
        normalized = unit_hint.strip().lower()
        if not normalized:
            return None
        unit = (
            self.db.query(Unit)
            .filter(func.lower(Unit.name).like(f"%{normalized}%"))
            .order_by(Unit.id.asc())
            .first()
        )
        return unit.id if unit else None

    def create_device(self, payload: DeviceCreate) -> Device:
        self._require_write_access()
        existing = (
            self._scoped_query(Device)
            .filter(
                Device.provider == payload.provider,
                Device.external_id == payload.external_id,
            )
            .first()
        )
        if existing:
            raise HTTPException(status_code=400, detail="Device gia presente per provider/external_id")
        device = Device(tenant_id=self.tenant_id, **payload.model_dump())
        self.db.add(device)
        self.db.commit()
        self.db.refresh(device)
        return device

    def update_device(self, device_id: int, payload: DeviceUpdate) -> Device:
        self._require_write_access()
        device = self.get_device_or_404(device_id)
        for key, value in payload.model_dump(exclude_unset=True).items():
            setattr(device, key, value)
        self.db.commit()
        self.db.refresh(device)
        return device

    def get_device_state(self, device_id: int) -> DeviceState:
        self.get_device_or_404(device_id)
        state = self._scoped_query(DeviceState).filter(DeviceState.device_id == device_id).first()
        if state is None:
            raise HTTPException(status_code=404, detail="Device state non trovato")
        return state

    def upsert_device_state(self, device_id: int, payload: DeviceStateUpdate) -> DeviceState:
        self._require_write_access()
        device = self.get_device_or_404(device_id)
        state = self._scoped_query(DeviceState).filter(DeviceState.device_id == device_id).first()
        values = payload.model_dump()
        if state is None:
            state = DeviceState(tenant_id=self.tenant_id, device_id=device_id, **values)
            self.db.add(state)
        else:
            for key, value in values.items():
                setattr(state, key, value)
        device.last_seen_at = datetime.now(timezone.utc) if payload.online else device.last_seen_at
        self.db.commit()
        self.db.refresh(state)
        return state

    def _state_payload_from_provider_snapshot(self, snapshot) -> DeviceStateUpdate:
        return DeviceStateUpdate(
            online=snapshot.online,
            power_state=snapshot.power_state,
            motion_detected=snapshot.motion_detected,
            contact_open=snapshot.contact_open,
            leak_detected=snapshot.leak_detected,
            temperature_c=snapshot.temperature_c,
            humidity_pct=snapshot.humidity_pct,
            energy_w=snapshot.energy_w,
            signal_rssi=snapshot.signal_rssi,
            raw_payload_json=self._safe_json_dumps(snapshot.raw_payload or {}),
        )

    def _state_changed(self, device_id: int, payload: DeviceStateUpdate) -> bool:
        state = self._scoped_query(DeviceState).filter(DeviceState.device_id == device_id).first()
        if state is None:
            return True
        new_values = payload.model_dump()
        current_values = {
            "online": state.online,
            "power_state": state.power_state,
            "motion_detected": state.motion_detected,
            "contact_open": state.contact_open,
            "leak_detected": state.leak_detected,
            "temperature_c": state.temperature_c,
            "humidity_pct": state.humidity_pct,
            "energy_w": state.energy_w,
            "signal_rssi": state.signal_rssi,
            "raw_payload_json": state.raw_payload_json,
        }
        return current_values != new_values

    def sync_catalog_from_provider(self, provider_name: str | None = None) -> dict[str, int | str]:
        self._require_write_access()
        provider = get_provider(provider_name)
        if not getattr(provider, "supports_catalog_sync", False):
            raise HTTPException(status_code=400, detail="Provider does not support catalog sync")

        imported_devices = 0
        updated_devices = 0
        synced_states = 0

        try:
            snapshots = provider.list_devices(self.tenant_id)
        except Exception as exc:
            raise HTTPException(status_code=502, detail=f"Provider sync failed: {exc}") from exc

        for snapshot in snapshots:
            device = self.get_device_by_provider_external(provider.provider_name, snapshot.external_id)
            if device is None:
                device = Device(
                    tenant_id=self.tenant_id,
                    provider=provider.provider_name,
                    external_id=snapshot.external_id,
                    name=snapshot.name,
                    category=snapshot.category,
                    model=snapshot.model,
                    manufacturer=snapshot.manufacturer,
                    zone_name=snapshot.zone_name,
                    unit_id=self._resolve_unit_id_from_hint(snapshot.unit_hint),
                    is_active=snapshot.is_active,
                    health_status=snapshot.health_status,
                    battery_level=snapshot.battery_level,
                )
                self.db.add(device)
                self.db.flush()
                imported_devices += 1
            else:
                device.name = snapshot.name
                device.category = snapshot.category
                device.model = snapshot.model
                device.manufacturer = snapshot.manufacturer
                device.zone_name = snapshot.zone_name
                if snapshot.unit_hint:
                    resolved_unit_id = self._resolve_unit_id_from_hint(snapshot.unit_hint)
                    if resolved_unit_id is not None:
                        device.unit_id = resolved_unit_id
                device.is_active = snapshot.is_active
                device.health_status = snapshot.health_status
                if snapshot.battery_level is not None:
                    device.battery_level = snapshot.battery_level
                updated_devices += 1

            if snapshot.state is not None:
                state_payload = self._state_payload_from_provider_snapshot(snapshot.state)
                changed = self._state_changed(device.id, state_payload)
                self.upsert_device_state(device.id, state_payload)
                if changed:
                    self.create_device_event(
                        device_id=device.id,
                        payload=DeviceEventCreate(
                            event_type="provider.sync",
                            severity="info",
                            source=provider.provider_name,
                            payload_json=self._safe_json_dumps(
                                {
                                    "external_id": snapshot.external_id,
                                    "mode": "catalog_sync",
                                }
                            ),
                        ),
                    )
                synced_states += 1

            self.create_device_event(
                device_id=device.id,
                payload=DeviceEventCreate(
                    event_type="provider.catalog.synced",
                    severity="info",
                    source=provider.provider_name,
                    payload_json=json.dumps(
                        {
                            "external_id": snapshot.external_id,
                            "unit_hint": snapshot.unit_hint,
                        },
                        ensure_ascii=True,
                    ),
                ),
            )

        return {
            "provider_name": provider.provider_name,
            "imported_devices": imported_devices,
            "updated_devices": updated_devices,
            "synced_states": synced_states,
        }

    def ingest_provider_webhook(
        self, provider_name: str, payload: dict, username: str | None = None
    ) -> dict[str, object]:
        self._require_write_access()
        provider = get_provider(provider_name)
        if not getattr(provider, "supports_webhook_ingest", False):
            return {
                "provider_name": provider.provider_name,
                "accepted": False,
                "reason": "provider does not support webhook ingest",
                "event_id": None,
            }

        try:
            parsed = provider.parse_webhook(payload)
        except NotImplementedError:
            return {
                "provider_name": provider.provider_name,
                "accepted": False,
                "reason": "provider webhook parsing not implemented",
                "event_id": None,
            }

        if parsed is None:
            return {
                "provider_name": provider.provider_name,
                "accepted": False,
                "reason": "invalid payload",
                "event_id": None,
            }

        device = self.get_device_by_provider_external(provider.provider_name, parsed.external_id)
        if device is None:
            return {
                "provider_name": provider.provider_name,
                "accepted": False,
                "reason": "device not found for external_id",
                "event_id": None,
            }

        if parsed.state is not None:
            state_payload = self._state_payload_from_provider_snapshot(parsed.state)
            changed = self._state_changed(device.id, state_payload)
            self.upsert_device_state(device.id, state_payload)
            if changed:
                self.create_device_event(
                    device_id=device.id,
                    payload=DeviceEventCreate(
                        event_type="provider.sync",
                        severity="info",
                        source=provider.provider_name,
                        payload_json=self._safe_json_dumps(
                            {
                                "external_id": parsed.external_id,
                                "mode": "webhook_state_changed",
                            }
                        ),
                    ),
                )

        event = self.create_device_event(
            device_id=device.id,
            payload=DeviceEventCreate(
                event_type=parsed.event_type,
                severity=parsed.severity,
                source=provider.provider_name,
                payload_json=json.dumps(
                    {
                        "payload": parsed.payload or {},
                        "ingested_by": username or "system",
                    },
                    ensure_ascii=True,
                ),
            ),
        )
        return {
            "provider_name": provider.provider_name,
            "accepted": True,
            "reason": None,
            "event_id": event.id,
        }

    def poll_provider_states(self, provider_name: str | None = None) -> dict[str, int | str]:
        self._require_write_access()
        provider = get_provider(provider_name)
        devices = (
            self._scoped_query(Device)
            .filter(Device.provider == provider.provider_name)
            .order_by(Device.id.asc())
            .all()
        )
        polled_devices = 0
        updated_states = 0
        events_emitted = 0
        errors = 0

        for device in devices:
            polled_devices += 1
            try:
                snapshot = provider.pull_state(device.external_id)
            except Exception:
                errors += 1
                continue

            state_payload = self._state_payload_from_provider_snapshot(snapshot)
            changed = self._state_changed(device.id, state_payload)
            self.upsert_device_state(device.id, state_payload)
            updated_states += 1
            if changed:
                self.create_device_event(
                    device_id=device.id,
                    payload=DeviceEventCreate(
                        event_type="provider.sync",
                        severity="info",
                        source=provider.provider_name,
                        payload_json=self._safe_json_dumps(
                            {"external_id": device.external_id, "mode": "poll"}
                        ),
                    ),
                )
                events_emitted += 1

        return {
            "provider_name": provider.provider_name,
            "polled_devices": polled_devices,
            "updated_states": updated_states,
            "events_emitted": events_emitted,
            "errors": errors,
        }

    def create_device_event(self, device_id: int, payload: DeviceEventCreate) -> DeviceEvent:
        self._require_write_access()
        device = self.get_device_or_404(device_id)
        event_type = normalize_event_type(payload.event_type)
        event = DeviceEvent(
            tenant_id=self.tenant_id,
            device_id=device_id,
            unit_id=device.unit_id,
            event_type=event_type,
            severity=payload.severity,
            source=payload.source,
            payload_json=payload.payload_json,
        )
        self.db.add(event)
        self.db.commit()
        self.db.refresh(event)
        return event

    def list_device_events(self, device_id: int | None = None, limit: int = 100) -> list[DeviceEvent]:
        query = self._scoped_query(DeviceEvent).order_by(DeviceEvent.occurred_at.desc())
        if device_id is not None:
            query = query.filter(DeviceEvent.device_id == device_id)
        return query.limit(max(1, min(limit, 500))).all()

    def list_alerts(self, status: str | None = None) -> list[Alert]:
        query = self._scoped_query(Alert).order_by(Alert.last_seen_at.desc())
        if status:
            query = query.filter(Alert.status == status)
        return query.all()

    def list_device_commands(
        self, device_id: int, status: str | None = None, limit: int = 50
    ) -> list[DeviceCommand]:
        self.get_device_or_404(device_id)
        query = self._scoped_query(DeviceCommand).filter(DeviceCommand.device_id == device_id)
        if status:
            normalized = status.strip().lower()
            if normalized not in SUPPORTED_COMMAND_STATUSES:
                raise HTTPException(status_code=400, detail="Status comando non valido")
            query = query.filter(DeviceCommand.status == normalized)
        query = query.order_by(DeviceCommand.requested_at.desc(), DeviceCommand.id.desc())
        return query.limit(max(1, min(limit, 200))).all()

    def create_device_command(
        self,
        device_id: int,
        payload: DeviceCommandCreate,
        requested_by: str | None = None,
        correlation_id: str | None = None,
    ) -> DeviceCommand:
        self._require_write_access()
        device = self.get_device_or_404(device_id)
        try:
            command_type = normalize_command_type(payload.command_type)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail="Tipo comando non supportato") from exc
        if command_type not in CANONICAL_COMMAND_TYPES:
            raise HTTPException(status_code=400, detail="Tipo comando non supportato")
        allowed = self._allowed_commands_for_category(device.category)
        if command_type not in allowed:
            raise HTTPException(
                status_code=400,
                detail=f"Comando '{command_type}' non supportato per categoria '{device.category}'",
            )

        normalized_payload = self._validate_command_payload(command_type, payload.payload or {})
        now = datetime.now(timezone.utc)
        expires_at = now + timedelta(seconds=payload.ttl_seconds or 300)
        command = DeviceCommand(
            tenant_id=self.tenant_id,
            device_id=device.id,
            unit_id=device.unit_id,
            provider=device.provider,
            command_type=command_type,
            payload_json=json.dumps(normalized_payload, ensure_ascii=True),
            correlation_id=correlation_id,
            status="pending",
            requested_by=requested_by or "system",
            requested_at=now,
            expires_at=expires_at,
        )
        self.db.add(command)
        self.db.commit()
        self.db.refresh(command)

        self.create_device_event(
            device_id=device.id,
            payload=DeviceEventCreate(
                event_type="device.command.requested",
                severity="info",
                source="api",
                payload_json=json.dumps(
                    {
                        "command_id": command.id,
                        "command_type": command.command_type,
                        "requested_by": command.requested_by,
                        "correlation_id": correlation_id,
                    },
                    ensure_ascii=True,
                ),
            ),
        )

        provider = get_provider(device.provider)
        if not getattr(provider, "supports_command_execution", False):
            command.status = "failed"
            command.failed_at = datetime.now(timezone.utc)
            command.error_message = "Provider command execution not supported"
            self.db.commit()
            self.db.refresh(command)
            self.create_device_event(
                device_id=device.id,
                payload=DeviceEventCreate(
                    event_type="device.command.failed",
                    severity="warning",
                    source=device.provider,
                    payload_json=json.dumps(
                        {
                            "command_id": command.id,
                            "reason": command.error_message,
                            "correlation_id": correlation_id,
                        },
                        ensure_ascii=True,
                    ),
                ),
            )
            return command

        result = provider.execute_command(
            ProviderCommandRequest(
                external_id=device.external_id,
                command_type=command.command_type,
                payload=normalized_payload,
                requested_by=command.requested_by,
                tenant_id=self.tenant_id,
            )
        )
        lifecycle_status = (result.lifecycle_status or "").strip().lower()
        if lifecycle_status not in SUPPORTED_COMMAND_STATUSES:
            lifecycle_status = "failed"

        command.status = lifecycle_status
        command.provider_ref = result.provider_ref
        command.result_json = (
            json.dumps(result.result_payload, ensure_ascii=True) if result.result_payload is not None else None
        )
        command.error_message = result.error_message

        transition_time = datetime.now(timezone.utc)
        if result.accepted:
            command.accepted_at = transition_time
        if lifecycle_status == "executed":
            command.executed_at = transition_time
        elif lifecycle_status == "failed":
            command.failed_at = transition_time
        elif lifecycle_status == "expired":
            command.expired_at = transition_time

        if lifecycle_status in {"accepted", "pending"} and command.expires_at and command.expires_at <= transition_time:
            command.status = "expired"
            command.expired_at = transition_time

        self.db.commit()
        self.db.refresh(command)

        outcome_event_type = (
            "device.command.executed"
            if command.status == "executed"
            else "device.command.failed"
            if command.status == "failed"
            else "device.command.expired"
            if command.status == "expired"
            else "device.command.accepted"
        )
        outcome_severity = "warning" if command.status in {"failed", "expired"} else "info"
        self.create_device_event(
            device_id=device.id,
            payload=DeviceEventCreate(
                event_type=outcome_event_type,
                severity=outcome_severity,
                source=device.provider,
                payload_json=json.dumps(
                    {
                        "command_id": command.id,
                        "status": command.status,
                        "provider_ref": command.provider_ref,
                        "error": command.error_message,
                        "correlation_id": correlation_id,
                    },
                    ensure_ascii=True,
                ),
            ),
        )
        return command

    def create_alert(
        self,
        payload: AlertCreate,
        correlation_id: str | None = None,
        *,
        trigger_rules: bool = True,
        trigger_source: str = "api.smart",
        requested_by: str | None = None,
    ) -> Alert:
        self._require_write_access()
        if payload.device_id is not None:
            self.get_device_or_404(payload.device_id)
        normalized_alert_type = normalize_alert_type(payload.alert_type)
        alert = Alert(
            tenant_id=self.tenant_id,
            unit_id=payload.unit_id,
            device_id=payload.device_id,
            alert_type=normalized_alert_type,
            severity=payload.severity,
            title=payload.title,
            description=payload.description,
            correlation_id=correlation_id,
            status="open",
        )
        self.db.add(alert)
        self.db.commit()
        self.db.refresh(alert)
        if trigger_rules:
            self.trigger_rules_for_business_event(
                trigger_type="alert.raised",
                trigger_source=trigger_source,
                context={
                    "alert_id": alert.id,
                    "unit_id": alert.unit_id,
                    "device_id": alert.device_id,
                    "alert_type": alert.alert_type,
                },
                requested_by=requested_by,
                correlation_id=correlation_id,
            )
        return alert

    def acknowledge_alert(self, alert_id: int, username: str) -> Alert:
        self._require_write_access()
        alert = self._scoped_query(Alert).filter(Alert.id == alert_id).first()
        if alert is None:
            raise HTTPException(status_code=404, detail="Alert non trovato")
        alert.status = "acknowledged"
        alert.acknowledged_by = username
        alert.last_seen_at = datetime.now(timezone.utc)
        self.db.commit()
        self.db.refresh(alert)
        return alert

    def list_scenes(self) -> list[Scene]:
        return self._scoped_query(Scene).order_by(Scene.name.asc(), Scene.id.asc()).all()

    def get_scene_or_404(self, scene_id: int) -> Scene:
        scene = self._scoped_query(Scene).filter(Scene.id == scene_id).first()
        if scene is None:
            raise HTTPException(status_code=404, detail="Scena non trovata")
        return scene

    def create_scene(self, payload: SceneCreate) -> Scene:
        self._require_write_access()
        scene = Scene(
            tenant_id=self.tenant_id,
            name=payload.name.strip(),
            description=payload.description,
            is_active=payload.is_active,
        )
        self.db.add(scene)
        self.db.commit()
        self.db.refresh(scene)
        return scene

    def update_scene(self, scene_id: int, payload: SceneUpdate) -> Scene:
        self._require_write_access()
        scene = self.get_scene_or_404(scene_id)
        for key, value in payload.model_dump(exclude_unset=True).items():
            if key == "name" and value is not None:
                setattr(scene, key, value.strip())
            else:
                setattr(scene, key, value)
        self.db.commit()
        self.db.refresh(scene)
        return scene

    def list_scene_actions(self, scene_id: int) -> list[SceneAction]:
        self.get_scene_or_404(scene_id)
        return (
            self._scoped_query(SceneAction)
            .filter(SceneAction.scene_id == scene_id)
            .order_by(SceneAction.position.asc(), SceneAction.id.asc())
            .all()
        )

    def create_scene_action(self, scene_id: int, payload: SceneActionCreate) -> SceneAction:
        self._require_write_access()
        scene = self.get_scene_or_404(scene_id)
        action_type = self._validate_scene_action_type(payload.action_type)
        target_device_id = payload.target_device_id
        if target_device_id is not None:
            self.get_device_or_404(target_device_id)
        target_unit_id = self._validate_target_unit(payload.target_unit_id)
        action = SceneAction(
            tenant_id=self.tenant_id,
            scene_id=scene.id,
            position=payload.position,
            action_type=action_type,
            target_device_id=target_device_id,
            target_unit_id=target_unit_id,
            payload_json=self._safe_json_dumps(payload.payload),
            is_active=payload.is_active,
        )
        self.db.add(action)
        self.db.commit()
        self.db.refresh(action)
        return action

    def update_scene_action(
        self, scene_id: int, action_id: int, payload: SceneActionUpdate
    ) -> SceneAction:
        self._require_write_access()
        self.get_scene_or_404(scene_id)
        action = (
            self._scoped_query(SceneAction)
            .filter(SceneAction.id == action_id, SceneAction.scene_id == scene_id)
            .first()
        )
        if action is None:
            raise HTTPException(status_code=404, detail="Azione scena non trovata")

        values = payload.model_dump(exclude_unset=True)
        if "action_type" in values and values["action_type"] is not None:
            values["action_type"] = self._validate_scene_action_type(values["action_type"])
        if "target_device_id" in values and values["target_device_id"] is not None:
            self.get_device_or_404(values["target_device_id"])
        if "target_unit_id" in values:
            values["target_unit_id"] = self._validate_target_unit(values["target_unit_id"])
        if "payload" in values:
            values["payload_json"] = self._safe_json_dumps(values.pop("payload"))

        for key, value in values.items():
            setattr(action, key, value)

        self.db.commit()
        self.db.refresh(action)
        return action

    def delete_scene_action(self, scene_id: int, action_id: int) -> None:
        self._require_write_access()
        self.get_scene_or_404(scene_id)
        action = (
            self._scoped_query(SceneAction)
            .filter(SceneAction.id == action_id, SceneAction.scene_id == scene_id)
            .first()
        )
        if action is None:
            raise HTTPException(status_code=404, detail="Azione scena non trovata")
        self.db.delete(action)
        self.db.commit()

    def list_automation_rules(self) -> list[AutomationRule]:
        return self._scoped_query(AutomationRule).order_by(AutomationRule.name.asc(), AutomationRule.id.asc()).all()

    def get_automation_rule_or_404(self, rule_id: int) -> AutomationRule:
        rule = self._scoped_query(AutomationRule).filter(AutomationRule.id == rule_id).first()
        if rule is None:
            raise HTTPException(status_code=404, detail="Regola automazione non trovata")
        return rule

    def create_automation_rule(self, payload: AutomationRuleCreate) -> AutomationRule:
        self._require_write_access()
        trigger_type = self._validate_rule_trigger_type(payload.trigger_type)
        action_type = self._validate_rule_action_type(payload.action_type)
        target_device_id = payload.target_device_id
        if target_device_id is not None:
            self.get_device_or_404(target_device_id)
        target_unit_id = self._validate_target_unit(payload.target_unit_id)
        rule = AutomationRule(
            tenant_id=self.tenant_id,
            name=payload.name.strip(),
            description=payload.description,
            trigger_type=trigger_type,
            trigger_filter_json=self._safe_json_dumps(payload.trigger_filter),
            action_type=action_type,
            target_device_id=target_device_id,
            target_unit_id=target_unit_id,
            payload_json=self._safe_json_dumps(payload.payload),
            is_active=payload.is_active,
        )
        self.db.add(rule)
        self.db.commit()
        self.db.refresh(rule)
        return rule

    def trigger_rules_for_business_event(
        self,
        *,
        trigger_type: str,
        trigger_source: str,
        context: dict | None,
        requested_by: str | None = None,
        correlation_id: str | None = None,
    ) -> list[AutomationExecution]:
        normalized_trigger = self._validate_rule_trigger_type(trigger_type)
        normalized_source = normalize_trigger_source(trigger_source)
        rules = (
            self._scoped_query(AutomationRule)
            .filter(
                AutomationRule.trigger_type == normalized_trigger,
                AutomationRule.is_active.is_(True),
            )
            .order_by(AutomationRule.id.asc())
            .all()
        )
        executions: list[AutomationExecution] = []
        for rule in rules:
            execution = self.trigger_automation_rule(
                rule.id,
                RuleTriggerRequest(
                    trigger_type=normalized_trigger,
                    trigger_source=normalized_source,
                    correlation_id=correlation_id,
                    context=context or {},
                ),
                requested_by=requested_by,
            )
            executions.append(execution)
        return executions

    def update_automation_rule(self, rule_id: int, payload: AutomationRuleUpdate) -> AutomationRule:
        self._require_write_access()
        rule = self.get_automation_rule_or_404(rule_id)
        values = payload.model_dump(exclude_unset=True)
        if "trigger_type" in values and values["trigger_type"] is not None:
            values["trigger_type"] = self._validate_rule_trigger_type(values["trigger_type"])
        if "action_type" in values and values["action_type"] is not None:
            values["action_type"] = self._validate_rule_action_type(values["action_type"])
        if "target_device_id" in values and values["target_device_id"] is not None:
            self.get_device_or_404(values["target_device_id"])
        if "target_unit_id" in values:
            values["target_unit_id"] = self._validate_target_unit(values["target_unit_id"])
        if "trigger_filter" in values:
            values["trigger_filter_json"] = self._safe_json_dumps(values.pop("trigger_filter"))
        if "payload" in values:
            values["payload_json"] = self._safe_json_dumps(values.pop("payload"))
        if "name" in values and values["name"] is not None:
            values["name"] = values["name"].strip()
        for key, value in values.items():
            setattr(rule, key, value)
        self.db.commit()
        self.db.refresh(rule)
        return rule

    def list_automation_executions(
        self, limit: int = 50, scene_id: int | None = None, rule_id: int | None = None
    ) -> list[AutomationExecution]:
        query = self._scoped_query(AutomationExecution)
        if scene_id is not None:
            query = query.filter(AutomationExecution.scene_id == scene_id)
        if rule_id is not None:
            query = query.filter(AutomationExecution.rule_id == rule_id)
        query = query.order_by(AutomationExecution.started_at.desc(), AutomationExecution.id.desc())
        return query.limit(max(1, min(limit, 200))).all()

    def _make_correlation_id(self, supplied: str | None = None) -> str:
        raw = (supplied or "").strip()
        if raw:
            return raw[:64]
        return uuid.uuid4().hex

    def _make_trigger_snapshot(
        self,
        *,
        trigger_type: str,
        trigger_source: str,
        context: dict,
    ) -> dict[str, object]:
        return {
            "trigger_type": trigger_type,
            "trigger_source": trigger_source,
            "booking_id": context.get("booking_id"),
            "alert_id": context.get("alert_id"),
            "device_id": context.get("device_id"),
            "unit_id": context.get("unit_id"),
            "event_id": context.get("event_id"),
        }

    def _make_dedup_key(
        self,
        *,
        rule_id: int,
        trigger_type: str,
        trigger_source: str,
        snapshot: dict[str, object],
        occurred_at: datetime,
    ) -> str:
        bucket = int(occurred_at.timestamp() // int(AUTOMATION_DEDUP_WINDOW.total_seconds()))
        material = json.dumps(
            {
                "tenant_id": self.tenant_id,
                "rule_id": rule_id,
                "trigger_type": trigger_type,
                "trigger_source": trigger_source,
                "snapshot": snapshot,
                "bucket": bucket,
            },
            sort_keys=True,
            ensure_ascii=True,
        )
        return hashlib.sha256(material.encode("utf-8")).hexdigest()

    def _find_recent_execution_by_dedup_key(self, dedup_key: str) -> AutomationExecution | None:
        threshold = datetime.now(timezone.utc) - AUTOMATION_DEDUP_WINDOW
        return (
            self._scoped_query(AutomationExecution)
            .filter(
                AutomationExecution.dedup_key == dedup_key,
                AutomationExecution.started_at >= threshold,
            )
            .order_by(AutomationExecution.started_at.desc(), AutomationExecution.id.desc())
            .first()
        )

    def _create_execution(
        self,
        *,
        scene_id: int | None,
        rule_id: int | None,
        trigger_type: str,
        trigger_source: str,
        trigger_snapshot: dict[str, object] | None,
        correlation_id: str,
        dedup_key: str | None,
        requested_by: str | None,
        context: dict | None,
    ) -> AutomationExecution:
        execution = AutomationExecution(
            tenant_id=self.tenant_id,
            scene_id=scene_id,
            rule_id=rule_id,
            trigger_type=trigger_type,
            trigger_source=trigger_source,
            trigger_snapshot_json=self._safe_json_dumps(trigger_snapshot or {}),
            correlation_id=correlation_id,
            dedup_key=dedup_key,
            status="running",
            requested_by=requested_by or "system",
            context_json=self._safe_json_dumps(context or {}),
        )
        self.db.add(execution)
        self.db.commit()
        self.db.refresh(execution)
        return execution

    def _finalize_execution(
        self,
        execution: AutomationExecution,
        *,
        results: list[dict],
        failures: list[dict],
        reference_updated=None,
    ) -> AutomationExecution:
        now = datetime.now(timezone.utc)
        if failures and results:
            status = "partial"
        elif failures:
            status = "failed"
        else:
            status = "executed"
        if status not in AUTOMATION_EXECUTION_STATUSES:
            status = "failed"

        execution.status = status
        execution.result_json = self._safe_json_dumps(
            {
                "results": results,
                "failures": failures,
                "result_count": len(results),
                "failure_count": len(failures),
            }
        )
        execution.error_message = failures[0].get("error") if failures else None
        execution.finished_at = now
        if reference_updated is not None:
            reference_updated.last_run_at = now
        self.db.commit()
        self.db.refresh(execution)
        return execution

    def _execute_action(
        self,
        *,
        action_type: str,
        target_device_id: int | None,
        target_unit_id: int | None,
        payload: dict,
        requested_by: str | None,
        correlation_id: str,
    ) -> dict:
        try:
            normalized = normalize_rule_action_type(action_type)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail="Azione non supportata") from exc
        if normalized == "action.dispatch_device_command":
            if target_device_id is None:
                raise HTTPException(
                    status_code=400,
                    detail="action.dispatch_device_command richiede target_device_id",
                )
            command_type = normalize_command_type(str(payload.get("command_type", "")))
            command_payload = payload.get("payload", {}) if isinstance(payload.get("payload", {}), dict) else {}
            ttl_seconds = payload.get("ttl_seconds", 300)
            command = self.create_device_command(
                target_device_id,
                DeviceCommandCreate(
                    command_type=command_type,
                    payload=command_payload,
                    ttl_seconds=ttl_seconds,
                ),
                requested_by=requested_by,
                correlation_id=correlation_id,
            )
            return {
                "entity": "device_command",
                "id": command.id,
                "status": command.status,
                "device_id": command.device_id,
                "correlation_id": correlation_id,
            }

        if normalized == "action.create_alert":
            alert = self.create_alert(
                AlertCreate(
                    unit_id=target_unit_id or payload.get("unit_id"),
                    device_id=target_device_id or payload.get("device_id"),
                    alert_type=str(payload.get("alert_type") or "automation_alert"),
                    severity=str(payload.get("severity") or "warning"),
                    title=str(payload.get("title") or "Automation alert"),
                    description=payload.get("description"),
                ),
                correlation_id=correlation_id,
                trigger_rules=False,
                trigger_source="auto.automation",
                requested_by=requested_by,
            )
            return {
                "entity": "alert",
                "id": alert.id,
                "status": alert.status,
                "correlation_id": correlation_id,
            }

        if normalized == "action.create_maintenance_ticket":
            unit_id = target_unit_id or payload.get("unit_id")
            self._validate_target_unit(unit_id)
            ticket = MaintenanceTicket(
                title=str(payload.get("title") or "Automation maintenance ticket"),
                description=payload.get("description"),
                unit_id=unit_id,
                status=str(payload.get("status") or "todo"),
                priority=str(payload.get("priority") or "medium"),
                ticket_type=str(payload.get("ticket_type") or "repair"),
                currency=str(payload.get("currency") or "EUR"),
            )
            self.db.add(ticket)
            self.db.commit()
            self.db.refresh(ticket)
            return {
                "entity": "maintenance_ticket",
                "id": ticket.id,
                "status": ticket.status,
                "correlation_id": correlation_id,
            }

        if normalized == "action.create_staff_task":
            unit_id = target_unit_id or payload.get("unit_id")
            self._validate_target_unit(unit_id)
            date_raw = payload.get("date")
            task_date = date.today()
            if isinstance(date_raw, str) and date_raw.strip():
                try:
                    task_date = date.fromisoformat(date_raw.strip())
                except ValueError as exc:
                    raise HTTPException(status_code=400, detail="Formato data task non valido") from exc
            time_raw = payload.get("time")
            task_time = None
            if isinstance(time_raw, str) and time_raw.strip():
                try:
                    task_time = time.fromisoformat(time_raw.strip())
                except ValueError as exc:
                    raise HTTPException(status_code=400, detail="Formato ora task non valido") from exc
            task = StaffTask(
                unit_id=unit_id,
                date=task_date,
                time=task_time,
                task_type=str(payload.get("task_type") or "automation"),
                assignee_name=payload.get("assignee_name"),
                status=str(payload.get("status") or "planned"),
                notes=payload.get("notes"),
                cost=payload.get("cost"),
                currency=str(payload.get("currency") or "EUR"),
            )
            self.db.add(task)
            self.db.commit()
            self.db.refresh(task)
            return {
                "entity": "staff_task",
                "id": task.id,
                "status": task.status,
                "correlation_id": correlation_id,
            }

        raise HTTPException(status_code=400, detail="Azione non supportata")

    def run_scene(
        self, scene_id: int, requested_by: str | None = None, context: dict | None = None
    ) -> AutomationExecution:
        self._require_write_access()
        scene = self.get_scene_or_404(scene_id)
        if not scene.is_active:
            raise HTTPException(status_code=400, detail="Scena disattivata")

        actions = (
            self._scoped_query(SceneAction)
            .filter(SceneAction.scene_id == scene_id, SceneAction.is_active.is_(True))
            .order_by(SceneAction.position.asc(), SceneAction.id.asc())
            .all()
        )
        if not actions:
            raise HTTPException(status_code=400, detail="Scena senza azioni attive")

        correlation_id = self._make_correlation_id()
        trigger_type = normalize_rule_trigger_type("manual")
        trigger_source = normalize_trigger_source("manual.api")
        trigger_snapshot = self._make_trigger_snapshot(
            trigger_type=trigger_type,
            trigger_source=trigger_source,
            context=context or {},
        )
        execution = self._create_execution(
            scene_id=scene.id,
            rule_id=None,
            trigger_type=trigger_type,
            trigger_source=trigger_source,
            trigger_snapshot=trigger_snapshot,
            correlation_id=correlation_id,
            dedup_key=None,
            requested_by=requested_by,
            context=context,
        )
        results: list[dict] = []
        failures: list[dict] = []
        for action in actions:
            payload = self._safe_json_loads(action.payload_json)
            try:
                outcome = self._execute_action(
                    action_type=action.action_type,
                    target_device_id=action.target_device_id,
                    target_unit_id=action.target_unit_id,
                    payload=payload,
                    requested_by=requested_by,
                    correlation_id=correlation_id,
                )
                results.append({"action_id": action.id, "action_type": action.action_type, "outcome": outcome})
            except HTTPException as exc:
                failures.append({"action_id": action.id, "error": exc.detail})
            except Exception as exc:  # pragma: no cover - fallback guardrail
                failures.append({"action_id": action.id, "error": str(exc)})
        return self._finalize_execution(execution, results=results, failures=failures, reference_updated=scene)

    def trigger_automation_rule(
        self, rule_id: int, payload: RuleTriggerRequest, requested_by: str | None = None
    ) -> AutomationExecution:
        self._require_write_access()
        rule = self.get_automation_rule_or_404(rule_id)
        if not rule.is_active:
            raise HTTPException(status_code=400, detail="Regola disattivata")
        runtime_trigger = self._validate_rule_trigger_type(payload.trigger_type)
        configured_trigger = self._validate_rule_trigger_type(rule.trigger_type)
        trigger_source = normalize_trigger_source(payload.trigger_source)

        if runtime_trigger != configured_trigger and runtime_trigger != "manual":
            raise HTTPException(status_code=400, detail="Trigger runtime non compatibile con la regola")
        effective_trigger = configured_trigger if runtime_trigger == "manual" else runtime_trigger

        correlation_id = self._make_correlation_id(payload.correlation_id)
        snapshot = self._make_trigger_snapshot(
            trigger_type=effective_trigger,
            trigger_source=trigger_source,
            context=payload.context,
        )

        dedup_key = None
        if is_automatic_trigger_source(trigger_source) and effective_trigger != "manual":
            dedup_key = self._make_dedup_key(
                rule_id=rule.id,
                trigger_type=effective_trigger,
                trigger_source=trigger_source,
                snapshot=snapshot,
                occurred_at=datetime.now(timezone.utc),
            )
            existing = self._find_recent_execution_by_dedup_key(dedup_key)
            if existing is not None:
                return existing

        execution = self._create_execution(
            scene_id=None,
            rule_id=rule.id,
            trigger_type=effective_trigger,
            trigger_source=trigger_source,
            trigger_snapshot=snapshot,
            correlation_id=correlation_id,
            dedup_key=dedup_key,
            requested_by=requested_by,
            context=payload.context,
        )
        results: list[dict] = []
        failures: list[dict] = []
        try:
            outcome = self._execute_action(
                action_type=rule.action_type,
                target_device_id=rule.target_device_id,
                target_unit_id=rule.target_unit_id,
                payload=self._safe_json_loads(rule.payload_json),
                requested_by=requested_by,
                correlation_id=correlation_id,
            )
            results.append({"rule_id": rule.id, "action_type": rule.action_type, "outcome": outcome})
        except HTTPException as exc:
            failures.append({"rule_id": rule.id, "error": exc.detail})
        except Exception as exc:  # pragma: no cover - fallback guardrail
            failures.append({"rule_id": rule.id, "error": str(exc)})
        return self._finalize_execution(execution, results=results, failures=failures, reference_updated=rule)

    def smart_overview(self) -> dict[str, int]:
        total_devices = self._scoped_query(Device).with_entities(func.count(Device.id)).scalar() or 0
        online_devices = (
            self._scoped_query(DeviceState).with_entities(func.count(DeviceState.id))
            .filter(DeviceState.online.is_(True))
            .scalar()
            or 0
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

    def simulate_sync(self, device_id: int) -> DeviceState:
        device = self.get_device_or_404(device_id)
        provider = get_provider(device.provider)
        snapshot = provider.pull_state(device.external_id)
        state = self.upsert_device_state(
            device_id,
            DeviceStateUpdate(
                online=snapshot.online,
                power_state=snapshot.power_state,
                motion_detected=snapshot.motion_detected,
                contact_open=snapshot.contact_open,
                leak_detected=snapshot.leak_detected,
                temperature_c=snapshot.temperature_c,
                humidity_pct=snapshot.humidity_pct,
                energy_w=snapshot.energy_w,
                signal_rssi=snapshot.signal_rssi,
                raw_payload_json=json.dumps(snapshot.raw_payload or {}, ensure_ascii=True),
            ),
        )
        self.create_device_event(
            device_id=device_id,
            payload=DeviceEventCreate(
                event_type="provider.sync",
                severity="info",
                source=provider.provider_name,
                payload_json=state.raw_payload_json,
            ),
        )
        if snapshot.leak_detected:
            self.create_alert(
                AlertCreate(
                    unit_id=device.unit_id,
                    device_id=device.id,
                    alert_type="leak_detected",
                    severity="critical",
                    title=f"Leak rilevata da {device.name}",
                    description="Evento simulato dal provider mock",
                ),
                trigger_rules=True,
                trigger_source="auto.provider",
                requested_by="system",
            )
        return state
