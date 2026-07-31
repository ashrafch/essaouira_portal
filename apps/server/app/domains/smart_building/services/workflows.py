"""Unit workflows: the portal asks, VillaCore executes.

A workflow is a business intention — "this guest is arriving", "this stay is
over" — dispatched to the orchestration that already lives in Home Assistant
(``script.a1_check_in`` and friends). The portal deliberately does not
re-implement it: VillaCore keeps the safety conditions (open window, invalid
temperature sensor, unavailable devices) and stays free to change them.

Everything goes through the normal device-command lifecycle, so a workflow gets
the same audit trail, correlation id and failure reporting as any other
command. When Home Assistant refuses, the refusal is surfaced verbatim rather
than retried or hidden.
"""

from __future__ import annotations

from fastapi import HTTPException

from app.domains.smart_building.schemas import DeviceCommandCreate
from app.domains.smart_building.taxonomy import (
    CANONICAL_UNIT_WORKFLOWS,
    normalize_trigger_source,
)
from app.models.booking import Booking
from app.models.smart_building import Device, DeviceCommand

# workflow key -> candidate implementations, best first.
#
# A dedicated VillaCore script always wins over poking the underlying helper:
# the script carries the safety conditions and the notifications, flipping an
# input_boolean would bypass them. The helper is only the fallback for a site
# that does not define the script.
WORKFLOW_SPECS: dict[str, tuple[tuple[str, str, dict], ...]] = {
    "checkin": (("workflow.checkin", "device.script.run", {}),),
    "checkout": (("workflow.checkout", "device.script.run", {}),),
    "mark_ready": (("workflow.mark_ready", "device.script.run", {}),),
    "safe_off": (("workflow.safe_off", "device.script.run", {}),),
    "climate_safe_off": (("workflow.climate_safe_off", "device.script.run", {}),),
    "lights_off": (("workflow.lights_off", "device.script.run", {}),),
    "guest_mode_on": (
        ("workflow.guest_mode_on", "device.script.run", {}),
        ("flag.guest_mode", "device.boolean.set_state", {"target": "on"}),
    ),
    "guest_mode_off": (
        ("workflow.guest_mode_off", "device.script.run", {}),
        ("flag.guest_mode", "device.boolean.set_state", {"target": "off"}),
    ),
}

WORKFLOW_LABELS: dict[str, str] = {
    "checkin": "Check-in",
    "checkout": "Check-out",
    "mark_ready": "Segna pronto",
    "safe_off": "Spegnimento sicuro",
    "climate_safe_off": "Arresto clima",
    "lights_off": "Spegni luci",
    "guest_mode_on": "Attiva modalita ospite",
    "guest_mode_off": "Disattiva modalita ospite",
}

# Workflows an operator can trigger without extra confirmation in the UI.
WORKFLOW_DESTRUCTIVE = {"checkout", "safe_off", "climate_safe_off", "lights_off"}


class WorkflowsMixin:
    """Dispatch of unit-level workflows onto building capabilities."""

    # --- description -------------------------------------------------------
    def _describe_unit_workflows(self, available_capabilities: set[str]) -> list[dict[str, object]]:
        rows: list[dict[str, object]] = []
        for key, candidates in WORKFLOW_SPECS.items():
            chosen = next(
                (c for c in candidates if c[0] in available_capabilities),
                candidates[0],
            )
            capability, command_type, _ = chosen
            rows.append(
                {
                    "workflow": key,
                    "label": WORKFLOW_LABELS[key],
                    "capability_key": capability,
                    "command_type": command_type,
                    "available": capability in available_capabilities,
                    "needs_confirmation": key in WORKFLOW_DESTRUCTIVE,
                }
            )
        return rows

    def _resolve_workflow_candidate(
        self, key: str, unit_id: int, unit_name: str
    ) -> tuple[Device, str, dict]:
        candidates = WORKFLOW_SPECS[key]
        for capability, command_type, static_payload in candidates:
            device = self.find_capability_device(capability, unit_id=unit_id)
            if device is not None:
                return device, command_type, dict(static_payload)
        # Nothing implements this workflow: report the preferred capability, it
        # is the one the operator should wire up in VillaCore.
        preferred_capability = candidates[0][0]
        return (
            self.require_capability_device(
                preferred_capability, unit_id=unit_id, subject=f"unita '{unit_name}'"
            ),
            candidates[0][1],
            dict(candidates[0][2]),
        )

    # --- dispatch ----------------------------------------------------------
    def _booking_workflow_variables(self, booking: Booking | None) -> dict[str, object]:
        if booking is None:
            return {}
        guests = int(booking.num_adults or 0) + int(booking.num_children or 0)
        variables: dict[str, object] = {
            "booking_ref": f"BK-{booking.id}",
            "guest_name": (booking.guest_name or "")[:64],
            "guests": guests or 1,
        }
        if booking.estimated_arrival_time is not None:
            variables["arrival_time"] = booking.estimated_arrival_time.strftime("%H:%M")
        return variables

    def run_unit_workflow(
        self,
        unit_id: int,
        workflow: str,
        *,
        booking_id: int | None = None,
        variables: dict | None = None,
        requested_by: str | None = None,
        correlation_id: str | None = None,
        trigger_source: str = "manual.api",
    ) -> dict[str, object]:
        self._require_write_access()
        key = (workflow or "").strip().lower()
        if key not in CANONICAL_UNIT_WORKFLOWS or key not in WORKFLOW_SPECS:
            raise HTTPException(status_code=400, detail=f"Workflow '{workflow}' non supportato")

        unit = self._ensure_unit_visible(unit_id)
        device, command_type, static_payload = self._resolve_workflow_candidate(
            key, unit_id, unit.name
        )
        capability = device.capability_key or WORKFLOW_SPECS[key][0][0]

        booking: Booking | None = None
        if booking_id is not None:
            booking = self.db.query(Booking).filter(Booking.id == booking_id).first()
            if booking is None:
                raise HTTPException(status_code=404, detail="Prenotazione non trovata")
            if booking.unit_id != unit_id:
                raise HTTPException(
                    status_code=400, detail="La prenotazione non appartiene a questa unita"
                )

        effective_correlation_id = self._make_correlation_id(correlation_id)
        payload: dict[str, object] = dict(static_payload)
        if command_type == "device.script.run":
            script_variables: dict[str, object] = {
                "correlation_id": effective_correlation_id,
                "source": "hostara.portal",
            }
            script_variables.update(self._booking_workflow_variables(booking))
            for name, value in (variables or {}).items():
                clean_name = str(name).strip()
                if clean_name:
                    script_variables[clean_name] = value
            payload["variables"] = script_variables

        command = self.create_device_command(
            device.id,
            DeviceCommandCreate(command_type=command_type, payload=payload, ttl_seconds=300),
            requested_by=requested_by,
            correlation_id=effective_correlation_id,
        )

        return {
            "unit_id": unit.id,
            "unit_name": unit.name,
            "workflow": key,
            "label": WORKFLOW_LABELS[key],
            "capability_key": capability,
            "device_id": device.id,
            "device_name": device.name,
            "external_id": device.external_id,
            "command_id": command.id,
            "command_type": command.command_type,
            "status": command.status,
            "accepted": command.status in {"accepted", "executed"},
            # A refusal from the building side (local interlock, unavailable
            # device) travels back untouched instead of being swallowed.
            "error_message": command.error_message,
            "correlation_id": effective_correlation_id,
            "trigger_source": normalize_trigger_source(trigger_source),
            "booking_id": booking.id if booking else None,
        }

    def list_unit_workflow_history(
        self, unit_id: int, limit: int = 20
    ) -> list[DeviceCommand]:
        """Recent workflow commands for a unit, newest first."""
        self._ensure_unit_visible(unit_id)
        workflow_capabilities = {
            capability
            for candidates in WORKFLOW_SPECS.values()
            for capability, _, _ in candidates
        }
        device_ids = [
            device.id
            for device in self._scoped_query_devices_for_capabilities(
                workflow_capabilities, unit_id=unit_id
            )
        ]
        if not device_ids:
            return []
        return (
            self._scoped_query(DeviceCommand)
            .filter(DeviceCommand.device_id.in_(device_ids))
            .order_by(DeviceCommand.requested_at.desc(), DeviceCommand.id.desc())
            .limit(max(1, min(limit, 100)))
            .all()
        )

    def _scoped_query_devices_for_capabilities(
        self, capabilities: set[str], *, unit_id: int | None = None
    ) -> list[Device]:
        query = self._scoped_query(Device).filter(Device.capability_key.in_(sorted(capabilities)))
        if unit_id is not None:
            query = query.filter(Device.unit_id == unit_id)
        return query.order_by(Device.id.asc()).all()
