"""add tenant_id scope to domain tables

Revision ID: 0002_tenant_scope
Revises: 0001_baseline
Create Date: 2026-02-25
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0002_tenant_scope"
down_revision: Union[str, None] = "0001_baseline"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


TENANT_DEFAULT = "default"


def _add_tenant_column(table_name: str) -> None:
    op.add_column(
        table_name,
        sa.Column(
            "tenant_id",
            sa.String(length=64),
            nullable=False,
            server_default=TENANT_DEFAULT,
        ),
    )
    op.create_index(f"ix_{table_name}_tenant_id", table_name, ["tenant_id"], unique=False)


def _drop_tenant_column(table_name: str) -> None:
    op.drop_index(f"ix_{table_name}_tenant_id", table_name=table_name)
    op.drop_column(table_name, "tenant_id")


def upgrade() -> None:
    tables = [
        "units",
        "bookings",
        "cost_items",
        "staff_tasks",
        "staff_defaults",
        "staff_members",
        "pricing_defaults",
        "maintenance_tickets",
    ]
    for table in tables:
        _add_tenant_column(table)

    op.drop_index(op.f("ix_units_name"), table_name="units")
    op.create_index("uq_units_tenant_name", "units", ["tenant_id", "name"], unique=True)


def downgrade() -> None:
    op.drop_index("uq_units_tenant_name", table_name="units")
    op.create_index(op.f("ix_units_name"), "units", ["name"], unique=True)

    tables = [
        "maintenance_tickets",
        "pricing_defaults",
        "staff_members",
        "staff_defaults",
        "staff_tasks",
        "cost_items",
        "bookings",
        "units",
    ]
    for table in tables:
        _drop_tenant_column(table)
