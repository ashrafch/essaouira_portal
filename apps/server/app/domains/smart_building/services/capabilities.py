"""Capability resolution: from "what I want to do" to "which device does it".

The portal asks for ``workflow.checkin`` on unit 3, or ``facility.alarm_reset``
on the pool. This module answers with the device that implements it, using the
``zone_key`` / ``capability_key`` / ``facility_key`` columns the provider sync
fills in. Nothing here knows a single Home Assistant entity id.

Zone-to-unit binding lives in the provider connection's ``zone_map``, so the
operator can rebind a zone from the UI without a migration or a code change.
"""

from __future__ import annotations

from fastapi import HTTPException

from app.core.config import settings
from app.domains.smart_building.providers.villacore_classifier import (
    ZONE_KIND_COMMON,
    ZONE_KIND_FACILITY,
    ZONE_KIND_UNIT,
    load_profile,
)
from app.models.smart_building import Device, DeviceState, SmartProviderConnection
from app.models.unit import Unit

# Providers whose devices carry VillaCore Link classification.
LINK_PROVIDERS = ("villacore",)


class CapabilitiesMixin:
    """Capability, zone and facility resolution over classified devices."""

    # --- zone map -----------------------------------------------------------
    def _link_connection(
        self, property_id: int | None = None
    ) -> SmartProviderConnection | None:
        for provider_name in LINK_PROVIDERS:
            connection = self._resolve_connection_for_provider(provider_name, property_id)
            if connection is not None:
                return connection
        return None

    def get_zone_map(self, property_id: int | None = None) -> dict[str, dict]:
        """Zone -> scope binding, merging the profile with operator overrides."""
        profile = load_profile()
        zone_map: dict[str, dict] = {
            key: {
                "zone": key,
                "kind": spec.kind,
                "display_name": spec.display_name,
                "machine": spec.machine,
                "rated_power_w": spec.rated_power_w,
                "unit_id": None,
                "source": "profile",
            }
            for key, spec in profile.zones.items()
        }

        connection = self._link_connection(property_id)
        overrides = {}
        if connection is not None:
            config = self._safe_json_loads(connection.config_json)
            raw = config.get("zone_map")
            if isinstance(raw, dict):
                overrides = raw

        for key, value in overrides.items():
            zone_key = str(key).strip()
            if not zone_key:
                continue
            entry = zone_map.setdefault(
                zone_key,
                {
                    "zone": zone_key,
                    "kind": ZONE_KIND_FACILITY,
                    "display_name": zone_key.replace("_", " ").title(),
                    "machine": None,
                    "rated_power_w": None,
                    "unit_id": None,
                    "source": "override",
                },
            )
            # A bare integer is accepted as shorthand for "bind to this unit".
            if isinstance(value, int):
                entry.update({"kind": ZONE_KIND_UNIT, "unit_id": value, "source": "override"})
                continue
            if not isinstance(value, dict):
                continue
            kind = str(value.get("kind") or entry["kind"]).strip().lower()
            if kind in {ZONE_KIND_UNIT, ZONE_KIND_FACILITY, ZONE_KIND_COMMON}:
                entry["kind"] = kind
            if "unit_id" in value:
                unit_id = value.get("unit_id")
                entry["unit_id"] = int(unit_id) if isinstance(unit_id, int) else None
            if value.get("display_name"):
                entry["display_name"] = str(value["display_name"])
            if "rated_power_w" in value:
                rated = value.get("rated_power_w")
                entry["rated_power_w"] = int(rated) if isinstance(rated, (int, float)) else None
            entry["source"] = "override"

        return zone_map

    def set_zone_map(
        self, connection_id: int, zone_map: dict, *, requested_by: str | None = None
    ) -> SmartProviderConnection:
        """Persist operator zone bindings on the provider connection."""
        self._require_owner_access()
        connection = self._get_provider_connection(connection_id)
        cleaned: dict[str, dict] = {}
        for key, value in (zone_map or {}).items():
            zone_key = str(key).strip().lower()
            if not zone_key:
                continue
            entry: dict[str, object] = {}
            if isinstance(value, int):
                entry = {"kind": ZONE_KIND_UNIT, "unit_id": value}
            elif isinstance(value, dict):
                kind = str(value.get("kind") or "").strip().lower()
                if kind in {ZONE_KIND_UNIT, ZONE_KIND_FACILITY, ZONE_KIND_COMMON}:
                    entry["kind"] = kind
                unit_id = value.get("unit_id")
                if unit_id is not None:
                    if not isinstance(unit_id, int):
                        raise HTTPException(status_code=400, detail="unit_id deve essere numerico")
                    self._validate_target_unit(unit_id)
                    entry["unit_id"] = unit_id
                if value.get("display_name"):
                    entry["display_name"] = str(value["display_name"])[:128]
                rated = value.get("rated_power_w")
                if rated is not None:
                    if not isinstance(rated, (int, float)) or rated < 0:
                        raise HTTPException(
                            status_code=400, detail="rated_power_w deve essere un numero positivo"
                        )
                    entry["rated_power_w"] = int(rated)
            else:
                raise HTTPException(status_code=400, detail=f"zone_map['{zone_key}'] non valida")
            if entry.get("kind") == ZONE_KIND_UNIT and entry.get("unit_id") is None:
                raise HTTPException(
                    status_code=400,
                    detail=f"zone_map['{zone_key}']: kind 'unit' richiede unit_id",
                )
            cleaned[zone_key] = entry

        config = self._safe_json_loads(connection.config_json)
        config["zone_map"] = cleaned
        connection.config_json = self._safe_json_dumps(config)
        self.db.commit()
        self.db.refresh(connection)
        return connection

    def resolve_zone_unit_id(self, zone_key: str | None) -> int | None:
        """Unit bound to a zone: explicit override first, then name matching."""
        if not zone_key:
            return None
        entry = self.get_zone_map().get(zone_key.strip().lower())
        if entry is None:
            return None
        if entry.get("unit_id") is not None:
            unit = self.db.query(Unit).filter(Unit.id == entry["unit_id"]).first()
            if unit is not None:
                return unit.id
        if entry.get("kind") != ZONE_KIND_UNIT:
            return None
        return self._resolve_unit_id_from_hint(str(entry.get("display_name") or zone_key))

    # --- capability lookup --------------------------------------------------
    def _preferred_provider(self) -> str:
        """Provider that owns the building link right now.

        Two providers can legitimately claim the same capability — a mock left
        over from a demo and the real VillaCore link, for instance. The active
        connection wins, so a command never lands on a stale simulated device.
        """
        connection = self._link_connection()
        if connection is not None:
            return (connection.provider_name or "").strip().lower()
        return (settings.smart_provider_mode or "").strip().lower()

    def find_capability_devices(
        self,
        capability_key: str,
        *,
        unit_id: int | None = None,
        zone_key: str | None = None,
    ) -> list[Device]:
        """All devices implementing a capability, most authoritative first."""
        query = self._scoped_query(Device).filter(
            Device.capability_key == capability_key,
            Device.is_active.is_(True),
        )
        if unit_id is not None:
            query = query.filter(Device.unit_id == unit_id)
        if zone_key is not None:
            query = query.filter(Device.zone_key == zone_key.strip().lower())
        candidates = query.order_by(Device.id.asc()).all()
        if len(candidates) < 2:
            return candidates
        preferred = self._preferred_provider()
        return sorted(
            candidates,
            key=lambda device: (
                0 if (device.provider or "").strip().lower() == preferred else 1,
                device.id,
            ),
        )

    def find_capability_device(
        self,
        capability_key: str,
        *,
        unit_id: int | None = None,
        zone_key: str | None = None,
    ) -> Device | None:
        devices = self.find_capability_devices(
            capability_key, unit_id=unit_id, zone_key=zone_key
        )
        return devices[0] if devices else None

    def require_capability_device(
        self,
        capability_key: str,
        *,
        unit_id: int | None = None,
        zone_key: str | None = None,
        subject: str | None = None,
    ) -> Device:
        device = self.find_capability_device(
            capability_key, unit_id=unit_id, zone_key=zone_key
        )
        if device is not None:
            return device
        where = subject or (f"unita {unit_id}" if unit_id is not None else f"zona {zone_key}")
        # 409, not 404: the unit exists, the capability simply is not wired yet
        # on the building side. The UI turns this into "azione non disponibile".
        raise HTTPException(
            status_code=409,
            detail=(
                f"Capability '{capability_key}' non disponibile per {where}. "
                "Esegui una sincronizzazione provider o verifica la configurazione VillaCore."
            ),
        )

    def _state_value(self, device: Device) -> dict[str, object]:
        state = (
            self._scoped_query(DeviceState)
            .filter(DeviceState.device_id == device.id)
            .first()
        )
        if state is None:
            return {"online": False, "value": None, "updated_at": None}
        value = state.power_state
        if value is None:
            raw = self._safe_json_loads(state.raw_payload_json)
            candidate = raw.get("state") if isinstance(raw, dict) else None
            value = str(candidate) if candidate is not None else None
        return {
            "online": bool(state.online),
            "value": value,
            "temperature_c": float(state.temperature_c) if state.temperature_c is not None else None,
            "humidity_pct": float(state.humidity_pct) if state.humidity_pct is not None else None,
            "energy_w": float(state.energy_w) if state.energy_w is not None else None,
            "contact_open": state.contact_open,
            "motion_detected": state.motion_detected,
            "leak_detected": state.leak_detected,
            "updated_at": state.updated_at,
        }

    def list_unit_capabilities(self, unit_id: int) -> dict[str, object]:
        """Everything the building side can do for one unit, with live values."""
        unit = self._ensure_unit_visible(unit_id)
        devices = (
            self._scoped_query(Device)
            .filter(Device.unit_id == unit_id, Device.capability_key.isnot(None))
            .order_by(Device.capability_key.asc(), Device.id.asc())
            .all()
        )
        items: list[dict[str, object]] = []
        for device in devices:
            items.append(
                {
                    "capability_key": device.capability_key,
                    "device_id": device.id,
                    "device_name": device.name,
                    "external_id": device.external_id,
                    "category": device.category,
                    "zone_key": device.zone_key,
                    "provider": device.provider,
                    "commands": sorted(self._allowed_commands_for_category(device.category)),
                    "state": self._state_value(device),
                }
            )

        available = {item["capability_key"] for item in items}
        return {
            "unit_id": unit.id,
            "unit_name": unit.name,
            "capabilities": items,
            "workflows": self._describe_unit_workflows(available),
        }
