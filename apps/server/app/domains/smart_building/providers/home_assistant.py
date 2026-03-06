from app.domains.smart_building.providers.base import ProviderStateSnapshot, SmartDeviceProvider


class HomeAssistantProvider(SmartDeviceProvider):
    """Contract placeholder only. Real integration intentionally deferred."""

    provider_name = "home_assistant"
    supports_catalog_sync = False
    supports_webhook_ingest = True

    def pull_state(self, external_id: str) -> ProviderStateSnapshot:
        raise NotImplementedError("Home Assistant integration is not implemented yet.")

    def list_devices(self, tenant_id: str):
        raise NotImplementedError("Home Assistant catalog sync is not implemented yet.")

    def parse_webhook(self, payload: dict):
        raise NotImplementedError("Home Assistant webhook parsing is not implemented yet.")
