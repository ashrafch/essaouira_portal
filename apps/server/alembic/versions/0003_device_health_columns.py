"""add device health extension columns

Revision ID: 0003_device_health_columns
Revises: 0002_users
Create Date: 2026-03-09
"""

from alembic import op
import sqlalchemy as sa


revision = "0003_device_health_columns"
down_revision = "0002_users"
branch_labels = None
depends_on = None


def _column_names(bind, table_name: str) -> set[str]:
    inspector = sa.inspect(bind)
    if table_name not in inspector.get_table_names():
        return set()
    return {col["name"] for col in inspector.get_columns(table_name)}


def upgrade() -> None:
    bind = op.get_bind()
    columns = _column_names(bind, "devices")
    if not columns:
        return
    if "connectivity_status" not in columns:
        op.add_column(
            "devices",
            sa.Column("connectivity_status", sa.String(length=16), nullable=False, server_default="unknown"),
        )
    if "signal_strength" not in columns:
        op.add_column(
            "devices",
            sa.Column("signal_strength", sa.Integer(), nullable=True),
        )


def downgrade() -> None:
    bind = op.get_bind()
    columns = _column_names(bind, "devices")
    if "signal_strength" in columns:
        op.drop_column("devices", "signal_strength")
    if "connectivity_status" in columns:
        op.drop_column("devices", "connectivity_status")
