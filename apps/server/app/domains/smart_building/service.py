from __future__ import annotations

import json
import hashlib
import uuid
from datetime import date, datetime, time, timedelta, timezone

from fastapi import HTTPException
from sqlalchemy import and_, func, or_
from sqlalchemy.orm import Session

from app.core.config import settings
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
    SetupAssignDevicesIn,
    SetupConnectProviderIn,
    SetupEnableAutomationsIn,
    SetupImportDevicesIn,
    SetupPropertyIn,
    SetupUnitsIn,
    SceneActionCreate,
    SceneActionUpdate,
    SceneCreate,
    SceneUpdate,
)
from app.models.booking import Booking
from app.models.maintenance import MaintenanceTicket
from app.models.property import Property
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
    SetupSession,
    SmartProviderConnection,
)


SUPPORTED_COMMAND_STATUSES = {"pending", "accepted", "executed", "failed", "expired"}
POWER_CATEGORIES = {"smart_relay", "smart_light", "smart_plug", "relay", "light"}
CLIMATE_CATEGORIES = {"climate_controller", "thermostat", "hvac_controller"}
LOCK_CATEGORIES = {"smart_lock", "lock_controller"}
AUTOMATION_EXECUTION_STATUSES = {"running", "executed", "failed", "partial"}
AUTOMATION_DEDUP_WINDOW = timedelta(minutes=5)
CONNECTIVITY_STATUSES = {"online", "offline", "unknown"}
SETUP_STEPS = (
    "property",
    "units",
    "connect_provider",
    "import_devices",
    "assign_devices",
    "enable_automations",
    "complete",
)
AUTOMATION_TEMPLATE_KEYS = {
    "basic_hospitality_pack",
    "energy_saver_pack",
    "leak_protection_pack",
}


class SmartBuildingService:
    def __init__(self, db: Session, tenant_id: str, role: str = "owner"):
        self.db = db
        self.tenant_id = tenant_id
        self.role = (role or "owner").strip().lower()

    def _scoped_query(self, model):
        return self.db.query(model).filter(model.tenant_id == self.tenant_id)

    def _get_provider_connection(self, connection_id: int) -> SmartProviderConnection:
        connection = (
            self._scoped_query(SmartProviderConnection)
            .filter(SmartProviderConnection.id == connection_id)
            .first()
        )
        if connection is None:
            raise HTTPException(status_code=404, detail="Provider connection non trovata")
        return connection

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

    def _property_or_404(self, property_id: int) -> Property:
        prop = (
            self._scoped_query(Property)
            .filter(Property.id == property_id)
            .first()
        )
        if prop is None:
            raise HTTPException(status_code=404, detail="Property non trovata")
        return prop

    def _provider_instance_for_connection(
        self,
        provider_name: str | None = None,
        connection: SmartProviderConnection | None = None,
    ):
        cfg = {}
        effective_name = provider_name
        if connection is not None:
            effective_name = connection.provider_name
            cfg = self._safe_json_loads(connection.config_json)
            if connection.base_url:
                cfg["base_url"] = connection.base_url
        return get_provider(effective_name, config=cfg)

    def _resolve_connection_for_device_provider(
        self, device: Device
    ) -> SmartProviderConnection | None:
        if device.unit_id is None:
            return None
        unit = self.db.query(Unit).filter(Unit.id == device.unit_id).first()
        if unit is None or unit.property_id is None:
            return None
        return (
            self._scoped_query(SmartProviderConnection)
            .filter(
                SmartProviderConnection.property_id == unit.property_id,
                SmartProviderConnection.provider_name == device.provider,
                SmartProviderConnection.is_active.is_(True),
            )
            .first()
        )

    def _resolve_connection_for_provider(
        self, provider_name: str, property_id: int | None = None
    ) -> SmartProviderConnection | None:
        query = self._scoped_query(SmartProviderConnection).filter(
            SmartProviderConnection.provider_name == provider_name,
            SmartProviderConnection.is_active.is_(True),
        )
        if property_id is not None:
            query = query.filter(SmartProviderConnection.property_id == property_id)
        return query.order_by(SmartProviderConnection.updated_at.desc(), SmartProviderConnection.id.desc()).first()

    def list_devices(self) -> list[Device]:
        return self._scoped_query(Device).order_by(Device.id.asc()).all()

    def _aggregate_health_summary(
        self, records: list[dict[str, object]], unit_id: int | None = None, unit_name: str = "Unassigned"
    ) -> dict[str, object]:
        total = len(records)
        online = sum(1 for r in records if r.get("connectivity_status") == "online")
        offline = sum(1 for r in records if r.get("connectivity_status") == "offline")
        warning = sum(1 for r in records if r.get("health_status") == "warning")
        critical = sum(1 for r in records if r.get("health_status") == "critical")
        return {
            "unit_id": unit_id,
            "unit_name": unit_name,
            "total_devices": total,
            "online_devices": online,
            "offline_devices": offline,
            "warning_devices": warning,
            "critical_devices": critical,
        }

    def get_device_health_overview(
        self,
        *,
        status: str | None = None,
        connectivity: str | None = None,
        unit_id: int | None = None,
        property_id: int | None = None,
    ) -> dict[str, object]:
        normalized_status = (status or "").strip().lower() or None
        if normalized_status is not None and normalized_status not in {"healthy", "warning", "critical"}:
            raise HTTPException(status_code=400, detail="status health non valido")
        normalized_connectivity = (connectivity or "").strip().lower() or None
        if normalized_connectivity is not None and normalized_connectivity not in CONNECTIVITY_STATUSES:
            raise HTTPException(status_code=400, detail="connectivity non valida")

        devices_query = self._scoped_query(Device)
        if property_id is not None:
            self._property_or_404(property_id)
            unit_ids_for_property = [
                row[0]
                for row in self.db.query(Unit.id).filter(Unit.property_id == property_id).all()
            ]
            if unit_ids_for_property:
                devices_query = devices_query.filter(Device.unit_id.in_(unit_ids_for_property))
            else:
                devices_query = devices_query.filter(Device.id == -1)
        if unit_id is not None:
            self._ensure_unit_visible(unit_id)
            devices_query = devices_query.filter(Device.unit_id == unit_id)
        devices = devices_query.order_by(Device.name.asc(), Device.id.asc()).all()
        device_ids = [device.id for device in devices]
        states_by_device: dict[int, DeviceState] = {}
        if device_ids:
            states = (
                self._scoped_query(DeviceState)
                .filter(DeviceState.device_id.in_(device_ids))
                .all()
            )
            states_by_device = {state.device_id: state for state in states}

        unit_ids = {device.unit_id for device in devices if device.unit_id is not None}
        unit_map: dict[int, Unit] = {}
        if unit_ids:
            units = self.db.query(Unit).filter(Unit.id.in_(unit_ids)).all()
            unit_map = {unit.id: unit for unit in units}

        property_ids = {unit.property_id for unit in unit_map.values() if unit.property_id is not None}
        property_map: dict[int, str] = {}
        if property_ids:
            props = self._scoped_query(Property).filter(Property.id.in_(property_ids)).all()
            property_map = {prop.id: prop.name for prop in props}

        now = datetime.now(timezone.utc)
        records: list[dict[str, object]] = []
        for device in devices:
            record = self._build_device_health_record(
                device,
                states_by_device.get(device.id),
                now=now,
                unit_name=unit_map.get(device.unit_id).name if device.unit_id is not None and unit_map.get(device.unit_id) else "Unassigned",
            )
            unit_obj = unit_map.get(device.unit_id) if device.unit_id is not None else None
            prop_id = unit_obj.property_id if unit_obj is not None else None
            record["property_id"] = prop_id
            record["property_name"] = property_map.get(prop_id) if prop_id is not None else None
            if normalized_status is not None and record["health_status"] != normalized_status:
                continue
            if normalized_connectivity is not None and record["connectivity_status"] != normalized_connectivity:
                continue
            records.append(record)

        by_unit: dict[int | None, list[dict[str, object]]] = {}
        for record in records:
            key = record.get("unit_id")
            by_unit.setdefault(key, []).append(record)

        unit_summaries: list[dict[str, object]] = []
        for key, group in by_unit.items():
            if key is None:
                unit_summaries.append(
                    self._aggregate_health_summary(group, unit_id=None, unit_name="Unassigned")
                )
                continue
            unit_summaries.append(
                self._aggregate_health_summary(
                    group,
                    unit_id=int(key),
                    unit_name=(
                        unit_map[int(key)].name
                        if int(key) in unit_map
                        else f"Unit {key}"
                    ),
                )
            )
        unit_summaries.sort(key=lambda item: (item["unit_id"] is None, item["unit_name"]))

        by_property: dict[int | None, list[dict[str, object]]] = {}
        for record in records:
            key = record.get("property_id")
            by_property.setdefault(key, []).append(record)
        property_summaries: list[dict[str, object]] = []
        for key, group in by_property.items():
            if key is None:
                property_summaries.append(
                    self._aggregate_health_summary(group, unit_id=None, unit_name="Unassigned")
                )
            else:
                property_summaries.append(
                    self._aggregate_health_summary(
                        group,
                        unit_id=int(key),
                        unit_name=property_map.get(int(key), f"Property {key}"),
                    )
                )
        property_summaries.sort(key=lambda item: (item["unit_id"] is None, item["unit_name"]))

        property_summary = self._aggregate_health_summary(
            records,
            unit_id=None,
            unit_name="Property",
        )
        return {
            "property_summary": property_summary,
            "properties": property_summaries,
            "units": unit_summaries,
            "devices": records,
        }

    def get_unit_device_health(self, unit_id: int) -> dict[str, object]:
        unit = self._ensure_unit_visible(unit_id)
        overview = self.get_device_health_overview(unit_id=unit_id)
        devices = overview["devices"]
        summary = self._aggregate_health_summary(devices, unit_id=unit.id, unit_name=unit.name)
        return {
            "unit": unit,
            "summary": summary,
            "devices": devices,
        }

    def get_single_device_health(self, device_id: int) -> dict[str, object]:
        device = self.get_device_or_404(device_id)
        state = self._scoped_query(DeviceState).filter(DeviceState.device_id == device_id).first()
        unit_name = None
        if device.unit_id is not None:
            unit = self.db.query(Unit).filter(Unit.id == device.unit_id).first()
            unit_name = unit.name if unit else None
        return self._build_device_health_record(device, state, unit_name=unit_name)

    def list_provider_connections(self, property_id: int | None = None) -> list[SmartProviderConnection]:
        query = self._scoped_query(SmartProviderConnection).order_by(
            SmartProviderConnection.updated_at.desc(), SmartProviderConnection.id.desc()
        )
        if property_id is not None:
            self._property_or_404(property_id)
            query = query.filter(SmartProviderConnection.property_id == property_id)
        return query.all()

    def get_provider_connection_or_404(self, connection_id: int) -> SmartProviderConnection:
        return self._get_provider_connection(connection_id)

    def create_provider_connection(
        self,
        *,
        property_id: int,
        provider_name: str,
        status: str = "connected",
        base_url: str | None = None,
        config: dict | None = None,
        is_active: bool = True,
    ) -> SmartProviderConnection:
        self._require_owner_access()
        self._property_or_404(property_id)
        normalized_provider = (provider_name or "").strip().lower()
        if normalized_provider not in {"mock", "home_assistant"}:
            raise HTTPException(status_code=400, detail="Provider non supportato")
        existing = (
            self._scoped_query(SmartProviderConnection)
            .filter(
                SmartProviderConnection.property_id == property_id,
                SmartProviderConnection.provider_name == normalized_provider,
            )
            .first()
        )
        if existing is not None:
            raise HTTPException(status_code=400, detail="Provider connection gia presente")
        connection = SmartProviderConnection(
            tenant_id=self.tenant_id,
            property_id=property_id,
            provider_name=normalized_provider,
            status=(status or "connected").strip().lower(),
            base_url=(base_url or "").strip() or None,
            config_json=self._safe_json_dumps(config or {}),
            is_active=bool(is_active),
        )
        self.db.add(connection)
        self.db.commit()
        self.db.refresh(connection)
        return connection

    def update_provider_connection(
        self,
        connection_id: int,
        *,
        status: str | None = None,
        base_url: str | None = None,
        config: dict | None = None,
        is_active: bool | None = None,
        last_error: str | None = None,
    ) -> SmartProviderConnection:
        self._require_owner_access()
        connection = self._get_provider_connection(connection_id)
        if status is not None:
            connection.status = status.strip().lower()
        if base_url is not None:
            connection.base_url = base_url.strip() or None
        if config is not None:
            connection.config_json = self._safe_json_dumps(config)
        if is_active is not None:
            connection.is_active = bool(is_active)
        if last_error is not None:
            connection.last_error = last_error
        self.db.commit()
        self.db.refresh(connection)
        return connection

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

    def _require_owner_access(self) -> None:
        if self.role != "owner":
            raise HTTPException(status_code=403, detail="Solo owner puo usare il setup wizard")

    def _latest_setup_session(self) -> SetupSession | None:
        return (
            self._scoped_query(SetupSession)
            .order_by(SetupSession.created_at.desc(), SetupSession.id.desc())
            .first()
        )

    def _active_setup_session_or_404(self) -> SetupSession:
        session = (
            self._scoped_query(SetupSession)
            .filter(SetupSession.status == "in_progress")
            .order_by(SetupSession.created_at.desc(), SetupSession.id.desc())
            .first()
        )
        if session is None:
            raise HTTPException(status_code=404, detail="Setup session non trovata")
        return session

    def _session_to_dict(self, session: SetupSession) -> dict[str, object]:
        return {
            "id": session.id,
            "tenant_id": session.tenant_id,
            "status": session.status,
            "current_step": session.current_step,
            "metadata": self._safe_json_loads(session.metadata_json),
            "created_at": session.created_at,
            "updated_at": session.updated_at,
            "completed_at": session.completed_at,
        }

    def _update_setup_session(
        self,
        session: SetupSession,
        *,
        current_step: str | None = None,
        status: str | None = None,
        metadata_updates: dict | None = None,
    ) -> SetupSession:
        metadata = self._safe_json_loads(session.metadata_json)
        if metadata_updates:
            metadata.update(metadata_updates)
        if current_step:
            session.current_step = current_step
        if status:
            session.status = status
            if status == "completed":
                session.completed_at = datetime.now(timezone.utc)
        session.metadata_json = self._safe_json_dumps(metadata)
        self.db.commit()
        self.db.refresh(session)
        return session

    def setup_start(self) -> dict[str, object]:
        self._require_owner_access()
        existing = (
            self._scoped_query(SetupSession)
            .filter(SetupSession.status == "in_progress")
            .order_by(SetupSession.created_at.desc(), SetupSession.id.desc())
            .first()
        )
        if existing is not None:
            return {"session": self._session_to_dict(existing)}

        session = SetupSession(
            tenant_id=self.tenant_id,
            status="in_progress",
            current_step=SETUP_STEPS[0],
            metadata_json=self._safe_json_dumps({"steps": list(SETUP_STEPS)}),
        )
        self.db.add(session)
        self.db.commit()
        self.db.refresh(session)
        return {"session": self._session_to_dict(session)}

    def get_setup_session(self) -> dict[str, object] | None:
        self._require_owner_access()
        session = self._latest_setup_session()
        if session is None:
            return None
        return self._session_to_dict(session)

    def setup_property(self, payload: SetupPropertyIn) -> dict[str, object]:
        self._require_owner_access()
        session = self._active_setup_session_or_404()
        code = (
            payload.property_name.strip().lower().replace(" ", "-").replace("--", "-")[:64]
            or f"property-{self.tenant_id}"
        )
        existing = (
            self._scoped_query(Property)
            .filter(Property.code == code)
            .first()
        )
        if existing is None:
            prop = Property(
                tenant_id=self.tenant_id,
                name=payload.property_name.strip(),
                code=code,
                status="active",
                timezone=payload.timezone or "Africa/Casablanca",
                metadata_json=self._safe_json_dumps({"currency": payload.currency or "EUR"}),
                is_active=True,
            )
            self.db.add(prop)
            self.db.commit()
            self.db.refresh(prop)
        else:
            prop = existing
        session = self._update_setup_session(
            session,
            current_step="units",
            metadata_updates={
                "property_name": payload.property_name.strip(),
                "property_id": prop.id,
                "timezone": payload.timezone or "Africa/Casablanca",
                "currency": (payload.currency or "EUR").upper(),
            },
        )
        return self._session_to_dict(session)

    def setup_units(self, payload: SetupUnitsIn) -> dict[str, object]:
        self._require_owner_access()
        session = self._active_setup_session_or_404()
        metadata = self._safe_json_loads(session.metadata_json)
        property_id = payload.property_id or metadata.get("property_id")
        if not property_id:
            raise HTTPException(status_code=400, detail="Step property richiesto prima di creare units")
        created_ids: list[int] = []
        existing_ids: list[int] = []

        for raw_name in payload.units:
            name = (raw_name or "").strip()
            if not name:
                continue
            existing = self.db.query(Unit).filter(Unit.name == name).first()
            if existing is not None:
                if existing.property_id is None:
                    existing.property_id = int(property_id)
                existing_ids.append(existing.id)
                continue
            unit = Unit(name=name, property_id=int(property_id), currency="EUR")
            self.db.add(unit)
            self.db.flush()
            created_ids.append(unit.id)
        self.db.commit()

        all_ids = existing_ids + created_ids
        session = self._update_setup_session(
            session,
            current_step="connect_provider",
            metadata_updates={
                "unit_ids": all_ids,
                "units_created": created_ids,
                "units_existing": existing_ids,
            },
        )
        return self._session_to_dict(session)

    def setup_connect_provider(self, payload: SetupConnectProviderIn) -> dict[str, object]:
        self._require_owner_access()
        session = self._active_setup_session_or_404()
        metadata = self._safe_json_loads(session.metadata_json)
        property_id = payload.property_id or metadata.get("property_id")
        if not property_id:
            raise HTTPException(status_code=400, detail="Property non impostata nel wizard")
        self._property_or_404(int(property_id))
        provider_name = (payload.provider or "").strip().lower()
        if provider_name not in {"mock", "home_assistant"}:
            raise HTTPException(status_code=400, detail="Provider non supportato dal setup wizard")
        _ = get_provider(provider_name)
        connection = (
            self._scoped_query(SmartProviderConnection)
            .filter(
                SmartProviderConnection.property_id == int(property_id),
                SmartProviderConnection.provider_name == provider_name,
            )
            .first()
        )
        base_url = str((payload.config or {}).get("base_url", "")).strip() or None
        config_payload = dict(payload.config or {})
        if connection is None:
            connection = SmartProviderConnection(
                tenant_id=self.tenant_id,
                property_id=int(property_id),
                provider_name=provider_name,
                status="connected",
                base_url=base_url,
                config_json=self._safe_json_dumps(config_payload),
                is_active=True,
            )
            self.db.add(connection)
        else:
            connection.status = "connected"
            connection.base_url = base_url
            connection.config_json = self._safe_json_dumps(config_payload)
            connection.is_active = True
            connection.last_error = None
        self.db.commit()
        self.db.refresh(connection)
        session = self._update_setup_session(
            session,
            current_step="import_devices",
            metadata_updates={
                "provider_name": provider_name,
                "provider_connection_id": connection.id,
                "provider_config": payload.config or {},
            },
        )
        return self._session_to_dict(session)

    def setup_import_devices(self, payload: SetupImportDevicesIn) -> dict[str, object]:
        self._require_owner_access()
        session = self._active_setup_session_or_404()
        metadata = self._safe_json_loads(session.metadata_json)
        provider_name = (payload.provider or metadata.get("provider_name") or "mock").strip().lower()
        connection_id = payload.provider_connection_id or metadata.get("provider_connection_id")
        connection = self._get_provider_connection(int(connection_id)) if connection_id else None
        sync_result = self.sync_catalog_from_provider(provider_name, provider_connection=connection)
        imported_devices = (
            self._scoped_query(Device)
            .filter(Device.provider == provider_name)
            .order_by(Device.id.asc())
            .all()
        )
        if connection is not None:
            connection.last_sync_at = datetime.now(timezone.utc)
            connection.status = "connected"
            connection.last_error = None
            self.db.commit()
        session = self._update_setup_session(
            session,
            current_step="assign_devices",
            metadata_updates={
                "provider_name": provider_name,
                "import_result": sync_result,
                "imported_device_ids": [d.id for d in imported_devices],
            },
        )
        return self._session_to_dict(session)

    def setup_assign_devices(self, payload: SetupAssignDevicesIn) -> dict[str, object]:
        self._require_owner_access()
        session = self._active_setup_session_or_404()

        assigned = 0
        skipped_conflict = 0
        invalid = 0
        property_id = payload.property_id or self._safe_json_loads(session.metadata_json).get("property_id")
        for item in payload.assignments or []:
            try:
                device_id = int(item.get("device_id"))
                unit_id = int(item.get("unit_id"))
            except (TypeError, ValueError):
                invalid += 1
                continue
            device = self._scoped_query(Device).filter(Device.id == device_id).first()
            if device is None:
                invalid += 1
                continue
            self._ensure_unit_visible(unit_id)
            if property_id:
                unit = self.db.query(Unit).filter(Unit.id == unit_id).first()
                if unit is not None and unit.property_id not in {None, int(property_id)}:
                    skipped_conflict += 1
                    continue
            if device.unit_id is not None and device.unit_id != unit_id:
                skipped_conflict += 1
                continue
            device.unit_id = unit_id
            assigned += 1
        self.db.commit()

        session = self._update_setup_session(
            session,
            current_step="enable_automations",
            metadata_updates={
                "assignment_result": {
                    "assigned": assigned,
                    "skipped_conflict": skipped_conflict,
                    "invalid": invalid,
                }
            },
        )
        return self._session_to_dict(session)

    def _ensure_scene(self, name: str, description: str) -> Scene:
        existing = self._scoped_query(Scene).filter(Scene.name == name).first()
        if existing is not None:
            return existing
        return self.create_scene(SceneCreate(name=name, description=description, is_active=True))

    def _ensure_rule(
        self,
        *,
        name: str,
        description: str,
        trigger_type: str,
        action_type: str,
        payload: dict,
    ) -> AutomationRule:
        existing = self._scoped_query(AutomationRule).filter(AutomationRule.name == name).first()
        if existing is not None:
            return existing
        return self.create_automation_rule(
            AutomationRuleCreate(
                name=name,
                description=description,
                trigger_type=trigger_type,
                action_type=action_type,
                payload=payload,
                is_active=True,
            )
        )

    def _enable_template(self, template: str) -> dict[str, object]:
        key = template.strip().lower()
        if key not in AUTOMATION_TEMPLATE_KEYS:
            raise HTTPException(status_code=400, detail=f"Template non supportato: {template}")

        created: list[dict[str, object]] = []
        if key == "basic_hospitality_pack":
            scene = self._ensure_scene(
                name="[Setup] Hospitality Welcome Scene",
                description="Template base di accoglienza ospite.",
            )
            created.append({"entity": "scene", "id": scene.id, "name": scene.name})
            rule = self._ensure_rule(
                name="[Setup] Trigger check-in welcome",
                description="Genera alert operativa quando il check-in e completato.",
                trigger_type="booking.checked_in",
                action_type="action.create_alert",
                payload={
                    "severity": "info",
                    "title": "Guest check-in completato",
                    "description": "Controlla comfort e readiness unita.",
                },
            )
            created.append({"entity": "rule", "id": rule.id, "name": rule.name})
        elif key == "energy_saver_pack":
            rule = self._ensure_rule(
                name="[Setup] Trigger checkout energy saver",
                description="Crea alert per attivare modalita risparmio energetico al checkout.",
                trigger_type="booking.checked_out",
                action_type="action.create_alert",
                payload={
                    "severity": "warning",
                    "title": "Checkout completato: attiva energy saver",
                    "description": "Verifica spegnimento carichi e setpoint eco.",
                },
            )
            created.append({"entity": "rule", "id": rule.id, "name": rule.name})
        elif key == "leak_protection_pack":
            rule = self._ensure_rule(
                name="[Setup] Trigger leak maintenance",
                description="Apre ticket manutenzione su alert leak.",
                trigger_type="alert.raised",
                action_type="action.create_maintenance_ticket",
                payload={
                    "title": "Leak protection follow-up",
                    "description": "Verifica perdita segnalata dai sensori smart.",
                    "severity": "high",
                },
            )
            created.append({"entity": "rule", "id": rule.id, "name": rule.name})
        return {"template": key, "created": created}

    def setup_enable_automations(self, payload: SetupEnableAutomationsIn) -> dict[str, object]:
        self._require_owner_access()
        session = self._active_setup_session_or_404()
        property_id = payload.property_id or self._safe_json_loads(session.metadata_json).get("property_id")
        if property_id:
            self._property_or_404(int(property_id))
        templates = payload.templates or []
        if not templates:
            templates = ["basic_hospitality_pack"]
        results = [self._enable_template(template) for template in templates]
        session = self._update_setup_session(
            session,
            current_step="complete",
            metadata_updates={
                "automation_templates": [r["template"] for r in results],
                "automation_result": results,
            },
        )
        return self._session_to_dict(session)

    def setup_complete(self) -> dict[str, object]:
        self._require_owner_access()
        session = self._active_setup_session_or_404()
        session = self._update_setup_session(session, current_step="complete", status="completed")
        return self._session_to_dict(session)

    def _extract_battery_from_raw_payload(self, raw_payload_json: str | None) -> int | None:
        raw = self._safe_json_loads(raw_payload_json)
        candidates = (
            raw.get("battery_level"),
            raw.get("battery"),
            (raw.get("attributes") or {}).get("battery_level") if isinstance(raw.get("attributes"), dict) else None,
            (raw.get("attributes") or {}).get("battery") if isinstance(raw.get("attributes"), dict) else None,
        )
        for value in candidates:
            try:
                if value is None:
                    continue
                parsed = int(value)
                return max(0, min(parsed, 100))
            except (TypeError, ValueError):
                continue
        return None

    def _compute_connectivity_status(
        self, device: Device, state: DeviceState | None, now: datetime
    ) -> str:
        state_online = state.online if state is not None else None
        if state_online is False:
            return "offline"
        if state_online is True:
            if device.last_seen_at is not None:
                last_seen = self._as_utc_datetime(device.last_seen_at) or now
                age = now - last_seen
                if age.total_seconds() > settings.device_offline_timeout_seconds:
                    return "offline"
            return "online"
        if device.last_seen_at is None:
            return "unknown"
        last_seen = self._as_utc_datetime(device.last_seen_at) or now
        age = now - last_seen
        return "offline" if age.total_seconds() > settings.device_offline_timeout_seconds else "online"

    def _compute_health_status(
        self,
        connectivity_status: str,
        battery_level: int | None,
        signal_strength: int | None,
    ) -> tuple[str, list[str]]:
        reasons: list[str] = []
        if connectivity_status == "offline":
            reasons.append("device_offline")
            return "critical", reasons
        if connectivity_status == "unknown":
            reasons.append("unknown_connectivity")

        if battery_level is not None:
            if battery_level <= settings.device_battery_critical_level:
                reasons.append("battery_critical")
            elif battery_level < settings.device_battery_warning_level:
                reasons.append("battery_low")

        if signal_strength is not None and signal_strength <= settings.device_signal_warning_rssi:
            reasons.append("weak_signal")

        if "battery_critical" in reasons:
            return "critical", reasons
        if reasons:
            return "warning", reasons
        return "healthy", reasons

    def _build_device_health_record(
        self,
        device: Device,
        state: DeviceState | None,
        *,
        now: datetime | None = None,
        unit_name: str | None = None,
    ) -> dict[str, object]:
        current_time = now or datetime.now(timezone.utc)
        battery_level = device.battery_level
        if battery_level is None and state is not None:
            battery_level = self._extract_battery_from_raw_payload(state.raw_payload_json)
        signal_strength = (
            state.signal_rssi if state is not None and state.signal_rssi is not None else device.signal_strength
        )
        connectivity_status = self._compute_connectivity_status(device, state, current_time)
        health_status, reasons = self._compute_health_status(
            connectivity_status=connectivity_status,
            battery_level=battery_level,
            signal_strength=signal_strength,
        )
        return {
            "device_id": device.id,
            "unit_id": device.unit_id,
            "unit_name": unit_name,
            "name": device.name,
            "category": device.category,
            "provider": device.provider,
            "connectivity_status": connectivity_status,
            "health_status": health_status,
            "battery_level": battery_level,
            "signal_strength": signal_strength,
            "last_seen_at": self._as_utc_datetime(device.last_seen_at),
            "online": state.online if state is not None else None,
            "needs_attention": health_status in {"warning", "critical"},
            "reasons": reasons,
        }

    def _ensure_device_health_alerts(
        self,
        *,
        device: Device,
        health: dict[str, object],
        requested_by: str = "system",
    ) -> None:
        alert_candidates: list[tuple[str, str, str, str]] = []
        connectivity = str(health.get("connectivity_status", "unknown"))
        battery_level = health.get("battery_level")

        if connectivity == "offline":
            alert_candidates.append(
                (
                    "device.offline",
                    "critical",
                    f"Device offline: {device.name}",
                    "Il device non risponde o e offline.",
                )
            )
        if isinstance(battery_level, int) and battery_level <= settings.device_battery_critical_level:
            alert_candidates.append(
                (
                    "device.battery_low",
                    "warning",
                    f"Batteria critica: {device.name}",
                    f"Batteria residua {battery_level}%.",
                )
            )

        for alert_type, severity, title, description in alert_candidates:
            existing_open = (
                self._scoped_query(Alert)
                .filter(
                    Alert.device_id == device.id,
                    Alert.alert_type == alert_type,
                    Alert.status == "open",
                )
                .first()
            )
            if existing_open is not None:
                continue
            self.create_alert(
                AlertCreate(
                    unit_id=device.unit_id,
                    device_id=device.id,
                    alert_type=alert_type,
                    severity=severity,
                    title=title,
                    description=description,
                ),
                trigger_rules=True,
                trigger_source="auto.device_health",
                requested_by=requested_by,
            )

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
        selected_name = (provider_name or "").strip().lower()
        connection = self._resolve_connection_for_provider(selected_name) if selected_name else None
        provider = self._provider_instance_for_connection(provider_name, connection)
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
        now = datetime.now(timezone.utc)
        values = payload.model_dump()
        if state is None:
            state = DeviceState(tenant_id=self.tenant_id, device_id=device_id, **values)
            self.db.add(state)
        else:
            for key, value in values.items():
                setattr(state, key, value)

        previous_connectivity = (device.connectivity_status or "unknown").strip().lower()
        battery_from_state = self._extract_battery_from_raw_payload(payload.raw_payload_json)
        if battery_from_state is not None:
            device.battery_level = battery_from_state
        if payload.signal_rssi is not None:
            device.signal_strength = payload.signal_rssi
        device.last_seen_at = now

        health = self._build_device_health_record(device, state, now=now)
        device.connectivity_status = str(health["connectivity_status"])
        device.health_status = str(health["health_status"])

        self.db.commit()
        self.db.refresh(state)
        self.db.refresh(device)

        if (
            previous_connectivity != device.connectivity_status
            or device.health_status in {"warning", "critical"}
        ):
            self._ensure_device_health_alerts(
                device=device,
                health=health,
                requested_by="system",
            )
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

    def sync_catalog_from_provider(
        self,
        provider_name: str | None = None,
        *,
        provider_connection: SmartProviderConnection | None = None,
    ) -> dict[str, int | str]:
        self._require_write_access()
        provider = self._provider_instance_for_connection(provider_name, provider_connection)
        if not getattr(provider, "supports_catalog_sync", False):
            raise HTTPException(status_code=400, detail="Provider does not support catalog sync")

        imported_devices = 0
        updated_devices = 0
        synced_states = 0

        try:
            snapshots = provider.list_devices(self.tenant_id)
        except Exception as exc:
            if provider_connection is not None:
                provider_connection.status = "error"
                provider_connection.last_error = str(exc)
                self.db.commit()
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
        connection = self._resolve_connection_for_provider(provider_name)
        provider = self._provider_instance_for_connection(provider_name, connection)
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
        selected_name = (provider_name or "").strip().lower()
        connection = self._resolve_connection_for_provider(selected_name) if selected_name else None
        provider = self._provider_instance_for_connection(provider_name, connection)
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
                device.connectivity_status = "offline"
                device.health_status = "critical"
                self.db.commit()
                self._ensure_device_health_alerts(
                    device=device,
                    health={
                        "connectivity_status": "offline",
                        "health_status": "critical",
                        "battery_level": device.battery_level,
                    },
                    requested_by="system",
                )
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

        provider = self._provider_instance_for_connection(
            device.provider,
            self._resolve_connection_for_device_provider(device),
        )
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

    def simulate_sync(self, device_id: int) -> DeviceState:
        device = self.get_device_or_404(device_id)
        provider = self._provider_instance_for_connection(
            device.provider,
            self._resolve_connection_for_device_provider(device),
        )
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
