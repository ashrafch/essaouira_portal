from __future__ import annotations

import re
from typing import Final


def _slug(value: str) -> str:
    cleaned = re.sub(r"[^a-z0-9_.]+", "_", (value or "").strip().lower())
    cleaned = re.sub(r"_+", "_", cleaned).strip("._")
    return cleaned


def _normalize_from_alias(value: str, aliases: dict[str, str], canonical: set[str], *, strict: bool) -> str:
    raw = _slug(value)
    if not raw:
        raise ValueError("taxonomy value required")
    normalized = aliases.get(raw, raw)
    if normalized in canonical:
        return normalized
    if strict:
        raise ValueError(f"unsupported taxonomy value '{value}'")
    return normalized.replace("_", ".")


CANONICAL_EVENT_TYPES: Final[set[str]] = {
    "provider.catalog.synced",
    "provider.sync",
    "provider.webhook.ingested",
    "device.command.requested",
    "device.command.accepted",
    "device.command.executed",
    "device.command.failed",
    "device.command.expired",
    "alert.raised",
    "alert.acknowledged",
    "automation.scene.executed",
    "automation.scene.failed",
    "automation.rule.executed",
    "automation.rule.failed",
}

EVENT_TYPE_ALIASES: Final[dict[str, str]] = {
    "provider_catalog_sync": "provider.catalog.synced",
    "provider_sync": "provider.sync",
    "device_command_requested": "device.command.requested",
    "device_command_accepted": "device.command.accepted",
    "device_command_executed": "device.command.executed",
    "device_command_failed": "device.command.failed",
    "device_command_expired": "device.command.expired",
    "alert_open": "alert.raised",
    "alert_acknowledged": "alert.acknowledged",
    "automation_scene_executed": "automation.scene.executed",
    "automation_scene_failed": "automation.scene.failed",
    "automation_rule_executed": "automation.rule.executed",
    "automation_rule_failed": "automation.rule.failed",
}

CANONICAL_ALERT_TYPES: Final[set[str]] = {
    "sensor.leak_detected",
    "device.battery_low",
    "sensor.contact.opened",
    "device.offline",
    "automation.alert.raised",
    # Raised from VillaCore events: the building reports a protection that
    # tripped, the portal turns it into operational work.
    "unit.climate.safety_stop",
    "facility.alarm.raised",
    "facility.safety_stop",
    "facility.devices.unavailable",
}

ALERT_TYPE_ALIASES: Final[dict[str, str]] = {
    "leak_detected": "sensor.leak_detected",
    "battery_low": "device.battery_low",
    "contact_opened": "sensor.contact.opened",
    "automation_alert": "automation.alert.raised",
    "automation_test": "automation.alert.raised",
    "climate_safety_stop": "unit.climate.safety_stop",
    "facility_alarm": "facility.alarm.raised",
    "facility_safety_stop": "facility.safety_stop",
}

# Events VillaCore pushes to the portal (contract `villacore.event.v1`).
CANONICAL_LINK_EVENTS: Final[set[str]] = {
    "unit.checkin.completed",
    "unit.checkout.completed",
    "unit.ready",
    "unit.housekeeping.changed",
    "unit.climate.safety_stop",
    "unit.devices.unavailable",
    "unit.devices.recovered",
    "facility.state.changed",
    "facility.alarm.raised",
    "facility.alarm.cleared",
    "facility.safety_stop",
    "facility.cycle.completed",
    "facility.devices.unavailable",
    "facility.devices.recovered",
    "water.leak.detected",
    "state.changed",
}

CANONICAL_COMMAND_TYPES: Final[set[str]] = {
    "device.power.on",
    "device.power.off",
    "device.climate.set_mode",
    "device.climate.set_setpoint",
    "device.climate.set_power",
    "device.lock.set_state",
    "device.cover.set_state",
    # Scripted objects: how the portal reaches an orchestration that lives in
    # Home Assistant (unit check-in/out, plant safe-off, alarm rearm) without
    # re-implementing it.
    "device.script.run",
    "device.scene.apply",
    "device.select.set_option",
    "device.number.set_value",
    "device.text.set_value",
    "device.boolean.set_state",
}

COMMAND_TYPE_ALIASES: Final[dict[str, str]] = {
    "power_on": "device.power.on",
    "power_off": "device.power.off",
    "climate_set_mode": "device.climate.set_mode",
    "climate_set_setpoint": "device.climate.set_setpoint",
    "climate_set_power": "device.climate.set_power",
    "lock_set_state": "device.lock.set_state",
    "cover_set_state": "device.cover.set_state",
    "script_run": "device.script.run",
    "scene_apply": "device.scene.apply",
    "select_set_option": "device.select.set_option",
    "number_set_value": "device.number.set_value",
    "text_set_value": "device.text.set_value",
    "boolean_set_state": "device.boolean.set_state",
}

# Unit workflows and facility actions the API exposes. They are *not* provider
# command types: the service layer resolves each one to a capability, finds the
# device implementing it, and dispatches a plain device command. That keeps the
# audit trail, the correlation id and the lifecycle identical for every action.
CANONICAL_UNIT_WORKFLOWS: Final[set[str]] = {
    "checkin",
    "checkout",
    "mark_ready",
    "safe_off",
    "climate_safe_off",
    "lights_off",
    "guest_mode_on",
    "guest_mode_off",
    "lock_entry",
    "unlock_entry",
    "climate_eco",
    "climate_comfort",
    "housekeeping_set",
}

# Housekeeping states the building accepts. They mirror VillaCore's own
# `input_select`, which stays the source of truth for the cleaning state.
CANONICAL_HOUSEKEEPING_STATES: Final[tuple[str, ...]] = ("Da fare", "In corso", "Fatto")

CANONICAL_FACILITY_ACTIONS: Final[set[str]] = {
    "start",
    "stop",
    "safe_off",
    "alarm_reset",
    "set_mode",
    "zone_start",
    "run_all",
}

CANONICAL_SCENE_ACTION_TYPES: Final[set[str]] = {
    "action.dispatch_device_command",
    "action.create_alert",
    "action.create_maintenance_ticket",
    "action.create_staff_task",
}

SCENE_ACTION_TYPE_ALIASES: Final[dict[str, str]] = {
    "device_command": "action.dispatch_device_command",
    "create_alert": "action.create_alert",
    "create_maintenance_ticket": "action.create_maintenance_ticket",
    "create_staff_task": "action.create_staff_task",
}

CANONICAL_RULE_ACTION_TYPES: Final[set[str]] = set(CANONICAL_SCENE_ACTION_TYPES)
RULE_ACTION_TYPE_ALIASES: Final[dict[str, str]] = dict(SCENE_ACTION_TYPE_ALIASES)

CANONICAL_RULE_TRIGGER_TYPES: Final[set[str]] = {
    "manual",
    "booking.checked_in",
    "booking.checked_out",
    "alert.raised",
}

RULE_TRIGGER_TYPE_ALIASES: Final[dict[str, str]] = {
    "booking_checked_in": "booking.checked_in",
    "booking_checked_out": "booking.checked_out",
    "alert_raised": "alert.raised",
}


def normalize_event_type(value: str) -> str:
    return _normalize_from_alias(value, EVENT_TYPE_ALIASES, CANONICAL_EVENT_TYPES, strict=False)


def normalize_alert_type(value: str) -> str:
    try:
        return _normalize_from_alias(value, ALERT_TYPE_ALIASES, CANONICAL_ALERT_TYPES, strict=True)
    except ValueError:
        custom = _slug(value).replace("_", ".")
        if not custom:
            raise
        return f"custom.{custom}"


def normalize_command_type(value: str) -> str:
    return _normalize_from_alias(value, COMMAND_TYPE_ALIASES, CANONICAL_COMMAND_TYPES, strict=True)


def normalize_scene_action_type(value: str) -> str:
    return _normalize_from_alias(value, SCENE_ACTION_TYPE_ALIASES, CANONICAL_SCENE_ACTION_TYPES, strict=True)


def normalize_rule_action_type(value: str) -> str:
    return _normalize_from_alias(value, RULE_ACTION_TYPE_ALIASES, CANONICAL_RULE_ACTION_TYPES, strict=True)


def normalize_rule_trigger_type(value: str) -> str:
    return _normalize_from_alias(value, RULE_TRIGGER_TYPE_ALIASES, CANONICAL_RULE_TRIGGER_TYPES, strict=True)


def is_manual_trigger(trigger_type: str) -> bool:
    return normalize_rule_trigger_type(trigger_type) == "manual"


def normalize_trigger_source(value: str | None) -> str:
    if not value:
        return "manual.api"
    source = _slug(value).replace("_", ".")
    return source or "manual.api"


def is_automatic_trigger_source(value: str | None) -> bool:
    source = normalize_trigger_source(value)
    return source.startswith("auto.") or source in {"system.auto", "orchestrator.auto"}
