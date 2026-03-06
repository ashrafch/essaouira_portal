"""add automation correlation and dedup fields

Revision ID: 0014_smart_automation_traceability
Revises: 0013_smart_scenes_automation
Create Date: 2026-03-06
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0014_smart_automation_traceability"
down_revision: Union[str, None] = "0013_smart_scenes_automation"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("alerts", sa.Column("correlation_id", sa.String(length=64), nullable=True))
    op.create_index(op.f("ix_alerts_correlation_id"), "alerts", ["correlation_id"], unique=False)

    op.add_column("device_commands", sa.Column("correlation_id", sa.String(length=64), nullable=True))
    op.create_index(op.f("ix_device_commands_correlation_id"), "device_commands", ["correlation_id"], unique=False)

    op.add_column("automation_executions", sa.Column("trigger_source", sa.String(length=64), nullable=False, server_default="manual.api"))
    op.add_column("automation_executions", sa.Column("trigger_snapshot_json", sa.Text(), nullable=True))
    op.add_column("automation_executions", sa.Column("correlation_id", sa.String(length=64), nullable=False, server_default="legacy"))
    op.add_column("automation_executions", sa.Column("dedup_key", sa.String(length=128), nullable=True))

    op.create_index(op.f("ix_automation_executions_correlation_id"), "automation_executions", ["correlation_id"], unique=False)
    op.create_index(op.f("ix_automation_executions_dedup_key"), "automation_executions", ["dedup_key"], unique=False)

    bind = op.get_bind()
    if bind.dialect.name != "sqlite":
        op.alter_column("automation_executions", "correlation_id", server_default=None)


def downgrade() -> None:
    op.drop_index(op.f("ix_automation_executions_dedup_key"), table_name="automation_executions")
    op.drop_index(op.f("ix_automation_executions_correlation_id"), table_name="automation_executions")
    op.drop_column("automation_executions", "dedup_key")
    op.drop_column("automation_executions", "correlation_id")
    op.drop_column("automation_executions", "trigger_snapshot_json")
    op.drop_column("automation_executions", "trigger_source")

    op.drop_index(op.f("ix_device_commands_correlation_id"), table_name="device_commands")
    op.drop_column("device_commands", "correlation_id")

    op.drop_index(op.f("ix_alerts_correlation_id"), table_name="alerts")
    op.drop_column("alerts", "correlation_id")
