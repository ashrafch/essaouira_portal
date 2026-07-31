"""Shared constants for the smart-building service modules.

Extracted verbatim from the former monolithic ``service.py`` so that every
module (and the public facade) reads the same values.
"""

from __future__ import annotations

from datetime import timedelta

SUPPORTED_COMMAND_STATUSES = {"pending", "accepted", "executed", "failed", "expired"}
POWER_CATEGORIES = {"smart_relay", "smart_light", "smart_plug", "relay", "light"}
CLIMATE_CATEGORIES = {"climate_controller", "thermostat", "hvac_controller"}
LOCK_CATEGORIES = {"smart_lock", "lock_controller"}
COVER_CATEGORIES = {"shutter", "cover", "blind", "gate_controller"}
# Scripted objects exposed by Home Assistant. A device in one of these
# categories accepts the matching "set/run" command, nothing else.
SCRIPT_CATEGORIES = {"workflow_script", "unit_workflow", "facility_control", "script"}
SCENE_CATEGORIES = {"scene_preset", "scene"}
SELECT_CATEGORIES = {"option_selector", "facility_mode", "stay_status", "housekeeping_status"}
NUMBER_CATEGORIES = {"numeric_setting"}
TEXT_CATEGORIES = {"text_setting"}
FLAG_CATEGORIES = {"toggle_flag", "guest_mode_flag", "maintenance_lock_flag"}
AUTOMATION_EXECUTION_STATUSES = {"running", "executed", "failed", "partial"}
AUTOMATION_DEDUP_WINDOW = timedelta(minutes=5)
CONNECTIVITY_STATUSES = {"online", "offline", "unknown"}
SUPPORTED_TELEMETRY_METRICS = {
    "temperature",
    "humidity",
    "power",
    "energy",
    "battery",
    "signal",
    "motion",
    "contact",
    # Shared-plant metrics (pool filtration, irrigation): they carry the running
    # cost and the wear of the common infrastructure, not guest comfort.
    "pressure",
    "runtime",
    "flow_rate",
    "water_volume",
    "moisture",
}
TELEMETRY_METRIC_UNITS = {
    "temperature": "C",
    "humidity": "%",
    "power": "W",
    "energy": "kWh",
    "battery": "%",
    "signal": "dBm",
    "motion": "bool",
    "contact": "bool",
    "pressure": "bar",
    "runtime": "h",
    "flow_rate": "L/min",
    "water_volume": "L",
    "moisture": "%",
}
# Capability -> telemetry metric. The capability is what gives a plain number
# its meaning: `sensor.pool_filter_pressure` is only "bar" because
# `metric.pressure` says so.
CAPABILITY_METRIC_PREFIX = "metric."
CAPABILITY_METRIC_TYPES = {
    "metric.temperature": "temperature",
    "metric.humidity": "humidity",
    "metric.power": "power",
    "metric.energy": "energy",
    "metric.energy_daily": "energy",
    "metric.energy_total": "energy",
    "metric.pressure": "pressure",
    "metric.runtime": "runtime",
    "metric.flow_rate": "flow_rate",
    "metric.water_volume": "water_volume",
    "metric.soil_moisture": "moisture",
}
TELEMETRY_INTERVAL_SECONDS = {
    "5m": 5 * 60,
    "15m": 15 * 60,
    "1h": 60 * 60,
    "6h": 6 * 60 * 60,
    "1d": 24 * 60 * 60,
}
TELEMETRY_INSIGHT_TYPES = {
    "telemetry.temperature_abnormal",
    "telemetry.humidity_abnormal",
    "telemetry.energy_spike",
    "telemetry.device_not_reporting",
    "telemetry.sensor_value_out_of_range",
}
SMART_MAINTENANCE_KEYWORDS = {
    "smart",
    "sensor",
    "sensore",
    "device",
    "offline",
    "leak",
    "domot",
    "automation",
    "automazione",
}
READINESS_STATUSES = {"READY", "NEEDS_ATTENTION", "BLOCKED", "UNKNOWN"}
BLOCKING_MAINTENANCE_PRIORITIES = {"urgent"}
BLOCKING_MAINTENANCE_KEYWORDS = {"blocking", "bloccante", "unsafe", "perdita", "allag", "non abitabile"}
# Guided onboarding sequence. `map_zones` replaced per-device assignment: the
# link binds a whole building zone to a unit, so assigning devices one by one was
# both tedious and easy to get wrong (a single click could attach every villa
# device to one apartment). Manual per-device assignment still exists as an
# escape hatch on the devices page and through /setup/assign-devices.
SETUP_STEPS = (
    "property",
    "units",
    "connect_provider",
    "import_devices",
    "map_zones",
    "enable_automations",
    "complete",
)
AUTOMATION_TEMPLATE_KEYS = {
    "basic_hospitality_pack",
    "energy_saver_pack",
    "leak_protection_pack",
}

SCENARIO_PACK_DEFINITIONS = {
    "basic_hospitality_pack": {
        "name": "Hospitality Basic Pack",
        "description": "Baseline smart reactions per check-in/check-out con visibilita operativa.",
        "supported_now": True,
        "includes": [
            "welcome_scene_placeholder",
            "rule: booking.checked_in -> alert",
            "rule: booking.checked_out -> alert",
        ],
        "notes": [
            "Scene creata come placeholder manuale, senza controllo diretto hardware.",
        ],
    },
    "energy_saver_pack": {
        "name": "Energy Saver Pack",
        "description": "Baseline risparmio energetico al checkout.",
        "supported_now": True,
        "includes": [
            "rule: booking.checked_out -> alert",
        ],
        "notes": [
            "Trigger vacancy/no-motion avanzati richiedono telemetria estesa (fase successiva).",
        ],
    },
    "leak_protection_pack": {
        "name": "Leak Protection Pack",
        "description": "Hardening reazioni leak su alert smart.",
        "supported_now": True,
        "includes": [
            "rule: alert.raised(leak) -> maintenance ticket",
        ],
        "notes": [],
    },
}
