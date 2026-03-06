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


class SmartDeviceProvider:
    """Provider contract for future integrations (HA/MQTT/etc.)."""

    provider_name: str = "unknown"

    def pull_state(self, external_id: str) -> ProviderStateSnapshot:
        raise NotImplementedError

