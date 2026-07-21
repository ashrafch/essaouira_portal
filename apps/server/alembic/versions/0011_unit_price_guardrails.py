"""revenue Fase 1: unit price guardrails (min_price / max_price)

Adds nullable ``min_price`` and ``max_price`` to ``units``. The revenue engine
clamps recommended prices to this band. Guarded/idempotent so create_all-
bootstrapped databases upgrade cleanly.

Revision ID: 0011_unit_price_guardrails
Revises: 0010_rate_calendar_status
Create Date: 2026-07-21
"""

from alembic import op
import sqlalchemy as sa


revision = "0011_unit_price_guardrails"
down_revision = "0010_rate_calendar_status"
branch_labels = None
depends_on = None


def _existing_columns(bind, table_name: str) -> set[str]:
    inspector = sa.inspect(bind)
    return {col["name"] for col in inspector.get_columns(table_name)}


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if "units" not in set(inspector.get_table_names()):
        return
    cols = _existing_columns(bind, "units")
    if "min_price" not in cols:
        op.add_column("units", sa.Column("min_price", sa.Numeric(10, 2), nullable=True))
    if "max_price" not in cols:
        op.add_column("units", sa.Column("max_price", sa.Numeric(10, 2), nullable=True))


def downgrade() -> None:
    bind = op.get_bind()
    cols = _existing_columns(bind, "units")
    if "max_price" in cols:
        op.drop_column("units", "max_price")
    if "min_price" in cols:
        op.drop_column("units", "min_price")
