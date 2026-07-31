"""Shared facilities: pool, irrigation, gate, outdoor lighting, energy.

These are not rental units, but they are property management: they cost money,
they break, and when they break a guest notices. So the portal owns their
**asset view** — status, alarms, runtime, cost, work orders — while the control
logic stays where the interlocks are, in VillaCore.

Deliberately read-heavy. Only two actions are exposed:

* ``safe_off``    — bring the plant to its safe state;
* ``alarm_reset`` — rearm after a fault, so the person who acknowledged the
  alert is the one who rearms it, with an audit trail.

Mode changes, manual pump/zone starts, timers and setpoints are **not** exposed:
Home Assistant does them better and safer, and duplicating them would invite
commanding machinery from a system that has no physical interlocks. VillaCore
refuses a rearm while a thermal trip is active — the portal shows the refusal
instead of working around it.
"""

from __future__ import annotations

from fastapi import HTTPException

from app.domains.smart_building.providers.villacore_classifier import ZONE_KIND_FACILITY
from app.domains.smart_building.schemas import DeviceCommandCreate
from app.domains.smart_building.taxonomy import CANONICAL_FACILITY_ACTIONS
from app.models.smart_building import Alert, Device

# action -> (capability, command type, static payload, needs confirmation)
FACILITY_ACTION_SPECS: dict[str, tuple[str, str, dict, bool]] = {
    "safe_off": ("facility.safe_off", "device.script.run", {}, True),
    "alarm_reset": ("facility.alarm_reset", "device.script.run", {}, True),
}

FACILITY_ACTION_LABELS = {
    "safe_off": "Arresto sicuro",
    "alarm_reset": "Riarmo allarme",
}

# Capabilities rendered as the facility's own status block.
STATUS_CAPABILITIES = (
    "facility.state",
    "facility.mode",
    "facility.supervision",
    "facility.alarm",
    "sensor.availability",
)

# Read-only interlock feedback: shown so the operator understands *why* an
# action was refused, never as something the portal can override.
INTERLOCK_PREFIX = "interlock."
METRIC_PREFIX = "metric."


class FacilitiesMixin:
    """Read model and the two safe actions for shared plants."""

    # --- helpers -----------------------------------------------------------
    def _facility_devices(self, facility_key: str | None = None) -> list[Device]:
        query = self._scoped_query(Device).filter(Device.facility_key.isnot(None))
        if facility_key is not None:
            query = query.filter(Device.facility_key == facility_key.strip().lower())
        devices = query.order_by(Device.facility_key.asc(), Device.id.asc()).all()
        # Same precedence as capability dispatch: the active link provider wins
        # over leftovers from another provider, so the status block and the
        # commands always describe the same device.
        preferred = self._preferred_provider()
        return sorted(
            devices,
            key=lambda device: (
                device.facility_key or "",
                0 if (device.provider or "").strip().lower() == preferred else 1,
                device.id,
            ),
        )

    def _facility_keys(self) -> list[str]:
        zone_map = self.get_zone_map()
        from_devices = {
            device.facility_key for device in self._facility_devices() if device.facility_key
        }
        from_profile = {
            key for key, entry in zone_map.items() if entry.get("kind") == ZONE_KIND_FACILITY
        }
        # Only facilities that actually have devices are listed: an empty plant
        # would be noise, and the profile knows about future milestones too.
        return sorted(from_devices & from_profile or from_devices)

    def _binary_state(self, device: Device, *, truthy: set[str]) -> bool | None:
        """Read a boolean-ish device state.

        A Home Assistant ``binary_sensor`` without a ``device_class`` populates
        none of the typed columns, so the raw reported value is the only source:
        ``_state_value`` already falls back to it.
        """
        state = self._state_value(device)
        raw = state.get("value")
        if raw is None:
            return None
        normalized = str(raw).strip().lower()
        if not normalized or normalized in {"unknown", "unavailable"}:
            return None
        return normalized in truthy

    def _facility_alarm_state(self, devices: list[Device]) -> dict[str, object]:
        alarm_device = next(
            (device for device in devices if device.capability_key == "facility.alarm"), None
        )
        if alarm_device is None:
            return {"active": None, "device_id": None}
        active = self._binary_state(
            alarm_device, truthy={"on", "true", "detected", "active", "alarm"}
        )
        return {"active": active, "device_id": alarm_device.id}

    def _facility_status_value(self, devices: list[Device], capability: str) -> object:
        device = next((d for d in devices if d.capability_key == capability), None)
        if device is None:
            return None
        return self._state_value(device).get("value")

    # --- read model --------------------------------------------------------
    def _build_facility(self, facility_key: str) -> dict[str, object]:
        devices = self._facility_devices(facility_key)
        zone_entry = self.get_zone_map().get(facility_key, {})

        availability_device = next(
            (d for d in devices if d.capability_key == "sensor.availability"), None
        )
        available: bool | None = None
        if availability_device is not None:
            available = self._binary_state(
                availability_device, truthy={"on", "true", "connected", "available"}
            )

        alarm = self._facility_alarm_state(devices)
        metrics = []
        interlocks = []
        for device in devices:
            capability = device.capability_key or ""
            if capability.startswith(METRIC_PREFIX):
                state = self._state_value(device)
                metrics.append(
                    {
                        "capability_key": capability,
                        "metric_type": capability[len(METRIC_PREFIX) :],
                        "device_id": device.id,
                        "device_name": device.name,
                        "value": state.get("value"),
                        "temperature_c": state.get("temperature_c"),
                        "energy_w": state.get("energy_w"),
                        "online": state.get("online"),
                        "updated_at": state.get("updated_at"),
                    }
                )
            elif capability.startswith(INTERLOCK_PREFIX):
                state = self._state_value(device)
                interlocks.append(
                    {
                        "capability_key": capability,
                        "name": capability[len(INTERLOCK_PREFIX) :],
                        "device_id": device.id,
                        "device_name": device.name,
                        "value": state.get("value"),
                        "online": state.get("online"),
                    }
                )

        open_alerts = (
            self._scoped_query(Alert)
            .filter(
                Alert.status == "open",
                Alert.device_id.in_([device.id for device in devices]) if devices else False,
            )
            .order_by(Alert.last_seen_at.desc(), Alert.id.desc())
            .all()
            if devices
            else []
        )

        state_value = self._facility_status_value(devices, "facility.state")
        health = "unknown"
        if alarm.get("active") is True:
            health = "alarm"
        elif available is False:
            health = "unavailable"
        elif state_value is not None:
            health = "ok"

        available_capabilities = {device.capability_key for device in devices}
        return {
            "facility_key": facility_key,
            "display_name": zone_entry.get("display_name") or facility_key.title(),
            "machine": zone_entry.get("machine"),
            "health": health,
            "state": state_value,
            "mode": self._facility_status_value(devices, "facility.mode"),
            "supervision_state": self._facility_status_value(devices, "facility.supervision"),
            "alarm_active": alarm.get("active"),
            "devices_available": available,
            "device_count": len(devices),
            "metrics": metrics,
            "interlocks": interlocks,
            "open_alerts": [
                {
                    "id": alert.id,
                    "alert_type": alert.alert_type,
                    "severity": alert.severity,
                    "title": alert.title,
                    "last_seen_at": alert.last_seen_at,
                }
                for alert in open_alerts
            ],
            "actions": [
                {
                    "action": key,
                    "label": FACILITY_ACTION_LABELS[key],
                    "capability_key": capability,
                    "available": capability in available_capabilities,
                    "needs_confirmation": needs_confirmation,
                }
                for key, (capability, _, _, needs_confirmation) in FACILITY_ACTION_SPECS.items()
            ],
        }

    def list_facilities(self) -> list[dict[str, object]]:
        return [self._build_facility(key) for key in self._facility_keys()]

    def get_facility(self, facility_key: str) -> dict[str, object]:
        normalized = (facility_key or "").strip().lower()
        if normalized not in self._facility_keys():
            raise HTTPException(status_code=404, detail="Impianto non trovato")
        return self._build_facility(normalized)

    # --- actions -----------------------------------------------------------
    def run_facility_action(
        self,
        facility_key: str,
        action: str,
        *,
        requested_by: str | None = None,
        correlation_id: str | None = None,
    ) -> dict[str, object]:
        self._require_write_access()
        normalized_action = (action or "").strip().lower()
        if normalized_action not in FACILITY_ACTION_SPECS:
            if normalized_action in CANONICAL_FACILITY_ACTIONS:
                # Known VillaCore action, intentionally not exposed here.
                raise HTTPException(
                    status_code=400,
                    detail=(
                        f"L'azione '{normalized_action}' resta in Home Assistant: il portale "
                        "espone solo arresto sicuro e riarmo allarme."
                    ),
                )
            raise HTTPException(status_code=400, detail=f"Azione '{action}' non supportata")

        facility = self.get_facility(facility_key)
        capability, command_type, static_payload, _ = FACILITY_ACTION_SPECS[normalized_action]
        device = self.require_capability_device(
            capability,
            zone_key=facility["facility_key"],
            subject=f"impianto '{facility['display_name']}'",
        )

        effective_correlation_id = self._make_correlation_id(correlation_id)
        payload = dict(static_payload)
        if command_type == "device.script.run":
            payload["variables"] = {
                "correlation_id": effective_correlation_id,
                "source": "hostara.portal",
            }

        command = self.create_device_command(
            device.id,
            DeviceCommandCreate(command_type=command_type, payload=payload, ttl_seconds=300),
            requested_by=requested_by,
            correlation_id=effective_correlation_id,
        )

        return {
            "facility_key": facility["facility_key"],
            "display_name": facility["display_name"],
            "action": normalized_action,
            "label": FACILITY_ACTION_LABELS[normalized_action],
            "capability_key": capability,
            "device_id": device.id,
            "command_id": command.id,
            "status": command.status,
            "accepted": command.status in {"accepted", "executed"},
            # Interlocks live in VillaCore: a refusal is a legitimate outcome
            # and must reach the operator unchanged.
            "error_message": command.error_message,
            "correlation_id": effective_correlation_id,
        }
