"""Device inventory, state snapshots, freshness and health.

Split out of the former single-file ``service.py``; the method bodies are
unchanged. Every module is a mixin combined by ``SmartBuildingService``,
so cross-module ``self`` calls keep working exactly as before.
"""

from __future__ import annotations

import json
from datetime import datetime, timezone

from fastapi import HTTPException

from app.core.config import settings
from app.domains.smart_building.taxonomy import normalize_event_type
from app.domains.smart_building.schemas import (
    AlertCreate,
    DeviceCreate,
    DeviceEventCreate,
    DeviceStateUpdate,
    DeviceUpdate,
)
from app.domains.smart_building.services.constants import CONNECTIVITY_STATUSES
from app.models.property import Property
from app.models.unit import Unit
from app.models.smart_building import (
    Alert,
    AutomationRule,
    Device,
    DeviceEvent,
    DeviceState,
    SceneAction,
)


class DevicesMixin:
    """Device inventory, state snapshots, freshness and health."""

    def list_devices(self) -> list[Device]:
        return self._scoped_query(Device).order_by(Device.id.asc()).all()

    def _compute_data_freshness(
        self,
        timestamp: datetime | None,
        *,
        now: datetime | None = None,
        offline_after_seconds: int | None = None,
    ) -> str:
        if timestamp is None:
            return "offline"
        current = now or datetime.now(timezone.utc)
        ts = self._as_utc_datetime(timestamp)
        if ts is None:
            return "offline"
        age = max(0, int((current - ts).total_seconds()))
        fresh_limit = max(5, int(settings.data_fresh_seconds))
        stale_limit = max(fresh_limit + 1, int(settings.data_stale_seconds))
        offline_limit = max(stale_limit + 1, int(offline_after_seconds or settings.device_offline_timeout_seconds))
        if age <= fresh_limit:
            return "fresh"
        if age <= stale_limit:
            return "stale"
        if age > offline_limit:
            return "offline"
        return "stale"

    def list_devices_with_freshness(self) -> list[dict[str, object]]:
        devices = self.list_devices()
        now = datetime.now(timezone.utc)
        rows: list[dict[str, object]] = []
        for device in devices:
            rows.append(
                {
                    "id": device.id,
                    "tenant_id": device.tenant_id,
                    "unit_id": device.unit_id,
                    "zone_name": device.zone_name,
                    "provider": device.provider,
                    "external_id": device.external_id,
                    "name": device.name,
                    "category": device.category,
                    "model": device.model,
                    "manufacturer": device.manufacturer,
                    "is_active": device.is_active,
                    "connectivity_status": device.connectivity_status,
                    "health_status": device.health_status,
                    "battery_level": device.battery_level,
                    "signal_strength": device.signal_strength,
                    "last_seen_at": device.last_seen_at,
                    "last_updated_at": device.last_seen_at or device.updated_at,
                    "data_freshness_status": self._compute_data_freshness(
                        device.last_seen_at or device.updated_at,
                        now=now,
                    ),
                    "created_at": device.created_at,
                    "updated_at": device.updated_at,
                }
            )
        return rows

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
        last_updated_at = self._as_utc_datetime(device.last_seen_at) or self._as_utc_datetime(device.updated_at)
        return {
            "device_id": device.id,
            "unit_id": device.unit_id,
            "unit_name": unit_name,
            "name": device.name,
            "external_id": device.external_id,
            "category": device.category,
            "provider": device.provider,
            "connectivity_status": connectivity_status,
            "health_status": health_status,
            "battery_level": battery_level,
            "signal_strength": signal_strength,
            "power_state": state.power_state if state is not None else None,
            "motion_detected": state.motion_detected if state is not None else None,
            "contact_open": state.contact_open if state is not None else None,
            "leak_detected": state.leak_detected if state is not None else None,
            "last_seen_at": self._as_utc_datetime(device.last_seen_at),
            "last_updated_at": last_updated_at,
            "data_freshness_status": self._compute_data_freshness(last_updated_at, now=current_time),
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

    def delete_device(self, device_id: int) -> None:
        self._require_write_access()
        device = self.get_device_or_404(device_id)

        scene_ref = (
            self._scoped_query(SceneAction)
            .filter(SceneAction.target_device_id == device_id)
            .first()
        )
        if scene_ref is not None:
            raise HTTPException(
                status_code=400,
                detail="Impossibile eliminare: dispositivo usato in scene automation.",
            )

        rule_ref = (
            self._scoped_query(AutomationRule)
            .filter(AutomationRule.target_device_id == device_id)
            .first()
        )
        if rule_ref is not None:
            raise HTTPException(
                status_code=400,
                detail="Impossibile eliminare: dispositivo usato in regole automation.",
            )

        self.db.delete(device)
        self.db.commit()

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

        self._ingest_telemetry_for_state(device=device, payload=payload, recorded_at=now)

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
