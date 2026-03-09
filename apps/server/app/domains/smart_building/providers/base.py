from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Any


@dataclass
class ProviderStateSnapshot:
    online: bool
    power_state: str | None = None
    motion_detected: bool | None = None
    contact_open: bool | None = None
    leak_detected: bool | None = None
    temperature_c: float | None = None
    humidity_pct: float | None = None
    energy_w: float | None = None
    signal_rssi: int | None = None
    raw_payload: dict[str, Any] | None = None
    observed_at: datetime | None = None


@dataclass
class ProviderDeviceSnapshot:
    external_id: str
    name: str
    category: str
    model: str | None = None
    manufacturer: str | None = None
    zone_name: str | None = None
    unit_hint: str | None = None
    is_active: bool = True
    health_status: str = "unknown"
    battery_level: int | None = None
    state: ProviderStateSnapshot | None = None


@dataclass
class ProviderWebhookEvent:
    external_id: str
    event_type: str
    severity: str = "info"
    payload: dict[str, Any] | None = None
    state: ProviderStateSnapshot | None = None
    occurred_at: datetime | None = None


@dataclass
class ProviderCommandRequest:
    external_id: str
    command_type: str
    payload: dict[str, Any] | None = None
    requested_by: str | None = None
    tenant_id: str | None = None


@dataclass
class ProviderCommandResult:
    accepted: bool
    lifecycle_status: str
    provider_ref: str | None = None
    result_payload: dict[str, Any] | None = None
    error_message: str | None = None
    executed: bool = False
    expired: bool = False


class SmartDeviceProvider:
    """Provider contract for future integrations (HA/MQTT/etc.)."""

    provider_name: str = "unknown"
    supports_catalog_sync: bool = False
    supports_webhook_ingest: bool = False
    supports_command_execution: bool = False

    def pull_state(self, external_id: str) -> ProviderStateSnapshot:
        raise NotImplementedError

    def list_devices(self, tenant_id: str) -> list[ProviderDeviceSnapshot]:
        raise NotImplementedError

    def parse_webhook(self, payload: dict[str, Any]) -> ProviderWebhookEvent | None:
        raise NotImplementedError

    def execute_command(self, request: ProviderCommandRequest) -> ProviderCommandResult:
        raise NotImplementedError
