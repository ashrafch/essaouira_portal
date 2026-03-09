import os

from app.domains.smart_building.providers.base import SmartDeviceProvider
from app.domains.smart_building.providers.home_assistant import HomeAssistantProvider
from app.domains.smart_building.providers.mock import MockSmartDeviceProvider


def get_provider(
    provider_name: str | None = None,
    *,
    config: dict | None = None,
) -> SmartDeviceProvider:
    selected = (provider_name or os.getenv("SMART_PROVIDER_MODE", "mock")).strip().lower()
    if selected in {"ha", "home_assistant"}:
        cfg = config or {}
        return HomeAssistantProvider(
            base_url=cfg.get("base_url"),
            token=cfg.get("token"),
            timeout_seconds=cfg.get("timeout_seconds"),
            include_domains=cfg.get("include_domains"),
            unit_hints_json=cfg.get("unit_hints_json"),
        )
    return MockSmartDeviceProvider()

