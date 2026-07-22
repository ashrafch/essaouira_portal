"""revenue Fase 4: market rates (manual comp-set)

Adds ``market_rates`` — manual competitor-set reference rates that drive the
out-of-band pricing alert. Guarded/idempotent.

Revision ID: 0014_market_rates
Revises: 0013_channel_connections
Create Date: 2026-07-22
"""

from alembic import op
import sqlalchemy as sa


revision = "0014_market_rates"
down_revision = "0013_channel_connections"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    if "market_rates" in set(sa.inspect(bind).get_table_names()):
        return
    op.create_table(
        "market_rates",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("tenant_id", sa.String(length=64), nullable=False),
        sa.Column("unit_id", sa.Integer(), sa.ForeignKey("units.id"), nullable=True),
        sa.Column("label", sa.String(length=96), nullable=False),
        sa.Column("nightly_rate", sa.Numeric(10, 2), nullable=False),
        sa.Column("start_date", sa.Date(), nullable=False),
        sa.Column("end_date", sa.Date(), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_market_rates_id", "market_rates", ["id"])
    op.create_index("ix_market_rates_tenant_id", "market_rates", ["tenant_id"])
    op.create_index("ix_market_rates_unit_id", "market_rates", ["unit_id"])


def downgrade() -> None:
    bind = op.get_bind()
    if "market_rates" in set(sa.inspect(bind).get_table_names()):
        op.drop_table("market_rates")
