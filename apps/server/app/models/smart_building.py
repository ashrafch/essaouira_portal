from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.db import Base
from app.models.tenant_scoped import TenantScopedMixin


class Device(TenantScopedMixin, Base):
    __tablename__ = "devices"
    __table_args__ = (
        UniqueConstraint("tenant_id", "provider", "external_id", name="uq_devices_tenant_provider_external"),
    )

    id = Column(Integer, primary_key=True, index=True)
    unit_id = Column(Integer, ForeignKey("units.id"), nullable=True)
    zone_name = Column(String(128), nullable=True)
    provider = Column(String(64), nullable=False, default="mock")
    external_id = Column(String(128), nullable=False)
    name = Column(String(128), nullable=False)
    category = Column(String(64), nullable=False)
    model = Column(String(128), nullable=True)
    manufacturer = Column(String(128), nullable=True)
    is_active = Column(Boolean, nullable=False, default=True)
    health_status = Column(String(32), nullable=False, default="unknown")
    battery_level = Column(Integer, nullable=True)
    last_seen_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    unit = relationship("Unit")
    state = relationship("DeviceState", back_populates="device", uselist=False, cascade="all, delete-orphan")
    events = relationship("DeviceEvent", back_populates="device", cascade="all, delete-orphan")
    alerts = relationship("Alert", back_populates="device", cascade="all, delete-orphan")
    commands = relationship("DeviceCommand", back_populates="device", cascade="all, delete-orphan")
    scene_actions = relationship("SceneAction", back_populates="target_device")
    automation_rules = relationship("AutomationRule", back_populates="target_device")


class DeviceState(TenantScopedMixin, Base):
    __tablename__ = "device_states"
    __table_args__ = (
        UniqueConstraint("tenant_id", "device_id", name="uq_device_states_tenant_device"),
    )

    id = Column(Integer, primary_key=True, index=True)
    device_id = Column(Integer, ForeignKey("devices.id"), nullable=False, index=True)
    online = Column(Boolean, nullable=False, default=False)
    power_state = Column(String(16), nullable=True)
    motion_detected = Column(Boolean, nullable=True)
    contact_open = Column(Boolean, nullable=True)
    leak_detected = Column(Boolean, nullable=True)
    temperature_c = Column(Numeric(5, 2), nullable=True)
    humidity_pct = Column(Numeric(5, 2), nullable=True)
    energy_w = Column(Numeric(10, 2), nullable=True)
    signal_rssi = Column(Integer, nullable=True)
    raw_payload_json = Column(Text, nullable=True)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    device = relationship("Device", back_populates="state")


class DeviceEvent(TenantScopedMixin, Base):
    __tablename__ = "device_events"

    id = Column(Integer, primary_key=True, index=True)
    device_id = Column(Integer, ForeignKey("devices.id"), nullable=False, index=True)
    unit_id = Column(Integer, ForeignKey("units.id"), nullable=True)
    event_type = Column(String(64), nullable=False)
    severity = Column(String(16), nullable=False, default="info")
    source = Column(String(32), nullable=False, default="system")
    payload_json = Column(Text, nullable=True)
    occurred_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False, index=True)

    device = relationship("Device", back_populates="events")
    unit = relationship("Unit")


class Alert(TenantScopedMixin, Base):
    __tablename__ = "alerts"

    id = Column(Integer, primary_key=True, index=True)
    unit_id = Column(Integer, ForeignKey("units.id"), nullable=True)
    device_id = Column(Integer, ForeignKey("devices.id"), nullable=True, index=True)
    alert_type = Column(String(64), nullable=False)
    severity = Column(String(16), nullable=False, default="warning")
    status = Column(String(16), nullable=False, default="open")
    title = Column(String(160), nullable=False)
    description = Column(Text, nullable=True)
    first_seen_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    last_seen_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)
    acknowledged_by = Column(String(128), nullable=True)
    resolved_at = Column(DateTime(timezone=True), nullable=True)

    unit = relationship("Unit")
    device = relationship("Device", back_populates="alerts")


class DeviceCommand(TenantScopedMixin, Base):
    __tablename__ = "device_commands"

    id = Column(Integer, primary_key=True, index=True)
    device_id = Column(Integer, ForeignKey("devices.id"), nullable=False, index=True)
    unit_id = Column(Integer, ForeignKey("units.id"), nullable=True)
    provider = Column(String(64), nullable=False, default="mock")
    command_type = Column(String(64), nullable=False)
    payload_json = Column(Text, nullable=True)
    status = Column(String(16), nullable=False, default="pending", index=True)
    requested_by = Column(String(128), nullable=True)
    requested_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False, index=True)
    expires_at = Column(DateTime(timezone=True), nullable=True)
    accepted_at = Column(DateTime(timezone=True), nullable=True)
    executed_at = Column(DateTime(timezone=True), nullable=True)
    failed_at = Column(DateTime(timezone=True), nullable=True)
    expired_at = Column(DateTime(timezone=True), nullable=True)
    provider_ref = Column(String(128), nullable=True)
    error_message = Column(Text, nullable=True)
    result_json = Column(Text, nullable=True)

    unit = relationship("Unit")
    device = relationship("Device", back_populates="commands")


class Scene(TenantScopedMixin, Base):
    __tablename__ = "scenes"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(128), nullable=False)
    description = Column(Text, nullable=True)
    is_active = Column(Boolean, nullable=False, default=True)
    last_run_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    actions = relationship("SceneAction", back_populates="scene", cascade="all, delete-orphan")
    executions = relationship("AutomationExecution", back_populates="scene")


class SceneAction(TenantScopedMixin, Base):
    __tablename__ = "scene_actions"
    __table_args__ = (
        UniqueConstraint("tenant_id", "scene_id", "position", name="uq_scene_actions_tenant_scene_position"),
    )

    id = Column(Integer, primary_key=True, index=True)
    scene_id = Column(Integer, ForeignKey("scenes.id"), nullable=False, index=True)
    position = Column(Integer, nullable=False, default=1)
    action_type = Column(String(64), nullable=False)
    target_device_id = Column(Integer, ForeignKey("devices.id"), nullable=True)
    target_unit_id = Column(Integer, ForeignKey("units.id"), nullable=True)
    payload_json = Column(Text, nullable=True)
    is_active = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    scene = relationship("Scene", back_populates="actions")
    target_device = relationship("Device", back_populates="scene_actions")
    target_unit = relationship("Unit")


class AutomationRule(TenantScopedMixin, Base):
    __tablename__ = "automation_rules"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(128), nullable=False)
    description = Column(Text, nullable=True)
    trigger_type = Column(String(64), nullable=False, default="manual", index=True)
    trigger_filter_json = Column(Text, nullable=True)
    action_type = Column(String(64), nullable=False)
    target_device_id = Column(Integer, ForeignKey("devices.id"), nullable=True)
    target_unit_id = Column(Integer, ForeignKey("units.id"), nullable=True)
    payload_json = Column(Text, nullable=True)
    is_active = Column(Boolean, nullable=False, default=True)
    last_run_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    target_device = relationship("Device", back_populates="automation_rules")
    target_unit = relationship("Unit")
    executions = relationship("AutomationExecution", back_populates="rule")


class AutomationExecution(TenantScopedMixin, Base):
    __tablename__ = "automation_executions"

    id = Column(Integer, primary_key=True, index=True)
    scene_id = Column(Integer, ForeignKey("scenes.id"), nullable=True, index=True)
    rule_id = Column(Integer, ForeignKey("automation_rules.id"), nullable=True, index=True)
    trigger_type = Column(String(64), nullable=False, default="manual")
    status = Column(String(16), nullable=False, default="running", index=True)
    requested_by = Column(String(128), nullable=True)
    context_json = Column(Text, nullable=True)
    result_json = Column(Text, nullable=True)
    error_message = Column(Text, nullable=True)
    started_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False, index=True)
    finished_at = Column(DateTime(timezone=True), nullable=True)

    scene = relationship("Scene", back_populates="executions")
    rule = relationship("AutomationRule", back_populates="executions")
