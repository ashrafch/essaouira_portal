"""add smart device telemetry

Revision ID: 0007_device_telemetry
Revises: 0009_smart_core_tables
Create Date: 2026-03-09 17:15:00.000000

Now runs after 0009 (smart core tables) so its foreign key to ``devices`` is
valid when building a fresh database from scratch.
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "0007_device_telemetry"
down_revision: Union[str, None] = "0009_smart_core_tables"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    tables = set(inspector.get_table_names())

    if "device_telemetry" not in tables:
        op.create_table(
            "device_telemetry",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("property_id", sa.Integer(), nullable=True),
            sa.Column("unit_id", sa.Integer(), nullable=True),
            sa.Column("device_id", sa.Integer(), nullable=False),
            sa.Column("metric_type", sa.String(length=64), nullable=False),
            sa.Column("value", sa.Numeric(14, 4), nullable=False),
            sa.Column("unit", sa.String(length=32), nullable=True),
            sa.Column("recorded_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
            sa.Column("tenant_id", sa.String(length=64), server_default="default", nullable=False),
            sa.ForeignKeyConstraint(["device_id"], ["devices.id"]),
            sa.ForeignKeyConstraint(["property_id"], ["properties.id"]),
            sa.ForeignKeyConstraint(["unit_id"], ["units.id"]),
            sa.PrimaryKeyConstraint("id"),
        )
        tables.add("device_telemetry")

    existing_indexes = (
        {idx.get("name") for idx in inspector.get_indexes("device_telemetry")}
        if "device_telemetry" in tables
        else set()
    )

    if "ix_device_telemetry_tenant_id" not in existing_indexes:
        op.create_index("ix_device_telemetry_tenant_id", "device_telemetry", ["tenant_id"], unique=False)
    if "ix_device_telemetry_property_id" not in existing_indexes:
        op.create_index("ix_device_telemetry_property_id", "device_telemetry", ["property_id"], unique=False)
    if "ix_device_telemetry_unit_id" not in existing_indexes:
        op.create_index("ix_device_telemetry_unit_id", "device_telemetry", ["unit_id"], unique=False)
    if "ix_device_telemetry_device_id" not in existing_indexes:
        op.create_index("ix_device_telemetry_device_id", "device_telemetry", ["device_id"], unique=False)
    if "ix_device_telemetry_metric_type" not in existing_indexes:
        op.create_index("ix_device_telemetry_metric_type", "device_telemetry", ["metric_type"], unique=False)
    if "ix_device_telemetry_recorded_at" not in existing_indexes:
        op.create_index("ix_device_telemetry_recorded_at", "device_telemetry", ["recorded_at"], unique=False)
    if "ix_device_telemetry_device_metric_recorded" not in existing_indexes:
        op.create_index(
            "ix_device_telemetry_device_metric_recorded",
            "device_telemetry",
            ["device_id", "metric_type", "recorded_at"],
            unique=False,
        )


def downgrade() -> None:
    op.drop_index("ix_device_telemetry_device_metric_recorded", table_name="device_telemetry")
    op.drop_index("ix_device_telemetry_recorded_at", table_name="device_telemetry")
    op.drop_index("ix_device_telemetry_metric_type", table_name="device_telemetry")
    op.drop_index("ix_device_telemetry_device_id", table_name="device_telemetry")
    op.drop_index("ix_device_telemetry_unit_id", table_name="device_telemetry")
    op.drop_index("ix_device_telemetry_property_id", table_name="device_telemetry")
    op.drop_index("ix_device_telemetry_tenant_id", table_name="device_telemetry")
    op.drop_table("device_telemetry")
