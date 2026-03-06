import os

from app.domains.smart_building.providers.base import SmartDeviceProvider
from app.domains.smart_building.providers.home_assistant import HomeAssistantProvider
from app.domains.smart_building.providers.mock import MockSmartDeviceProvider


def get_provider(provider_name: str | None = None) -> SmartDeviceProvider:
    selected = (provider_name or os.getenv("SMART_PROVIDER_MODE", "mock")).strip().lower()
    if selected in {"ha", "home_assistant"}:
        return HomeAssistantProvider()
    return MockSmartDeviceProvider()

