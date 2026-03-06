from __future__ import annotations

import random
from datetime import datetime, timezone

from app.domains.smart_building.providers.base import ProviderStateSnapshot, SmartDeviceProvider


class MockSmartDeviceProvider(SmartDeviceProvider):
    provider_name = "mock"

    def pull_state(self, external_id: str) -> ProviderStateSnapshot:
        seeded = sum(ord(c) for c in external_id)
        random.seed(seeded + int(datetime.now(timezone.utc).timestamp() // 60))

        online = random.random() > 0.08
        temperature = round(19 + random.random() * 8, 2)
        humidity = round(35 + random.random() * 35, 2)
        energy = round(random.random() * 1800, 2)

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
            raw_payload={"external_id": external_id, "mode": "simulated"},
            observed_at=datetime.now(timezone.utc),
        )

