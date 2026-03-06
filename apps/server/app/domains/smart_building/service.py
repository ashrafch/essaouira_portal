from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.domains.smart_building.providers.factory import get_provider
from app.domains.smart_building.schemas import AlertCreate, DeviceCreate, DeviceEventCreate, DeviceStateUpdate, DeviceUpdate
from app.models.unit import Unit
from app.models.smart_building import Alert, Device, DeviceEvent, DeviceState


class SmartBuildingService:
    def __init__(self, db: Session, tenant_id: str):
        self.db = db
        self.tenant_id = tenant_id

    def list_devices(self) -> list[Device]:
        return self.db.query(Device).order_by(Device.id.asc()).all()

    def provider_debug(self, provider_name: str | None = None) -> dict[str, object]:
        provider = get_provider(provider_name)
        return {
            "provider_name": provider.provider_name,
            "supports_catalog_sync": bool(getattr(provider, "supports_catalog_sync", False)),
            "supports_webhook_ingest": bool(getattr(provider, "supports_webhook_ingest", False)),
        }

    def get_device_or_404(self, device_id: int) -> Device:
        device = self.db.query(Device).filter(Device.id == device_id).first()
        if device is None:
            raise HTTPException(status_code=404, detail="Device non trovato")
        return device

    def get_device_by_provider_external(self, provider: str, external_id: str) -> Device | None:
        return (
            self.db.query(Device)
            .filter(Device.provider == provider, Device.external_id == external_id)
            .first()
        )

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
        existing = (
            self.db.query(Device)
            .filter(
                Device.provider == payload.provider,
                Device.external_id == payload.external_id,
            )
            .first()
        )
        if existing:
            raise HTTPException(status_code=400, detail="Device gia presente per provider/external_id")
        device = Device(**payload.model_dump())
        self.db.add(device)
        self.db.commit()
        self.db.refresh(device)
        return device

    def update_device(self, device_id: int, payload: DeviceUpdate) -> Device:
        device = self.get_device_or_404(device_id)
        for key, value in payload.model_dump(exclude_unset=True).items():
            setattr(device, key, value)
        self.db.commit()
        self.db.refresh(device)
        return device

    def get_device_state(self, device_id: int) -> DeviceState:
        self.get_device_or_404(device_id)
        state = self.db.query(DeviceState).filter(DeviceState.device_id == device_id).first()
        if state is None:
            raise HTTPException(status_code=404, detail="Device state non trovato")
        return state

    def upsert_device_state(self, device_id: int, payload: DeviceStateUpdate) -> DeviceState:
        device = self.get_device_or_404(device_id)
        state = self.db.query(DeviceState).filter(DeviceState.device_id == device_id).first()
        values = payload.model_dump()
        if state is None:
            state = DeviceState(device_id=device_id, **values)
            self.db.add(state)
        else:
            for key, value in values.items():
                setattr(state, key, value)
        device.last_seen_at = datetime.now(timezone.utc) if payload.online else device.last_seen_at
        self.db.commit()
        self.db.refresh(state)
        return state

    def sync_catalog_from_provider(self, provider_name: str | None = None) -> dict[str, int | str]:
        provider = get_provider(provider_name)
        if not getattr(provider, "supports_catalog_sync", False):
            raise HTTPException(status_code=400, detail="Provider does not support catalog sync")

        imported_devices = 0
        updated_devices = 0
        synced_states = 0

        for snapshot in provider.list_devices(self.tenant_id):
            device = self.get_device_by_provider_external(provider.provider_name, snapshot.external_id)
            if device is None:
                device = Device(
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
                self.upsert_device_state(
                    device.id,
                    DeviceStateUpdate(
                        online=snapshot.state.online,
                        power_state=snapshot.state.power_state,
                        motion_detected=snapshot.state.motion_detected,
                        contact_open=snapshot.state.contact_open,
                        leak_detected=snapshot.state.leak_detected,
                        temperature_c=snapshot.state.temperature_c,
                        humidity_pct=snapshot.state.humidity_pct,
                        energy_w=snapshot.state.energy_w,
                        signal_rssi=snapshot.state.signal_rssi,
                        raw_payload_json=json.dumps(snapshot.state.raw_payload or {}, ensure_ascii=True),
                    ),
                )
                synced_states += 1

            self.create_device_event(
                device_id=device.id,
                payload=DeviceEventCreate(
                    event_type="provider_catalog_sync",
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

    def create_device_event(self, device_id: int, payload: DeviceEventCreate) -> DeviceEvent:
        device = self.get_device_or_404(device_id)
        event = DeviceEvent(
            device_id=device_id,
            unit_id=device.unit_id,
            event_type=payload.event_type,
            severity=payload.severity,
            source=payload.source,
            payload_json=payload.payload_json,
        )
        self.db.add(event)
        self.db.commit()
        self.db.refresh(event)
        return event

    def list_device_events(self, device_id: int | None = None, limit: int = 100) -> list[DeviceEvent]:
        query = self.db.query(DeviceEvent).order_by(DeviceEvent.occurred_at.desc())
        if device_id is not None:
            query = query.filter(DeviceEvent.device_id == device_id)
        return query.limit(max(1, min(limit, 500))).all()

    def list_alerts(self, status: str | None = None) -> list[Alert]:
        query = self.db.query(Alert).order_by(Alert.last_seen_at.desc())
        if status:
            query = query.filter(Alert.status == status)
        return query.all()

    def create_alert(self, payload: AlertCreate) -> Alert:
        if payload.device_id is not None:
            self.get_device_or_404(payload.device_id)
        alert = Alert(
            unit_id=payload.unit_id,
            device_id=payload.device_id,
            alert_type=payload.alert_type,
            severity=payload.severity,
            title=payload.title,
            description=payload.description,
            status="open",
        )
        self.db.add(alert)
        self.db.commit()
        self.db.refresh(alert)
        return alert

    def acknowledge_alert(self, alert_id: int, username: str) -> Alert:
        alert = self.db.query(Alert).filter(Alert.id == alert_id).first()
        if alert is None:
            raise HTTPException(status_code=404, detail="Alert non trovato")
        alert.status = "acknowledged"
        alert.acknowledged_by = username
        alert.last_seen_at = datetime.now(timezone.utc)
        self.db.commit()
        self.db.refresh(alert)
        return alert

    def smart_overview(self) -> dict[str, int]:
        total_devices = self.db.query(func.count(Device.id)).scalar() or 0
        online_devices = (
            self.db.query(func.count(DeviceState.id))
            .filter(DeviceState.online.is_(True))
            .scalar()
            or 0
        )
        open_alerts = (
            self.db.query(func.count(Alert.id))
            .filter(Alert.status == "open")
            .scalar()
            or 0
        )
        critical_alerts = (
            self.db.query(func.count(Alert.id))
            .filter(Alert.status == "open", Alert.severity == "critical")
            .scalar()
            or 0
        )
        threshold = datetime.now(timezone.utc) - timedelta(hours=12)
        recently_seen_devices = (
            self.db.query(func.count(Device.id))
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
                event_type="provider_sync",
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
                )
            )
        return state
