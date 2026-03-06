"""add smart building foundation tables

Revision ID: 0011_smart_building_foundation
Revises: 0010_tenant_branding
Create Date: 2026-03-06
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0011_smart_building_foundation"
down_revision: Union[str, None] = "0010_tenant_branding"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "devices",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("unit_id", sa.Integer(), nullable=True),
        sa.Column("zone_name", sa.String(length=128), nullable=True),
        sa.Column("provider", sa.String(length=64), nullable=False, server_default="mock"),
        sa.Column("external_id", sa.String(length=128), nullable=False),
        sa.Column("name", sa.String(length=128), nullable=False),
        sa.Column("category", sa.String(length=64), nullable=False),
        sa.Column("model", sa.String(length=128), nullable=True),
        sa.Column("manufacturer", sa.String(length=128), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("health_status", sa.String(length=32), nullable=False, server_default="unknown"),
        sa.Column("battery_level", sa.Integer(), nullable=True),
        sa.Column("last_seen_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("tenant_id", sa.String(length=64), nullable=False, server_default="default"),
        sa.ForeignKeyConstraint(["unit_id"], ["units.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("tenant_id", "provider", "external_id", name="uq_devices_tenant_provider_external"),
    )
    op.create_index(op.f("ix_devices_id"), "devices", ["id"], unique=False)
    op.create_index(op.f("ix_devices_tenant_id"), "devices", ["tenant_id"], unique=False)

    op.create_table(
        "device_states",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("device_id", sa.Integer(), nullable=False),
        sa.Column("online", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("power_state", sa.String(length=16), nullable=True),
        sa.Column("motion_detected", sa.Boolean(), nullable=True),
        sa.Column("contact_open", sa.Boolean(), nullable=True),
        sa.Column("leak_detected", sa.Boolean(), nullable=True),
        sa.Column("temperature_c", sa.Numeric(precision=5, scale=2), nullable=True),
        sa.Column("humidity_pct", sa.Numeric(precision=5, scale=2), nullable=True),
        sa.Column("energy_w", sa.Numeric(precision=10, scale=2), nullable=True),
        sa.Column("signal_rssi", sa.Integer(), nullable=True),
        sa.Column("raw_payload_json", sa.Text(), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("tenant_id", sa.String(length=64), nullable=False, server_default="default"),
        sa.ForeignKeyConstraint(["device_id"], ["devices.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("tenant_id", "device_id", name="uq_device_states_tenant_device"),
    )
    op.create_index(op.f("ix_device_states_device_id"), "device_states", ["device_id"], unique=False)
    op.create_index(op.f("ix_device_states_id"), "device_states", ["id"], unique=False)
    op.create_index(op.f("ix_device_states_tenant_id"), "device_states", ["tenant_id"], unique=False)

    op.create_table(
        "device_events",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("device_id", sa.Integer(), nullable=False),
        sa.Column("unit_id", sa.Integer(), nullable=True),
        sa.Column("event_type", sa.String(length=64), nullable=False),
        sa.Column("severity", sa.String(length=16), nullable=False, server_default="info"),
        sa.Column("source", sa.String(length=32), nullable=False, server_default="system"),
        sa.Column("payload_json", sa.Text(), nullable=True),
        sa.Column("occurred_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("tenant_id", sa.String(length=64), nullable=False, server_default="default"),
        sa.ForeignKeyConstraint(["device_id"], ["devices.id"]),
        sa.ForeignKeyConstraint(["unit_id"], ["units.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_device_events_device_id"), "device_events", ["device_id"], unique=False)
    op.create_index(op.f("ix_device_events_id"), "device_events", ["id"], unique=False)
    op.create_index(op.f("ix_device_events_occurred_at"), "device_events", ["occurred_at"], unique=False)
    op.create_index(op.f("ix_device_events_tenant_id"), "device_events", ["tenant_id"], unique=False)

    op.create_table(
        "alerts",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("unit_id", sa.Integer(), nullable=True),
        sa.Column("device_id", sa.Integer(), nullable=True),
        sa.Column("alert_type", sa.String(length=64), nullable=False),
        sa.Column("severity", sa.String(length=16), nullable=False, server_default="warning"),
        sa.Column("status", sa.String(length=16), nullable=False, server_default="open"),
        sa.Column("title", sa.String(length=160), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("first_seen_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("last_seen_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("acknowledged_by", sa.String(length=128), nullable=True),
        sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("tenant_id", sa.String(length=64), nullable=False, server_default="default"),
        sa.ForeignKeyConstraint(["device_id"], ["devices.id"]),
        sa.ForeignKeyConstraint(["unit_id"], ["units.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_alerts_device_id"), "alerts", ["device_id"], unique=False)
    op.create_index(op.f("ix_alerts_id"), "alerts", ["id"], unique=False)
    op.create_index(op.f("ix_alerts_tenant_id"), "alerts", ["tenant_id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_alerts_tenant_id"), table_name="alerts")
    op.drop_index(op.f("ix_alerts_id"), table_name="alerts")
    op.drop_index(op.f("ix_alerts_device_id"), table_name="alerts")
    op.drop_table("alerts")

    op.drop_index(op.f("ix_device_events_tenant_id"), table_name="device_events")
    op.drop_index(op.f("ix_device_events_occurred_at"), table_name="device_events")
    op.drop_index(op.f("ix_device_events_id"), table_name="device_events")
    op.drop_index(op.f("ix_device_events_device_id"), table_name="device_events")
    op.drop_table("device_events")

    op.drop_index(op.f("ix_device_states_tenant_id"), table_name="device_states")
    op.drop_index(op.f("ix_device_states_id"), table_name="device_states")
    op.drop_index(op.f("ix_device_states_device_id"), table_name="device_states")
    op.drop_table("device_states")

    op.drop_index(op.f("ix_devices_tenant_id"), table_name="devices")
    op.drop_index(op.f("ix_devices_id"), table_name="devices")
    op.drop_table("devices")

