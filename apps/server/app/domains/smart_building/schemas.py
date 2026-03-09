from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.domains.smart_building.taxonomy import (
    normalize_alert_type,
    normalize_command_type,
    normalize_event_type,
    normalize_rule_action_type,
    normalize_rule_trigger_type,
    normalize_scene_action_type,
    normalize_trigger_source,
)


class DeviceBase(BaseModel):
    unit_id: int | None = None
    zone_name: str | None = Field(default=None, max_length=128)
    provider: str = Field(default="mock", max_length=64)
    external_id: str = Field(..., max_length=128)
    name: str = Field(..., max_length=128)
    category: str = Field(..., max_length=64)
    model: str | None = Field(default=None, max_length=128)
    manufacturer: str | None = Field(default=None, max_length=128)
    is_active: bool = True
    health_status: str = Field(default="unknown", max_length=32)
    battery_level: int | None = Field(default=None, ge=0, le=100)


class DeviceCreate(DeviceBase):
    pass


class DeviceUpdate(BaseModel):
    unit_id: int | None = None
    zone_name: str | None = Field(default=None, max_length=128)
    name: str | None = Field(default=None, max_length=128)
    category: str | None = Field(default=None, max_length=64)
    model: str | None = Field(default=None, max_length=128)
    manufacturer: str | None = Field(default=None, max_length=128)
    is_active: bool | None = None
    health_status: str | None = Field(default=None, max_length=32)
    battery_level: int | None = Field(default=None, ge=0, le=100)


class DeviceOut(DeviceBase):
    id: int
    tenant_id: str
    last_seen_at: datetime | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None

    model_config = ConfigDict(from_attributes=True)


class DeviceStateUpdate(BaseModel):
    online: bool
    power_state: str | None = Field(default=None, max_length=16)
    motion_detected: bool | None = None
    contact_open: bool | None = None
    leak_detected: bool | None = None
    temperature_c: Decimal | None = None
    humidity_pct: Decimal | None = None
    energy_w: Decimal | None = None
    signal_rssi: int | None = None
    raw_payload_json: str | None = None


class DeviceStateOut(BaseModel):
    id: int
    tenant_id: str
    device_id: int
    online: bool
    power_state: str | None = None
    motion_detected: bool | None = None
    contact_open: bool | None = None
    leak_detected: bool | None = None
    temperature_c: Decimal | None = None
    humidity_pct: Decimal | None = None
    energy_w: Decimal | None = None
    signal_rssi: int | None = None
    raw_payload_json: str | None = None
    updated_at: datetime | None = None

    model_config = ConfigDict(from_attributes=True)


class DeviceEventCreate(BaseModel):
    event_type: str = Field(..., max_length=64)
    severity: str = Field(default="info", max_length=16)
    source: str = Field(default="system", max_length=32)
    payload_json: str | None = None

    @field_validator("event_type")
    @classmethod
    def _normalize_event_type(cls, value: str) -> str:
        return normalize_event_type(value)


class DeviceEventOut(BaseModel):
    id: int
    tenant_id: str
    device_id: int
    unit_id: int | None = None
    event_type: str
    severity: str
    source: str
    payload_json: str | None = None
    occurred_at: datetime | None = None

    model_config = ConfigDict(from_attributes=True)


class AlertCreate(BaseModel):
    unit_id: int | None = None
    device_id: int | None = None
    alert_type: str = Field(..., max_length=64)
    severity: str = Field(default="warning", max_length=16)
    title: str = Field(..., max_length=160)
    description: str | None = None

    @field_validator("alert_type")
    @classmethod
    def _normalize_alert_type(cls, value: str) -> str:
        return normalize_alert_type(value)


class AlertOut(BaseModel):
    id: int
    tenant_id: str
    unit_id: int | None = None
    device_id: int | None = None
    alert_type: str
    severity: str
    status: str
    title: str
    description: str | None = None
    correlation_id: str | None = None
    first_seen_at: datetime | None = None
    last_seen_at: datetime | None = None
    acknowledged_by: str | None = None
    resolved_at: datetime | None = None

    model_config = ConfigDict(from_attributes=True)


class SmartOverviewOut(BaseModel):
    total_devices: int
    online_devices: int
    offline_devices: int
    open_alerts: int
    critical_alerts: int
    recently_seen_devices: int


class ProviderDebugOut(BaseModel):
    provider_name: str
    supports_catalog_sync: bool
    supports_webhook_ingest: bool
    supports_command_execution: bool


class ProviderSyncOut(BaseModel):
    provider_name: str
    imported_devices: int
    updated_devices: int
    synced_states: int


class ProviderPollOut(BaseModel):
    provider_name: str
    polled_devices: int
    updated_states: int
    events_emitted: int
    errors: int


class ProviderWebhookIn(BaseModel):
    payload: dict


class ProviderWebhookOut(BaseModel):
    provider_name: str
    accepted: bool
    reason: str | None = None
    event_id: int | None = None


class SmartUnitOut(BaseModel):
    id: int
    name: str
    size_m2: int | None = None
    capacity: int | None = None
    base_nightly_rate: Decimal | None = None
    currency: str

    model_config = ConfigDict(from_attributes=True)


class SmartUnitSummaryOut(BaseModel):
    total_devices: int
    online_devices: int
    offline_devices: int
    unknown_state_devices: int
    open_alerts: int
    resolved_alerts: int


class SmartUnitDetailOut(BaseModel):
    unit: SmartUnitOut
    summary: SmartUnitSummaryOut
    devices: list[DeviceOut]
    states: list[DeviceStateOut]
    alerts_open: list[AlertOut]
    alerts_resolved: list[AlertOut]
    events_recent: list[DeviceEventOut]


class DeviceCommandCreate(BaseModel):
    command_type: str = Field(..., max_length=64)
    payload: dict = Field(default_factory=dict)
    ttl_seconds: int | None = Field(default=300, ge=30, le=86400)

    @field_validator("command_type")
    @classmethod
    def _normalize_command_type(cls, value: str) -> str:
        return normalize_command_type(value)


class DeviceCommandOut(BaseModel):
    id: int
    tenant_id: str
    device_id: int
    unit_id: int | None = None
    provider: str
    command_type: str
    payload_json: str | None = None
    correlation_id: str | None = None
    status: str
    requested_by: str | None = None
    requested_at: datetime | None = None
    expires_at: datetime | None = None
    accepted_at: datetime | None = None
    executed_at: datetime | None = None
    failed_at: datetime | None = None
    expired_at: datetime | None = None
    provider_ref: str | None = None
    error_message: str | None = None
    result_json: str | None = None

    model_config = ConfigDict(from_attributes=True)


class SmartUnitTimelineItemOut(BaseModel):
    timeline_id: str
    category: str
    event_type: str
    source: str
    severity: str
    title: str
    description: str | None = None
    occurred_at: datetime
    unit_id: int
    device_id: int | None = None
    alert_id: int | None = None
    command_id: int | None = None
    booking_id: int | None = None
    task_id: int | None = None
    maintenance_id: int | None = None


class SmartUnitTimelineOut(BaseModel):
    unit: SmartUnitOut
    items: list[SmartUnitTimelineItemOut]
    limit: int
    has_more: bool
    next_before: datetime | None = None


class SceneBase(BaseModel):
    name: str = Field(..., max_length=128)
    description: str | None = None
    is_active: bool = True


class SceneCreate(SceneBase):
    pass


class SceneUpdate(BaseModel):
    name: str | None = Field(default=None, max_length=128)
    description: str | None = None
    is_active: bool | None = None


class SceneOut(SceneBase):
    id: int
    tenant_id: str
    last_run_at: datetime | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None

    model_config = ConfigDict(from_attributes=True)


class SceneActionBase(BaseModel):
    position: int = Field(default=1, ge=1, le=999)
    action_type: str = Field(..., max_length=64)
    target_device_id: int | None = None
    target_unit_id: int | None = None
    payload: dict = Field(default_factory=dict)
    is_active: bool = True

    @field_validator("action_type")
    @classmethod
    def _normalize_scene_action_type(cls, value: str) -> str:
        return normalize_scene_action_type(value)


class SceneActionCreate(SceneActionBase):
    pass


class SceneActionUpdate(BaseModel):
    position: int | None = Field(default=None, ge=1, le=999)
    action_type: str | None = Field(default=None, max_length=64)
    target_device_id: int | None = None
    target_unit_id: int | None = None
    payload: dict | None = None
    is_active: bool | None = None

    @field_validator("action_type")
    @classmethod
    def _normalize_scene_action_type(cls, value: str | None) -> str | None:
        if value is None:
            return None
        return normalize_scene_action_type(value)


class SceneActionOut(BaseModel):
    id: int
    tenant_id: str
    scene_id: int
    position: int
    action_type: str
    target_device_id: int | None = None
    target_unit_id: int | None = None
    payload_json: str | None = None
    is_active: bool
    created_at: datetime | None = None
    updated_at: datetime | None = None

    model_config = ConfigDict(from_attributes=True)


class AutomationRuleBase(BaseModel):
    name: str = Field(..., max_length=128)
    description: str | None = None
    trigger_type: str = Field(default="manual", max_length=64)
    trigger_filter: dict = Field(default_factory=dict)
    action_type: str = Field(..., max_length=64)
    target_device_id: int | None = None
    target_unit_id: int | None = None
    payload: dict = Field(default_factory=dict)
    is_active: bool = True

    @field_validator("trigger_type")
    @classmethod
    def _normalize_rule_trigger_type(cls, value: str) -> str:
        return normalize_rule_trigger_type(value)

    @field_validator("action_type")
    @classmethod
    def _normalize_rule_action_type(cls, value: str) -> str:
        return normalize_rule_action_type(value)


class AutomationRuleCreate(AutomationRuleBase):
    pass


class AutomationRuleUpdate(BaseModel):
    name: str | None = Field(default=None, max_length=128)
    description: str | None = None
    trigger_type: str | None = Field(default=None, max_length=64)
    trigger_filter: dict | None = None
    action_type: str | None = Field(default=None, max_length=64)
    target_device_id: int | None = None
    target_unit_id: int | None = None
    payload: dict | None = None
    is_active: bool | None = None

    @field_validator("trigger_type")
    @classmethod
    def _normalize_rule_trigger_type(cls, value: str | None) -> str | None:
        if value is None:
            return None
        return normalize_rule_trigger_type(value)

    @field_validator("action_type")
    @classmethod
    def _normalize_rule_action_type(cls, value: str | None) -> str | None:
        if value is None:
            return None
        return normalize_rule_action_type(value)


class AutomationRuleOut(BaseModel):
    id: int
    tenant_id: str
    name: str
    description: str | None = None
    trigger_type: str
    trigger_filter_json: str | None = None
    action_type: str
    target_device_id: int | None = None
    target_unit_id: int | None = None
    payload_json: str | None = None
    is_active: bool
    last_run_at: datetime | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None

    model_config = ConfigDict(from_attributes=True)


class SceneRunRequest(BaseModel):
    context: dict = Field(default_factory=dict)


class RuleTriggerRequest(BaseModel):
    trigger_type: str = Field(default="manual", max_length=64)
    trigger_source: str = Field(default="manual.api", max_length=64)
    correlation_id: str | None = Field(default=None, max_length=64)
    context: dict = Field(default_factory=dict)

    @field_validator("trigger_type")
    @classmethod
    def _normalize_rule_trigger_type(cls, value: str) -> str:
        return normalize_rule_trigger_type(value)

    @field_validator("trigger_source")
    @classmethod
    def _normalize_trigger_source(cls, value: str) -> str:
        return normalize_trigger_source(value)


class AutomationExecutionOut(BaseModel):
    id: int
    tenant_id: str
    scene_id: int | None = None
    rule_id: int | None = None
    trigger_type: str
    trigger_source: str
    trigger_snapshot_json: str | None = None
    correlation_id: str
    dedup_key: str | None = None
    status: str
    requested_by: str | None = None
    context_json: str | None = None
    result_json: str | None = None
    error_message: str | None = None
    started_at: datetime | None = None
    finished_at: datetime | None = None

    model_config = ConfigDict(from_attributes=True)
