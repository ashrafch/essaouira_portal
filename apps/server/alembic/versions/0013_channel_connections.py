"""revenue Fase 3: channel connections (iCal availability sync)

Adds ``channel_connections`` (per-unit external iCal calendars for two-way
availability sync). Guarded/idempotent so create_all-bootstrapped databases
upgrade cleanly.

Revision ID: 0013_channel_connections
Revises: 0012_revenue_rules
Create Date: 2026-07-22
"""

from alembic import op
import sqlalchemy as sa


revision = "0013_channel_connections"
down_revision = "0012_revenue_rules"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    if "channel_connections" in set(sa.inspect(bind).get_table_names()):
        return
    op.create_table(
        "channel_connections",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("tenant_id", sa.String(length=64), nullable=False),
        sa.Column("unit_id", sa.Integer(), sa.ForeignKey("units.id"), nullable=False),
        sa.Column("channel", sa.String(length=32), nullable=False, server_default="other"),
        sa.Column("ical_import_url", sa.Text(), nullable=True),
        sa.Column("external_ref", sa.String(length=128), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("last_sync_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_sync_status", sa.String(length=16), nullable=False, server_default="never"),
        sa.Column("last_sync_message", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_channel_connections_id", "channel_connections", ["id"])
    op.create_index("ix_channel_connections_tenant_id", "channel_connections", ["tenant_id"])
    op.create_index("ix_channel_connections_unit_id", "channel_connections", ["unit_id"])


def downgrade() -> None:
    bind = op.get_bind()
    if "channel_connections" in set(sa.inspect(bind).get_table_names()):
        op.drop_table("channel_connections")
