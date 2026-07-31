from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from app.domains.smart_building.providers.base import ProviderDeviceSnapshot, ProviderStateSnapshot


DOMAIN_CATEGORY_MAP: dict[str, str] = {
    "switch": "smart_relay",
    "light": "smart_light",
    "climate": "climate_controller",
    "lock": "smart_lock",
    "sensor": "temperature_humidity_sensor",
    "binary_sensor": "motion_sensor",
    # Domains a scripted Home Assistant setup exposes as controllable objects.
    # Without these they would all land on "unknown" and refuse every command.
    "cover": "shutter",
    "script": "workflow_script",
    "scene": "scene_preset",
    "timer": "timer",
    "input_boolean": "toggle_flag",
    "input_select": "option_selector",
    "input_number": "numeric_setting",
    "number": "numeric_setting",
    "input_text": "text_setting",
    "input_datetime": "schedule_setting",
}

BINARY_SENSOR_DEVICE_CLASS_MAP: dict[str, str] = {
    "motion": "motion_sensor",
    "door": "door_window_sensor",
    "window": "door_window_sensor",
    "opening": "door_window_sensor",
    "leak": "leak_sensor",
    "moisture": "leak_sensor",
}

SENSOR_DEVICE_CLASS_MAP: dict[str, str] = {
    "temperature": "temperature_humidity_sensor",
    "humidity": "temperature_humidity_sensor",
    "power": "energy_meter",
    "energy": "energy_meter",
    "pressure": "pressure_sensor",
    "moisture": "moisture_sensor",
    "water": "water_meter",
    "volume": "water_meter",
    "duration": "runtime_meter",
}

# Default allowlist for the generic Home Assistant provider. It stays
# conservative on purpose; the VillaCore provider widens it from its profile.
SUPPORTED_ENTITY_DOMAINS = {"switch", "light", "climate", "lock", "sensor", "binary_sensor"}


def parse_entity_domain(entity_id: str) -> str:
    return (entity_id.split(".", 1)[0] if entity_id and "." in entity_id else "").strip().lower()


def to_float(value: Any) -> float | None:
    try:
        if value is None:
            return None
        return float(value)
    except (TypeError, ValueError):
        return None


def to_int(value: Any) -> int | None:
    try:
        if value is None:
            return None
        return int(value)
    except (TypeError, ValueError):
        return None


def parse_timestamp(value: Any) -> datetime | None:
    if not isinstance(value, str) or not value.strip():
        return None
    raw = value.strip()
    try:
        if raw.endswith("Z"):
            return datetime.fromisoformat(raw.replace("Z", "+00:00")).astimezone(timezone.utc)
        parsed = datetime.fromisoformat(raw)
        if parsed.tzinfo is None:
            return parsed.replace(tzinfo=timezone.utc)
        return parsed.astimezone(timezone.utc)
    except ValueError:
        return None


def map_entity_to_category(entity: dict[str, Any]) -> str:
    entity_id = str(entity.get("entity_id", "")).strip().lower()
    domain = parse_entity_domain(entity_id)
    attrs = entity.get("attributes", {}) if isinstance(entity.get("attributes"), dict) else {}
    device_class = str(attrs.get("device_class", "")).strip().lower()
    if domain == "binary_sensor":
        return BINARY_SENSOR_DEVICE_CLASS_MAP.get(device_class, "binary_sensor")
    if domain == "sensor":
        return SENSOR_DEVICE_CLASS_MAP.get(device_class, "sensor")
    return DOMAIN_CATEGORY_MAP.get(domain, "unknown")


def map_entity_to_state(entity: dict[str, Any]) -> ProviderStateSnapshot:
    attrs = entity.get("attributes", {}) if isinstance(entity.get("attributes"), dict) else {}
    state_value = str(entity.get("state", "")).strip().lower()
    domain = parse_entity_domain(str(entity.get("entity_id", "")))
    online = state_value not in {"", "unavailable", "unknown"}

    motion = None
    contact_open = None
    leak = None
    power_state = None

    if domain in {"switch", "light"}:
        power_state = "on" if state_value == "on" else "off" if state_value else None
    elif domain == "binary_sensor":
        device_class = str(attrs.get("device_class", "")).strip().lower()
        if device_class in {"motion", "occupancy"}:
            motion = state_value in {"on", "true", "detected"}
        elif device_class in {"door", "window", "opening"}:
            contact_open = state_value in {"on", "open", "true"}
        elif device_class in {"leak", "moisture"}:
            leak = state_value in {"on", "wet", "true"}
    elif domain == "lock":
        if state_value in {"locked", "unlocked"}:
            power_state = state_value
    elif domain == "climate":
        power_state = state_value if state_value else None

    temperature = to_float(attrs.get("current_temperature"))
    if temperature is None and str(attrs.get("unit_of_measurement", "")).strip().lower() in {"c", "°c"}:
        temperature = to_float(entity.get("state"))

    humidity = to_float(attrs.get("current_humidity"))
    if humidity is None and str(attrs.get("unit_of_measurement", "")).strip() == "%":
        humidity = to_float(entity.get("state"))

    energy_w = to_float(attrs.get("power"))
    if energy_w is None:
        device_class = str(attrs.get("device_class", "")).strip().lower()
        unit_measure = str(attrs.get("unit_of_measurement", "")).strip().lower()
        if device_class == "power" or unit_measure in {"w", "kw"}:
            raw_value = to_float(entity.get("state"))
            if raw_value is not None:
                energy_w = raw_value * 1000 if unit_measure == "kw" else raw_value

    battery = to_int(attrs.get("battery"))
    if battery is None:
        battery = to_int(attrs.get("battery_level"))
    signal = to_int(attrs.get("rssi"))

    return ProviderStateSnapshot(
        online=online,
        power_state=power_state,
        motion_detected=motion,
        contact_open=contact_open,
        leak_detected=leak,
        temperature_c=temperature,
        humidity_pct=humidity,
        energy_w=energy_w,
        signal_rssi=signal,
        raw_payload=entity,
        observed_at=parse_timestamp(entity.get("last_changed")) or datetime.now(timezone.utc),
    )


def map_entity_to_device(
    entity: dict[str, Any],
    *,
    unit_hint_by_entity: dict[str, str],
) -> ProviderDeviceSnapshot:
    entity_id = str(entity.get("entity_id", "")).strip()
    attrs = entity.get("attributes", {}) if isinstance(entity.get("attributes"), dict) else {}
    state = map_entity_to_state(entity)
    category = map_entity_to_category(entity)
    health_status = "healthy" if state.online else "degraded"
    friendly_name = str(attrs.get("friendly_name") or entity_id)
    model = str(attrs.get("model") or attrs.get("device_model") or "") or None
    manufacturer = str(attrs.get("manufacturer") or attrs.get("attribution") or "") or None

    return ProviderDeviceSnapshot(
        external_id=entity_id,
        name=friendly_name[:128],
        category=category,
        model=model[:128] if model else None,
        manufacturer=manufacturer[:128] if manufacturer else None,
        zone_name=str(attrs.get("area_name") or attrs.get("room") or "")[:128] or None,
        unit_hint=unit_hint_by_entity.get(entity_id),
        is_active=True,
        health_status=health_status,
        battery_level=to_int(attrs.get("battery")) or to_int(attrs.get("battery_level")),
        state=state,
    )
