"""add distribution channels and revenue rules

Revision ID: 0009_distribution_analytics
Revises: 0008_ops_automation
Create Date: 2026-02-25
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0009_distribution_analytics"
down_revision: Union[str, None] = "0008_ops_automation"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "channel_connections",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("channel", sa.String(length=32), nullable=False),
        sa.Column("listing_external_id", sa.String(length=128), nullable=True),
        sa.Column("commission_percent", sa.Numeric(5, 2), nullable=False, server_default="0"),
        sa.Column("payout_delay_days", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("sync_enabled", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("last_sync_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_sync_status", sa.String(length=32), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("tenant_id", sa.String(length=64), nullable=False, server_default="default"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("tenant_id", "channel", name="uq_channel_connections_tenant_channel"),
    )
    op.create_index(op.f("ix_channel_connections_id"), "channel_connections", ["id"], unique=False)
    op.create_index(op.f("ix_channel_connections_tenant_id"), "channel_connections", ["tenant_id"], unique=False)

    op.create_table(
        "revenue_rules",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=128), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("priority", sa.Integer(), nullable=False, server_default="100"),
        sa.Column("min_occupancy_percent", sa.Numeric(5, 2), nullable=False, server_default="0"),
        sa.Column("max_occupancy_percent", sa.Numeric(5, 2), nullable=False, server_default="100"),
        sa.Column("min_lead_days", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("max_lead_days", sa.Integer(), nullable=False, server_default="365"),
        sa.Column("adjustment_percent", sa.Numeric(6, 2), nullable=False, server_default="0"),
        sa.Column("min_price", sa.Numeric(10, 2), nullable=True),
        sa.Column("max_price", sa.Numeric(10, 2), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("tenant_id", sa.String(length=64), nullable=False, server_default="default"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_revenue_rules_id"), "revenue_rules", ["id"], unique=False)
    op.create_index(op.f("ix_revenue_rules_tenant_id"), "revenue_rules", ["tenant_id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_revenue_rules_tenant_id"), table_name="revenue_rules")
    op.drop_index(op.f("ix_revenue_rules_id"), table_name="revenue_rules")
    op.drop_table("revenue_rules")

    op.drop_index(op.f("ix_channel_connections_tenant_id"), table_name="channel_connections")
    op.drop_index(op.f("ix_channel_connections_id"), table_name="channel_connections")
    op.drop_table("channel_connections")

