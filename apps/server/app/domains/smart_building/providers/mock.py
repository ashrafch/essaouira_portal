from __future__ import annotations

import random
from datetime import datetime, timezone

from app.domains.smart_building.providers.base import (
    ProviderCommandRequest,
    ProviderCommandResult,
    ProviderDeviceSnapshot,
    ProviderStateSnapshot,
    ProviderWebhookEvent,
    SmartDeviceProvider,
)


class MockSmartDeviceProvider(SmartDeviceProvider):
    provider_name = "mock"
    supports_catalog_sync = True
    supports_webhook_ingest = True
    supports_command_execution = True

    # Mirrors the shape a VillaCore site exposes — units with a workflow and a
    # shared plant with a state machine — so capabilities, unit workflows and
    # facility actions stay testable without any Home Assistant instance.
    _mock_catalog = [
        {"external_id": "mock-unit-a-temp-1", "name": "Unit A Temp Sensor", "category": "temperature_humidity_sensor", "zone_name": "Unit A - Living", "unit_hint": "unit a", "zone_key": "a1", "capability_key": "metric.temperature", "metric_type": "temperature"},
        {"external_id": "mock-unit-a-door-1", "name": "Unit A Door Sensor", "category": "door_window_sensor", "zone_name": "Unit A - Entry", "unit_hint": "unit a", "zone_key": "a1", "capability_key": "contact.entry_door"},
        {"external_id": "mock-unit-a-checkin", "name": "Unit A Check-in", "category": "unit_workflow", "zone_name": "Unit A", "unit_hint": "unit a", "zone_key": "a1", "capability_key": "workflow.checkin"},
        {"external_id": "mock-unit-a-checkout", "name": "Unit A Check-out", "category": "unit_workflow", "zone_name": "Unit A", "unit_hint": "unit a", "zone_key": "a1", "capability_key": "workflow.checkout"},
        {"external_id": "mock-unit-a-ready", "name": "Unit A Mark Ready", "category": "unit_workflow", "zone_name": "Unit A", "unit_hint": "unit a", "zone_key": "a1", "capability_key": "workflow.mark_ready"},
        {"external_id": "mock-unit-a-guest-mode", "name": "Unit A Guest Mode", "category": "guest_mode_flag", "zone_name": "Unit A", "unit_hint": "unit a", "zone_key": "a1", "capability_key": "flag.guest_mode"},
        {"external_id": "mock-unit-a-stay", "name": "Unit A Stay Status", "category": "stay_status", "zone_name": "Unit A", "unit_hint": "unit a", "zone_key": "a1", "capability_key": "status.stay"},
        {"external_id": "mock-unit-b-motion-1", "name": "Unit B Motion Sensor", "category": "motion_sensor", "zone_name": "Unit B - Hall", "unit_hint": "unit b", "zone_key": "a2", "capability_key": "sensor.motion"},
        {"external_id": "mock-unit-c-leak-1", "name": "Unit C Leak Sensor", "category": "leak_sensor", "zone_name": "Unit C - Bathroom", "unit_hint": "unit c", "zone_key": "a3", "capability_key": "sensor.leak"},
        {"external_id": "mock-pool-relay-1", "name": "Pool Pump Relay", "category": "smart_relay", "zone_name": "Pool Plant Room", "unit_hint": None, "zone_key": "pool", "facility_key": "pool", "capability_key": "facility.request"},
        {"external_id": "mock-pool-state", "name": "Pool Filtration State", "category": "facility_state", "zone_name": "Pool Plant Room", "unit_hint": None, "zone_key": "pool", "facility_key": "pool", "capability_key": "facility.state"},
        {"external_id": "mock-pool-alarm", "name": "Pool Alarm", "category": "facility_alarm", "zone_name": "Pool Plant Room", "unit_hint": None, "zone_key": "pool", "facility_key": "pool", "capability_key": "facility.alarm"},
        {"external_id": "mock-pool-safe-off", "name": "Pool Safe Off", "category": "facility_control", "zone_name": "Pool Plant Room", "unit_hint": None, "zone_key": "pool", "facility_key": "pool", "capability_key": "facility.safe_off"},
        {"external_id": "mock-pool-alarm-reset", "name": "Pool Alarm Reset", "category": "facility_control", "zone_name": "Pool Plant Room", "unit_hint": None, "zone_key": "pool", "facility_key": "pool", "capability_key": "facility.alarm_reset"},
        {"external_id": "mock-garden-meter-1", "name": "Garden Energy Meter", "category": "energy_meter", "zone_name": "Garden", "unit_hint": None, "zone_key": "garden", "facility_key": "garden", "capability_key": "metric.energy", "metric_type": "energy"},
    ]

    def pull_state(self, external_id: str) -> ProviderStateSnapshot:
        seeded = sum(ord(c) for c in external_id)
        random.seed(seeded + int(datetime.now(timezone.utc).timestamp() // 60))

        online = random.random() > 0.08
        temperature = round(19 + random.random() * 8, 2)
        humidity = round(35 + random.random() * 35, 2)
        energy = round(random.random() * 1800, 2)
        battery = 35 + int(random.random() * 65)

        return ProviderStateSnapshot(
            online=online,
            power_state="on" if online and random.random() > 0.5 else "off",
            motion_detected=online and random.random() > 0.75,
            contact_open=online and random.random() > 0.85,
            leak_detected=online and random.random() > 0.98,
            temperature_c=temperature if online else None,
            humidity_pct=humidity if online else None,
            energy_w=energy if online else None,
            signal_rssi=-40 - int(random.random() * 45) if online else None,
            raw_payload={"external_id": external_id, "mode": "simulated", "battery_level": battery},
            observed_at=datetime.now(timezone.utc),
        )

    def list_devices(self, tenant_id: str) -> list[ProviderDeviceSnapshot]:
        snapshots: list[ProviderDeviceSnapshot] = []
        for d in self._mock_catalog:
            state = self.pull_state(d["external_id"])
            snapshots.append(
                ProviderDeviceSnapshot(
                    external_id=d["external_id"],
                    name=d["name"],
                    category=d["category"],
                    model="Mock v1",
                    manufacturer="Mock Provider",
                    zone_name=d["zone_name"],
                    unit_hint=d["unit_hint"],
                    is_active=True,
                    health_status="healthy" if state.online else "degraded",
                    battery_level=state.raw_payload.get("battery_level") if state.raw_payload else None,
                    state=state,
                    zone_key=d.get("zone_key"),
                    capability_key=d.get("capability_key"),
                    facility_key=d.get("facility_key"),
                    metric_type=d.get("metric_type"),
                )
            )
        return snapshots

    def parse_webhook(self, payload: dict[str, object]) -> ProviderWebhookEvent | None:
        external_id = payload.get("external_id")
        event_type = payload.get("event_type")
        if not external_id or not event_type:
            return None
        severity = str(payload.get("severity", "info"))
        raw = payload.get("payload")
        event_payload = raw if isinstance(raw, dict) else {}
        return ProviderWebhookEvent(
            external_id=str(external_id),
            event_type=str(event_type),
            severity=severity,
            payload=event_payload,
            occurred_at=datetime.now(timezone.utc),
        )

    def execute_command(self, request: ProviderCommandRequest) -> ProviderCommandResult:
        command_type = request.command_type
        payload = request.payload or {}
        provider_ref = f"mock-cmd-{int(datetime.now(timezone.utc).timestamp() * 1000)}"

        if command_type in {"device.power.on", "device.power.off", "power_on", "power_off"}:
            return ProviderCommandResult(
                accepted=True,
                lifecycle_status="executed",
                provider_ref=provider_ref,
                executed=True,
                result_payload={
                    "power_state": "on"
                    if command_type in {"device.power.on", "power_on"}
                    else "off"
                },
            )

        if command_type in {"device.climate.set_mode", "climate_set_mode"}:
            mode = str(payload.get("mode", "")).strip().lower()
            if mode not in {"off", "heat", "cool", "eco", "auto"}:
                return ProviderCommandResult(
                    accepted=False,
                    lifecycle_status="failed",
                    provider_ref=provider_ref,
                    error_message="Unsupported climate mode",
                )
            return ProviderCommandResult(
                accepted=True,
                lifecycle_status="executed",
                provider_ref=provider_ref,
                executed=True,
                result_payload={"mode": mode},
            )

        if command_type in {"device.climate.set_setpoint", "climate_set_setpoint"}:
            try:
                setpoint_c = float(payload.get("setpoint_c"))
            except (TypeError, ValueError):
                return ProviderCommandResult(
                    accepted=False,
                    lifecycle_status="failed",
                    provider_ref=provider_ref,
                    error_message="Invalid setpoint_c",
                )
            return ProviderCommandResult(
                accepted=True,
                lifecycle_status="executed",
                provider_ref=provider_ref,
                executed=True,
                result_payload={"setpoint_c": setpoint_c},
            )

        if command_type in {"device.lock.set_state", "lock_set_state"}:
            target = str(payload.get("target", "")).strip().lower()
            if target not in {"lock", "unlock"}:
                return ProviderCommandResult(
                    accepted=False,
                    lifecycle_status="failed",
                    provider_ref=provider_ref,
                    error_message="Invalid lock target",
                )
            return ProviderCommandResult(
                accepted=True,
                lifecycle_status="accepted",
                provider_ref=provider_ref,
                executed=False,
                result_payload={"target": target, "note": "mock placeholder for future lock hardware"},
            )

        if command_type in {"device.script.run", "script_run"}:
            variables = payload.get("variables")
            return ProviderCommandResult(
                accepted=True,
                lifecycle_status="executed",
                provider_ref=provider_ref,
                executed=True,
                result_payload={
                    "script": request.external_id,
                    "variables": variables if isinstance(variables, dict) else {},
                },
            )

        if command_type in {"device.scene.apply", "scene_apply"}:
            return ProviderCommandResult(
                accepted=True,
                lifecycle_status="executed",
                provider_ref=provider_ref,
                executed=True,
                result_payload={"scene": request.external_id},
            )

        if command_type in {"device.boolean.set_state", "boolean_set_state"}:
            target = str(payload.get("target", "")).strip().lower()
            if target not in {"on", "off"}:
                return ProviderCommandResult(
                    accepted=False,
                    lifecycle_status="failed",
                    provider_ref=provider_ref,
                    error_message="Invalid boolean target",
                )
            return ProviderCommandResult(
                accepted=True,
                lifecycle_status="executed",
                provider_ref=provider_ref,
                executed=True,
                result_payload={"target": target},
            )

        if command_type in {"device.select.set_option", "select_set_option"}:
            option = str(payload.get("option", "")).strip()
            if not option:
                return ProviderCommandResult(
                    accepted=False,
                    lifecycle_status="failed",
                    provider_ref=provider_ref,
                    error_message="Missing select option",
                )
            return ProviderCommandResult(
                accepted=True,
                lifecycle_status="executed",
                provider_ref=provider_ref,
                executed=True,
                result_payload={"option": option},
            )

        if command_type in {"device.cover.set_state", "cover_set_state"}:
            target = str(payload.get("target", "")).strip().lower()
            if target not in {"open", "close", "stop"}:
                return ProviderCommandResult(
                    accepted=False,
                    lifecycle_status="failed",
                    provider_ref=provider_ref,
                    error_message="Invalid cover target",
                )
            return ProviderCommandResult(
                accepted=True,
                lifecycle_status="executed",
                provider_ref=provider_ref,
                executed=True,
                result_payload={"target": target},
            )

        if command_type in {"device.number.set_value", "number_set_value"}:
            try:
                value = float(payload.get("value"))
            except (TypeError, ValueError):
                return ProviderCommandResult(
                    accepted=False,
                    lifecycle_status="failed",
                    provider_ref=provider_ref,
                    error_message="Invalid numeric value",
                )
            return ProviderCommandResult(
                accepted=True,
                lifecycle_status="executed",
                provider_ref=provider_ref,
                executed=True,
                result_payload={"value": value},
            )

        if command_type in {"device.text.set_value", "text_set_value"}:
            value = payload.get("value")
            if not isinstance(value, str) or not value.strip():
                return ProviderCommandResult(
                    accepted=False,
                    lifecycle_status="failed",
                    provider_ref=provider_ref,
                    error_message="Invalid text value",
                )
            return ProviderCommandResult(
                accepted=True,
                lifecycle_status="executed",
                provider_ref=provider_ref,
                executed=True,
                result_payload={"value": value.strip()},
            )

        if command_type in {"device.climate.set_power", "climate_set_power"}:
            target = str(payload.get("target", "")).strip().lower()
            if target not in {"on", "off"}:
                return ProviderCommandResult(
                    accepted=False,
                    lifecycle_status="failed",
                    provider_ref=provider_ref,
                    error_message="Invalid climate power target",
                )
            return ProviderCommandResult(
                accepted=True,
                lifecycle_status="executed",
                provider_ref=provider_ref,
                executed=True,
                result_payload={"target": target},
            )

        return ProviderCommandResult(
            accepted=False,
            lifecycle_status="failed",
            provider_ref=provider_ref,
            error_message=f"Unsupported command type '{command_type}'",
        )
