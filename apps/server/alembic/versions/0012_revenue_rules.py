"""revenue Fase 2: pricing seasons + lead-time rules

Adds ``pricing_seasons`` and ``lead_time_rules`` that feed the recommendation
engine (seasonal adjustments and lead-time-based adjustments). Guarded/idempotent
so create_all-bootstrapped databases upgrade cleanly.

Revision ID: 0012_revenue_rules
Revises: 0011_unit_price_guardrails
Create Date: 2026-07-22
"""

from alembic import op
import sqlalchemy as sa


revision = "0012_revenue_rules"
down_revision = "0011_unit_price_guardrails"
branch_labels = None
depends_on = None


def _existing_tables(bind) -> set[str]:
    return set(sa.inspect(bind).get_table_names())


def upgrade() -> None:
    bind = op.get_bind()
    tables = _existing_tables(bind)

    if "pricing_seasons" not in tables:
        op.create_table(
            "pricing_seasons",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("tenant_id", sa.String(length=64), nullable=False),
            sa.Column("unit_id", sa.Integer(), sa.ForeignKey("units.id"), nullable=True),
            sa.Column("name", sa.String(length=64), nullable=False),
            sa.Column("start_date", sa.Date(), nullable=False),
            sa.Column("end_date", sa.Date(), nullable=False),
            sa.Column("adjustment_percent", sa.Numeric(6, 2), nullable=False, server_default="0"),
            sa.Column("priority", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        )
        op.create_index("ix_pricing_seasons_id", "pricing_seasons", ["id"])
        op.create_index("ix_pricing_seasons_tenant_id", "pricing_seasons", ["tenant_id"])
        op.create_index("ix_pricing_seasons_unit_id", "pricing_seasons", ["unit_id"])

    if "lead_time_rules" not in tables:
        op.create_table(
            "lead_time_rules",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("tenant_id", sa.String(length=64), nullable=False),
            sa.Column("label", sa.String(length=64), nullable=False),
            sa.Column("min_days", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("max_days", sa.Integer(), nullable=True),
            sa.Column("adjustment_percent", sa.Numeric(6, 2), nullable=False, server_default="0"),
            sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        )
        op.create_index("ix_lead_time_rules_id", "lead_time_rules", ["id"])
        op.create_index("ix_lead_time_rules_tenant_id", "lead_time_rules", ["tenant_id"])


def downgrade() -> None:
    bind = op.get_bind()
    tables = _existing_tables(bind)
    if "lead_time_rules" in tables:
        op.drop_table("lead_time_rules")
    if "pricing_seasons" in tables:
        op.drop_table("pricing_seasons")
