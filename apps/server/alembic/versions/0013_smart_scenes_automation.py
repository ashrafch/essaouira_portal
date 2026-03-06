"""add smart scenes and automation foundations

Revision ID: 0013_smart_scenes_automation
Revises: 0012_smart_device_commands
Create Date: 2026-03-06
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0013_smart_scenes_automation"
down_revision: Union[str, None] = "0012_smart_device_commands"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "scenes",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=128), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("last_run_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("tenant_id", sa.String(length=64), nullable=False, server_default="default"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_scenes_id"), "scenes", ["id"], unique=False)
    op.create_index(op.f("ix_scenes_tenant_id"), "scenes", ["tenant_id"], unique=False)

    op.create_table(
        "scene_actions",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("scene_id", sa.Integer(), nullable=False),
        sa.Column("position", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("action_type", sa.String(length=64), nullable=False),
        sa.Column("target_device_id", sa.Integer(), nullable=True),
        sa.Column("target_unit_id", sa.Integer(), nullable=True),
        sa.Column("payload_json", sa.Text(), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("tenant_id", sa.String(length=64), nullable=False, server_default="default"),
        sa.ForeignKeyConstraint(["scene_id"], ["scenes.id"]),
        sa.ForeignKeyConstraint(["target_device_id"], ["devices.id"]),
        sa.ForeignKeyConstraint(["target_unit_id"], ["units.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("tenant_id", "scene_id", "position", name="uq_scene_actions_tenant_scene_position"),
    )
    op.create_index(op.f("ix_scene_actions_id"), "scene_actions", ["id"], unique=False)
    op.create_index(op.f("ix_scene_actions_scene_id"), "scene_actions", ["scene_id"], unique=False)
    op.create_index(op.f("ix_scene_actions_tenant_id"), "scene_actions", ["tenant_id"], unique=False)

    op.create_table(
        "automation_rules",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=128), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("trigger_type", sa.String(length=64), nullable=False, server_default="manual"),
        sa.Column("trigger_filter_json", sa.Text(), nullable=True),
        sa.Column("action_type", sa.String(length=64), nullable=False),
        sa.Column("target_device_id", sa.Integer(), nullable=True),
        sa.Column("target_unit_id", sa.Integer(), nullable=True),
        sa.Column("payload_json", sa.Text(), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("last_run_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("tenant_id", sa.String(length=64), nullable=False, server_default="default"),
        sa.ForeignKeyConstraint(["target_device_id"], ["devices.id"]),
        sa.ForeignKeyConstraint(["target_unit_id"], ["units.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_automation_rules_id"), "automation_rules", ["id"], unique=False)
    op.create_index(op.f("ix_automation_rules_tenant_id"), "automation_rules", ["tenant_id"], unique=False)
    op.create_index(op.f("ix_automation_rules_trigger_type"), "automation_rules", ["trigger_type"], unique=False)

    op.create_table(
        "automation_executions",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("scene_id", sa.Integer(), nullable=True),
        sa.Column("rule_id", sa.Integer(), nullable=True),
        sa.Column("trigger_type", sa.String(length=64), nullable=False, server_default="manual"),
        sa.Column("status", sa.String(length=16), nullable=False, server_default="running"),
        sa.Column("requested_by", sa.String(length=128), nullable=True),
        sa.Column("context_json", sa.Text(), nullable=True),
        sa.Column("result_json", sa.Text(), nullable=True),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("started_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("tenant_id", sa.String(length=64), nullable=False, server_default="default"),
        sa.ForeignKeyConstraint(["rule_id"], ["automation_rules.id"]),
        sa.ForeignKeyConstraint(["scene_id"], ["scenes.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_automation_executions_id"), "automation_executions", ["id"], unique=False)
    op.create_index(op.f("ix_automation_executions_rule_id"), "automation_executions", ["rule_id"], unique=False)
    op.create_index(op.f("ix_automation_executions_scene_id"), "automation_executions", ["scene_id"], unique=False)
    op.create_index(op.f("ix_automation_executions_started_at"), "automation_executions", ["started_at"], unique=False)
    op.create_index(op.f("ix_automation_executions_status"), "automation_executions", ["status"], unique=False)
    op.create_index(op.f("ix_automation_executions_tenant_id"), "automation_executions", ["tenant_id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_automation_executions_tenant_id"), table_name="automation_executions")
    op.drop_index(op.f("ix_automation_executions_status"), table_name="automation_executions")
    op.drop_index(op.f("ix_automation_executions_started_at"), table_name="automation_executions")
    op.drop_index(op.f("ix_automation_executions_scene_id"), table_name="automation_executions")
    op.drop_index(op.f("ix_automation_executions_rule_id"), table_name="automation_executions")
    op.drop_index(op.f("ix_automation_executions_id"), table_name="automation_executions")
    op.drop_table("automation_executions")

    op.drop_index(op.f("ix_automation_rules_trigger_type"), table_name="automation_rules")
    op.drop_index(op.f("ix_automation_rules_tenant_id"), table_name="automation_rules")
    op.drop_index(op.f("ix_automation_rules_id"), table_name="automation_rules")
    op.drop_table("automation_rules")

    op.drop_index(op.f("ix_scene_actions_tenant_id"), table_name="scene_actions")
    op.drop_index(op.f("ix_scene_actions_scene_id"), table_name="scene_actions")
    op.drop_index(op.f("ix_scene_actions_id"), table_name="scene_actions")
    op.drop_table("scene_actions")

    op.drop_index(op.f("ix_scenes_tenant_id"), table_name="scenes")
    op.drop_index(op.f("ix_scenes_id"), table_name="scenes")
    op.drop_table("scenes")
