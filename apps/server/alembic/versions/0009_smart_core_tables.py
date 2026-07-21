"""create smart building core tables

Previously these nine tables only existed via Base.metadata.create_all
(bootstrap with AUTO_CREATE_SCHEMA=true). This migration makes the Alembic
chain complete. Every create is guarded with an inspector check so databases
already bootstrapped via create_all upgrade cleanly.

Revision ID: 0009_smart_core_tables
Revises: 0006_scenario_pack_installs
Create Date: 2026-07-08

Reordered to run before 0007/0008: those telemetry migrations declare foreign
keys to ``devices``, which is created here. All three migrations are guarded, so
this reordering is a no-op on databases already bootstrapped via create_all and
lets a fresh database build the whole chain from scratch.
"""

from alembic import op
import sqlalchemy as sa


revision = "0009_smart_core_tables"
down_revision = "0006_scenario_pack_installs"
branch_labels = None
depends_on = None


def _existing_tables(bind) -> set[str]:
    inspector = sa.inspect(bind)
    return set(inspector.get_table_names())


def upgrade() -> None:
    bind = op.get_bind()
    tables = _existing_tables(bind)

    if "devices" not in tables:
        op.create_table(
            "devices",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("tenant_id", sa.String(length=64), nullable=False),
            sa.Column("unit_id", sa.Integer(), sa.ForeignKey("units.id"), nullable=True),
            sa.Column("zone_name", sa.String(length=128), nullable=True),
            sa.Column("provider", sa.String(length=64), nullable=False),
            sa.Column("external_id", sa.String(length=128), nullable=False),
            sa.Column("name", sa.String(length=128), nullable=False),
            sa.Column("category", sa.String(length=64), nullable=False),
            sa.Column("model", sa.String(length=128), nullable=True),
            sa.Column("manufacturer", sa.String(length=128), nullable=True),
            sa.Column("is_active", sa.Boolean(), nullable=False),
            sa.Column("connectivity_status", sa.String(length=16), nullable=False),
            sa.Column("health_status", sa.String(length=32), nullable=False),
            sa.Column("battery_level", sa.Integer(), nullable=True),
            sa.Column("signal_strength", sa.Integer(), nullable=True),
            sa.Column("last_seen_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.UniqueConstraint(
                "tenant_id", "provider", "external_id",
                name="uq_devices_tenant_provider_external",
            ),
        )
        op.create_index("ix_devices_id", "devices", ["id"])
        op.create_index("ix_devices_tenant_id", "devices", ["tenant_id"])

    if "device_states" not in tables:
        op.create_table(
            "device_states",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("tenant_id", sa.String(length=64), nullable=False),
            sa.Column("device_id", sa.Integer(), sa.ForeignKey("devices.id"), nullable=False),
            sa.Column("online", sa.Boolean(), nullable=False),
            sa.Column("power_state", sa.String(length=16), nullable=True),
            sa.Column("motion_detected", sa.Boolean(), nullable=True),
            sa.Column("contact_open", sa.Boolean(), nullable=True),
            sa.Column("leak_detected", sa.Boolean(), nullable=True),
            sa.Column("temperature_c", sa.Numeric(5, 2), nullable=True),
            sa.Column("humidity_pct", sa.Numeric(5, 2), nullable=True),
            sa.Column("energy_w", sa.Numeric(10, 2), nullable=True),
            sa.Column("signal_rssi", sa.Integer(), nullable=True),
            sa.Column("raw_payload_json", sa.Text(), nullable=True),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.UniqueConstraint(
                "tenant_id", "device_id",
                name="uq_device_states_tenant_device",
            ),
        )
        op.create_index("ix_device_states_id", "device_states", ["id"])
        op.create_index("ix_device_states_tenant_id", "device_states", ["tenant_id"])
        op.create_index("ix_device_states_device_id", "device_states", ["device_id"])

    if "device_events" not in tables:
        op.create_table(
            "device_events",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("tenant_id", sa.String(length=64), nullable=False),
            sa.Column("device_id", sa.Integer(), sa.ForeignKey("devices.id"), nullable=False),
            sa.Column("unit_id", sa.Integer(), sa.ForeignKey("units.id"), nullable=True),
            sa.Column("event_type", sa.String(length=64), nullable=False),
            sa.Column("severity", sa.String(length=16), nullable=False),
            sa.Column("source", sa.String(length=32), nullable=False),
            sa.Column("payload_json", sa.Text(), nullable=True),
            sa.Column("occurred_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        )
        op.create_index("ix_device_events_id", "device_events", ["id"])
        op.create_index("ix_device_events_tenant_id", "device_events", ["tenant_id"])
        op.create_index("ix_device_events_device_id", "device_events", ["device_id"])
        op.create_index("ix_device_events_occurred_at", "device_events", ["occurred_at"])

    if "alerts" not in tables:
        op.create_table(
            "alerts",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("tenant_id", sa.String(length=64), nullable=False),
            sa.Column("unit_id", sa.Integer(), sa.ForeignKey("units.id"), nullable=True),
            sa.Column("device_id", sa.Integer(), sa.ForeignKey("devices.id"), nullable=True),
            sa.Column("alert_type", sa.String(length=64), nullable=False),
            sa.Column("severity", sa.String(length=16), nullable=False),
            sa.Column("status", sa.String(length=16), nullable=False),
            sa.Column("title", sa.String(length=160), nullable=False),
            sa.Column("description", sa.Text(), nullable=True),
            sa.Column("correlation_id", sa.String(length=64), nullable=True),
            sa.Column("first_seen_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.Column("last_seen_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.Column("acknowledged_by", sa.String(length=128), nullable=True),
            sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True),
        )
        op.create_index("ix_alerts_id", "alerts", ["id"])
        op.create_index("ix_alerts_tenant_id", "alerts", ["tenant_id"])
        op.create_index("ix_alerts_device_id", "alerts", ["device_id"])
        op.create_index("ix_alerts_correlation_id", "alerts", ["correlation_id"])

    if "device_commands" not in tables:
        op.create_table(
            "device_commands",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("tenant_id", sa.String(length=64), nullable=False),
            sa.Column("device_id", sa.Integer(), sa.ForeignKey("devices.id"), nullable=False),
            sa.Column("unit_id", sa.Integer(), sa.ForeignKey("units.id"), nullable=True),
            sa.Column("provider", sa.String(length=64), nullable=False),
            sa.Column("command_type", sa.String(length=64), nullable=False),
            sa.Column("payload_json", sa.Text(), nullable=True),
            sa.Column("correlation_id", sa.String(length=64), nullable=True),
            sa.Column("status", sa.String(length=16), nullable=False),
            sa.Column("requested_by", sa.String(length=128), nullable=True),
            sa.Column("requested_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("accepted_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("executed_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("failed_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("expired_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("provider_ref", sa.String(length=128), nullable=True),
            sa.Column("error_message", sa.Text(), nullable=True),
            sa.Column("result_json", sa.Text(), nullable=True),
        )
        op.create_index("ix_device_commands_id", "device_commands", ["id"])
        op.create_index("ix_device_commands_tenant_id", "device_commands", ["tenant_id"])
        op.create_index("ix_device_commands_device_id", "device_commands", ["device_id"])
        op.create_index("ix_device_commands_correlation_id", "device_commands", ["correlation_id"])
        op.create_index("ix_device_commands_status", "device_commands", ["status"])
        op.create_index("ix_device_commands_requested_at", "device_commands", ["requested_at"])

    if "scenes" not in tables:
        op.create_table(
            "scenes",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("tenant_id", sa.String(length=64), nullable=False),
            sa.Column("name", sa.String(length=128), nullable=False),
            sa.Column("description", sa.Text(), nullable=True),
            sa.Column("is_active", sa.Boolean(), nullable=False),
            sa.Column("last_run_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        )
        op.create_index("ix_scenes_id", "scenes", ["id"])
        op.create_index("ix_scenes_tenant_id", "scenes", ["tenant_id"])

    if "scene_actions" not in tables:
        op.create_table(
            "scene_actions",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("tenant_id", sa.String(length=64), nullable=False),
            sa.Column("scene_id", sa.Integer(), sa.ForeignKey("scenes.id"), nullable=False),
            sa.Column("position", sa.Integer(), nullable=False),
            sa.Column("action_type", sa.String(length=64), nullable=False),
            sa.Column("target_device_id", sa.Integer(), sa.ForeignKey("devices.id"), nullable=True),
            sa.Column("target_unit_id", sa.Integer(), sa.ForeignKey("units.id"), nullable=True),
            sa.Column("payload_json", sa.Text(), nullable=True),
            sa.Column("is_active", sa.Boolean(), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.UniqueConstraint(
                "tenant_id", "scene_id", "position",
                name="uq_scene_actions_tenant_scene_position",
            ),
        )
        op.create_index("ix_scene_actions_id", "scene_actions", ["id"])
        op.create_index("ix_scene_actions_tenant_id", "scene_actions", ["tenant_id"])
        op.create_index("ix_scene_actions_scene_id", "scene_actions", ["scene_id"])

    if "automation_rules" not in tables:
        op.create_table(
            "automation_rules",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("tenant_id", sa.String(length=64), nullable=False),
            sa.Column("name", sa.String(length=128), nullable=False),
            sa.Column("description", sa.Text(), nullable=True),
            sa.Column("trigger_type", sa.String(length=64), nullable=False),
            sa.Column("trigger_filter_json", sa.Text(), nullable=True),
            sa.Column("action_type", sa.String(length=64), nullable=False),
            sa.Column("target_device_id", sa.Integer(), sa.ForeignKey("devices.id"), nullable=True),
            sa.Column("target_unit_id", sa.Integer(), sa.ForeignKey("units.id"), nullable=True),
            sa.Column("payload_json", sa.Text(), nullable=True),
            sa.Column("is_active", sa.Boolean(), nullable=False),
            sa.Column("last_run_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        )
        op.create_index("ix_automation_rules_id", "automation_rules", ["id"])
        op.create_index("ix_automation_rules_tenant_id", "automation_rules", ["tenant_id"])
        op.create_index("ix_automation_rules_trigger_type", "automation_rules", ["trigger_type"])

    if "automation_executions" not in tables:
        op.create_table(
            "automation_executions",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("tenant_id", sa.String(length=64), nullable=False),
            sa.Column("scene_id", sa.Integer(), sa.ForeignKey("scenes.id"), nullable=True),
            sa.Column("rule_id", sa.Integer(), sa.ForeignKey("automation_rules.id"), nullable=True),
            sa.Column("trigger_type", sa.String(length=64), nullable=False),
            sa.Column("trigger_source", sa.String(length=64), nullable=False),
            sa.Column("trigger_snapshot_json", sa.Text(), nullable=True),
            sa.Column("correlation_id", sa.String(length=64), nullable=False),
            sa.Column("dedup_key", sa.String(length=128), nullable=True),
            sa.Column("status", sa.String(length=16), nullable=False),
            sa.Column("requested_by", sa.String(length=128), nullable=True),
            sa.Column("context_json", sa.Text(), nullable=True),
            sa.Column("result_json", sa.Text(), nullable=True),
            sa.Column("error_message", sa.Text(), nullable=True),
            sa.Column("started_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
        )
        op.create_index("ix_automation_executions_id", "automation_executions", ["id"])
        op.create_index("ix_automation_executions_tenant_id", "automation_executions", ["tenant_id"])
        op.create_index("ix_automation_executions_scene_id", "automation_executions", ["scene_id"])
        op.create_index("ix_automation_executions_rule_id", "automation_executions", ["rule_id"])
        op.create_index("ix_automation_executions_correlation_id", "automation_executions", ["correlation_id"])
        op.create_index("ix_automation_executions_dedup_key", "automation_executions", ["dedup_key"])
        op.create_index("ix_automation_executions_status", "automation_executions", ["status"])
        op.create_index("ix_automation_executions_started_at", "automation_executions", ["started_at"])


def downgrade() -> None:
    bind = op.get_bind()
    tables = _existing_tables(bind)

    for table_name in (
        "automation_executions",
        "automation_rules",
        "scene_actions",
        "scenes",
        "device_commands",
        "alerts",
        "device_events",
        "device_states",
        "devices",
    ):
        if table_name in tables:
            op.drop_table(table_name)
