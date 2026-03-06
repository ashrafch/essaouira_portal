from app.domains.smart_building.providers.base import ProviderStateSnapshot, SmartDeviceProvider


class HomeAssistantProvider(SmartDeviceProvider):
    """Contract placeholder only. Real integration intentionally deferred."""

    provider_name = "home_assistant"

    def pull_state(self, external_id: str) -> ProviderStateSnapshot:
        raise NotImplementedError("Home Assistant integration is not implemented yet.")

