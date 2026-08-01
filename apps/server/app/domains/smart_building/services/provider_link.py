"""Provider connections, catalog sync, polling and webhook ingest.

Split out of the former single-file ``service.py``; the method bodies are
unchanged. Every module is a mixin combined by ``SmartBuildingService``,
so cross-module ``self`` calls keep working exactly as before.
"""

from __future__ import annotations

import json
from datetime import datetime, timezone

from fastapi import HTTPException
from sqlalchemy import func

from app.core.config import settings
from app.domains.smart_building.schemas import (
    DeviceEventCreate,
    DeviceStateUpdate,
)
from app.models.unit import Unit
from app.models.smart_building import (
    Device,
    DeviceEvent,
    DeviceState,
    SmartProviderConnection,
)


class ProviderLinkMixin:
    """Provider connections, catalog sync, polling and webhook ingest."""

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
        if normalized_provider not in {"mock", "home_assistant", "villacore"}:
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

    def reconcile_link(self, provider_name: str | None = None) -> dict[str, object]:
        """Re-read the building and realign the portal.

        Push delivery can be missed — Home Assistant restarts, the portal is
        down, a POST is lost. Reconciliation is the safety net: it re-imports the
        catalog (picking up new VillaCore entities) and re-reads every state, so
        the portal converges even if no event ever arrives.
        """
        self._require_write_access()
        selected = (provider_name or settings.smart_provider_mode or "").strip().lower()
        connection = self._resolve_connection_for_provider(selected) if selected else None
        catalog = self.sync_catalog_from_provider(selected or None, provider_connection=connection)
        states = self.poll_provider_states(selected or None)
        if connection is not None:
            connection.last_sync_at = datetime.now(timezone.utc)
            connection.last_error = None
            self.db.commit()
        return {
            "provider_name": catalog["provider_name"],
            "imported_devices": catalog["imported_devices"],
            "updated_devices": catalog["updated_devices"],
            "polled_devices": states["polled_devices"],
            "updated_states": states["updated_states"],
            "events_emitted": states["events_emitted"],
            "errors": states["errors"],
            "reconciled_at": datetime.now(timezone.utc),
        }

    def link_status(self, provider_name: str | None = None) -> dict[str, object]:
        """Health of the building link, plus what the portal could not classify.

        This is the page an operator opens after a VillaCore milestone lands:
        `unclassified` names the entities the portal does not understand yet, so
        new capabilities surface as a to-do instead of silently missing.
        """
        selected_name = (provider_name or settings.smart_provider_mode or "").strip().lower()
        connection = self._resolve_connection_for_provider(selected_name) if selected_name else None
        provider = self._provider_instance_for_connection(selected_name or None, connection)
        status = provider.describe_link()

        known_external_ids = {
            device.external_id
            for device in self._scoped_query(Device)
            .filter(Device.provider == provider.provider_name)
            .all()
        }
        classified_devices = (
            self._scoped_query(Device)
            .filter(
                Device.provider == provider.provider_name,
                Device.capability_key.isnot(None),
            )
            .count()
        )

        last_event = (
            self._scoped_query(DeviceEvent)
            .order_by(DeviceEvent.occurred_at.desc(), DeviceEvent.id.desc())
            .first()
        )
        now = datetime.now(timezone.utc)
        last_event_age_seconds = None
        if last_event is not None and last_event.occurred_at is not None:
            occurred_at = last_event.occurred_at
            if occurred_at.tzinfo is None:
                occurred_at = occurred_at.replace(tzinfo=timezone.utc)
            last_event_age_seconds = max(0, int((now - occurred_at).total_seconds()))

        # Entities the provider would import but that never reached the portal:
        # the usual cause is "sync not run since the last VillaCore change".
        not_imported = [
            item
            for item in status.unclassified
            if item.get("entity_id") not in known_external_ids
        ]

        return {
            "provider_name": status.provider_name,
            "configured": status.configured,
            "reachable": status.reachable,
            "authenticated": status.authenticated,
            "contract_version": status.contract_version,
            "manifest_present": status.manifest_present,
            "entity_count": status.entity_count,
            "importable_count": status.importable_count,
            "excluded_count": status.excluded_count,
            "imported_device_count": len(known_external_ids),
            "classified_device_count": classified_devices,
            "pending_import_count": max(0, status.importable_count - len(known_external_ids)),
            "unclassified": status.unclassified,
            "unclassified_count": len(status.unclassified),
            "unclassified_not_imported_count": len(not_imported),
            "zones": status.zones,
            "connection_id": connection.id if connection else None,
            "last_sync_at": connection.last_sync_at if connection else None,
            "last_error": status.error_message or (connection.last_error if connection else None),
            "last_event_age_seconds": last_event_age_seconds,
            "ingest_push_enabled": bool(settings.smart_ingest_token),
            "poll_interval_seconds": settings.smart_poll_interval_seconds,
            "site_id": settings.villacore_site_id,
        }

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

    def _resolve_snapshot_unit_id(self, snapshot) -> int | None:
        """Bind an imported entity to a PMS unit.

        The zone map wins when the provider classified the entity (VillaCore),
        because it is explicit and operator-editable. Otherwise we fall back to
        the historical unit-hint name matching, so generic Home Assistant and
        mock setups keep behaving exactly as before.
        """
        zone_key = getattr(snapshot, "zone_key", None)
        if zone_key:
            unit_id = self.resolve_zone_unit_id(zone_key)
            if unit_id is not None:
                return unit_id
        return self._resolve_unit_id_from_hint(snapshot.unit_hint)

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
        # `updated_devices` keeps its original meaning (existing devices seen).
        # `changed_devices` counts the ones whose catalog data actually moved,
        # and only those are worth an audit event.
        changed_devices = 0
        synced_states = 0
        imported_ids: set[int] = set()

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
            resolved_unit_id = self._resolve_snapshot_unit_id(snapshot)
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
                    zone_key=snapshot.zone_key,
                    capability_key=snapshot.capability_key,
                    facility_key=snapshot.facility_key,
                    unit_id=resolved_unit_id,
                    is_active=snapshot.is_active,
                    health_status=snapshot.health_status,
                    battery_level=snapshot.battery_level,
                )
                self.db.add(device)
                self.db.flush()
                imported_devices += 1
                imported_ids.add(device.id)
                catalog_changed = True
            else:
                # Only a real change is worth an audit entry: reconciliation
                # revisits every device on a timer, and writing one event per
                # device per pass buries the meaningful ones under tens of
                # thousands of no-ops.
                before = (
                    device.name,
                    device.category,
                    device.model,
                    device.manufacturer,
                    device.zone_name,
                    device.zone_key,
                    device.capability_key,
                    device.facility_key,
                    device.unit_id,
                    device.is_active,
                    device.health_status,
                )
                device.name = snapshot.name
                device.category = snapshot.category
                device.model = snapshot.model
                device.manufacturer = snapshot.manufacturer
                device.zone_name = snapshot.zone_name
                # Re-classify on every sync: a profile or manifest change must
                # be able to correct a previous decision.
                if snapshot.zone_key is not None:
                    device.zone_key = snapshot.zone_key
                if snapshot.capability_key is not None:
                    device.capability_key = snapshot.capability_key
                device.facility_key = snapshot.facility_key
                if resolved_unit_id is not None:
                    device.unit_id = resolved_unit_id
                device.is_active = snapshot.is_active
                device.health_status = snapshot.health_status
                if snapshot.battery_level is not None:
                    device.battery_level = snapshot.battery_level
                after = (
                    device.name,
                    device.category,
                    device.model,
                    device.manufacturer,
                    device.zone_name,
                    device.zone_key,
                    device.capability_key,
                    device.facility_key,
                    device.unit_id,
                    device.is_active,
                    device.health_status,
                )
                catalog_changed = before != after
                updated_devices += 1
                if catalog_changed:
                    changed_devices += 1

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

            if catalog_changed:
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
                                "imported": device.id in imported_ids,
                            },
                            ensure_ascii=True,
                        ),
                    ),
                )

        return {
            "provider_name": provider.provider_name,
            "imported_devices": imported_devices,
            "updated_devices": updated_devices,
            "changed_devices": changed_devices,
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
