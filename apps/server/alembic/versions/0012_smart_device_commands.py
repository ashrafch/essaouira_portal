"""add smart device commands lifecycle table

Revision ID: 0012_smart_device_commands
Revises: 0011_smart_building_foundation
Create Date: 2026-03-06
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0012_smart_device_commands"
down_revision: Union[str, None] = "0011_smart_building_foundation"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "device_commands",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("device_id", sa.Integer(), nullable=False),
        sa.Column("unit_id", sa.Integer(), nullable=True),
        sa.Column("provider", sa.String(length=64), nullable=False, server_default="mock"),
        sa.Column("command_type", sa.String(length=64), nullable=False),
        sa.Column("payload_json", sa.Text(), nullable=True),
        sa.Column("status", sa.String(length=16), nullable=False, server_default="pending"),
        sa.Column("requested_by", sa.String(length=128), nullable=True),
        sa.Column("requested_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("accepted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("executed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("failed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("expired_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("provider_ref", sa.String(length=128), nullable=True),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("result_json", sa.Text(), nullable=True),
        sa.Column("tenant_id", sa.String(length=64), nullable=False, server_default="default"),
        sa.ForeignKeyConstraint(["device_id"], ["devices.id"]),
        sa.ForeignKeyConstraint(["unit_id"], ["units.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_device_commands_device_id"), "device_commands", ["device_id"], unique=False)
    op.create_index(op.f("ix_device_commands_id"), "device_commands", ["id"], unique=False)
    op.create_index(op.f("ix_device_commands_requested_at"), "device_commands", ["requested_at"], unique=False)
    op.create_index(op.f("ix_device_commands_status"), "device_commands", ["status"], unique=False)
    op.create_index(op.f("ix_device_commands_tenant_id"), "device_commands", ["tenant_id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_device_commands_tenant_id"), table_name="device_commands")
    op.drop_index(op.f("ix_device_commands_status"), table_name="device_commands")
    op.drop_index(op.f("ix_device_commands_requested_at"), table_name="device_commands")
    op.drop_index(op.f("ix_device_commands_id"), table_name="device_commands")
    op.drop_index(op.f("ix_device_commands_device_id"), table_name="device_commands")
    op.drop_table("device_commands")
