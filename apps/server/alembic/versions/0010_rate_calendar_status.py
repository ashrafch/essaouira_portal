"""revenue foundations: rate_calendar table + bookings.status

Fase 0 of the revenue-management roadmap. Adds:
- ``rate_calendar`` — per-unit, per-date nightly price + min-stay (the primitive
  the pricing engine writes and booking financials read).
- ``bookings.status`` — reservation lifecycle (pending/confirmed/cancelled/hold),
  needed for accurate pace/cancellation signals.

Both changes are guarded with inspector checks so databases already bootstrapped
via ``create_all`` (AUTO_CREATE_SCHEMA) upgrade cleanly.

The revision id is kept short (<= 32 chars) to fit alembic_version.version_num.

Revision ID: 0010_rate_calendar_status
Revises: 0009_smart_core_tables
Create Date: 2026-07-21
"""

from alembic import op
import sqlalchemy as sa


revision = "0010_rate_calendar_status"
down_revision = "0009_smart_core_tables"
branch_labels = None
depends_on = None


def _existing_tables(bind) -> set[str]:
    inspector = sa.inspect(bind)
    return set(inspector.get_table_names())


def _existing_columns(bind, table_name: str) -> set[str]:
    inspector = sa.inspect(bind)
    return {col["name"] for col in inspector.get_columns(table_name)}


def upgrade() -> None:
    bind = op.get_bind()
    tables = _existing_tables(bind)

    if "rate_calendar" not in tables:
        op.create_table(
            "rate_calendar",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("tenant_id", sa.String(length=64), nullable=False),
            sa.Column("unit_id", sa.Integer(), sa.ForeignKey("units.id"), nullable=False),
            sa.Column("date", sa.Date(), nullable=False),
            sa.Column("price", sa.Numeric(10, 2), nullable=False),
            sa.Column("min_stay", sa.Integer(), nullable=True),
            sa.Column("currency", sa.String(length=3), nullable=False, server_default="EUR"),
            sa.Column("price_source", sa.String(length=16), nullable=False, server_default="manual"),
            sa.Column("is_override", sa.Boolean(), nullable=False, server_default=sa.false()),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.UniqueConstraint("unit_id", "date", name="uq_rate_calendar_unit_date"),
        )
        op.create_index("ix_rate_calendar_id", "rate_calendar", ["id"])
        op.create_index("ix_rate_calendar_tenant_id", "rate_calendar", ["tenant_id"])
        op.create_index("ix_rate_calendar_unit_id", "rate_calendar", ["unit_id"])
        op.create_index("ix_rate_calendar_date", "rate_calendar", ["date"])

    if "bookings" in tables and "status" not in _existing_columns(bind, "bookings"):
        op.add_column(
            "bookings",
            sa.Column(
                "status",
                sa.String(length=16),
                nullable=False,
                server_default="confirmed",
            ),
        )


def downgrade() -> None:
    bind = op.get_bind()
    tables = _existing_tables(bind)

    if "bookings" in tables and "status" in _existing_columns(bind, "bookings"):
        op.drop_column("bookings", "status")

    if "rate_calendar" in tables:
        op.drop_table("rate_calendar")
