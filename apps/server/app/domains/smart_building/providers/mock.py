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

    _mock_catalog = [
        {"external_id": "mock-unit-a-temp-1", "name": "Unit A Temp Sensor", "category": "temperature_humidity_sensor", "zone_name": "Unit A - Living", "unit_hint": "unit a"},
        {"external_id": "mock-unit-a-door-1", "name": "Unit A Door Sensor", "category": "door_window_sensor", "zone_name": "Unit A - Entry", "unit_hint": "unit a"},
        {"external_id": "mock-unit-b-motion-1", "name": "Unit B Motion Sensor", "category": "motion_sensor", "zone_name": "Unit B - Hall", "unit_hint": "unit b"},
        {"external_id": "mock-unit-c-leak-1", "name": "Unit C Leak Sensor", "category": "leak_sensor", "zone_name": "Unit C - Bathroom", "unit_hint": "unit c"},
        {"external_id": "mock-pool-relay-1", "name": "Pool Pump Relay", "category": "smart_relay", "zone_name": "Pool Plant Room", "unit_hint": None},
        {"external_id": "mock-garden-meter-1", "name": "Garden Energy Meter", "category": "energy_meter", "zone_name": "Garden", "unit_hint": None},
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

        return ProviderCommandResult(
            accepted=False,
            lifecycle_status="failed",
            provider_ref=provider_ref,
            error_message=f"Unsupported command type '{command_type}'",
        )
