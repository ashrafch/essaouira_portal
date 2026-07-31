from app.core.config import settings
from app.domains.smart_building.providers.base import SmartDeviceProvider
from app.domains.smart_building.providers.home_assistant import HomeAssistantProvider
from app.domains.smart_building.providers.mock import MockSmartDeviceProvider
from app.domains.smart_building.providers.villacore import VillaCoreProvider

HOME_ASSISTANT_ALIASES = {"ha", "home_assistant", "homeassistant"}
VILLACORE_ALIASES = {"villacore", "villa_core", "villaos"}
SUPPORTED_PROVIDER_NAMES = {"mock"} | HOME_ASSISTANT_ALIASES | VILLACORE_ALIASES


def get_provider(
    provider_name: str | None = None,
    *,
    config: dict | None = None,
) -> SmartDeviceProvider:
    selected = (provider_name or settings.smart_provider_mode).strip().lower()
    if selected in HOME_ASSISTANT_ALIASES or selected in VILLACORE_ALIASES:
        cfg = config or {}
        kwargs = {
            "base_url": cfg.get("base_url"),
            "token": cfg.get("token"),
            "timeout_seconds": cfg.get("timeout_seconds"),
            "include_domains": cfg.get("include_domains"),
            "unit_hints_json": cfg.get("unit_hints_json"),
        }
        if selected in VILLACORE_ALIASES:
            return VillaCoreProvider(**kwargs)
        return HomeAssistantProvider(**kwargs)
    return MockSmartDeviceProvider()
