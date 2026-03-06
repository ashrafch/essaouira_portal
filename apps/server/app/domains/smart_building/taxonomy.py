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
}

ALERT_TYPE_ALIASES: Final[dict[str, str]] = {
    "leak_detected": "sensor.leak_detected",
    "battery_low": "device.battery_low",
    "contact_opened": "sensor.contact.opened",
    "automation_alert": "automation.alert.raised",
    "automation_test": "automation.alert.raised",
}

CANONICAL_COMMAND_TYPES: Final[set[str]] = {
    "device.power.on",
    "device.power.off",
    "device.climate.set_mode",
    "device.climate.set_setpoint",
    "device.lock.set_state",
}

COMMAND_TYPE_ALIASES: Final[dict[str, str]] = {
    "power_on": "device.power.on",
    "power_off": "device.power.off",
    "climate_set_mode": "device.climate.set_mode",
    "climate_set_setpoint": "device.climate.set_setpoint",
    "lock_set_state": "device.lock.set_state",
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
