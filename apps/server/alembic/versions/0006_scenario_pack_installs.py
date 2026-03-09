"""add smart scenario pack installs

Revision ID: 0006_scenario_pack_installs
Revises: 0005_property_provider_registry
Create Date: 2026-03-09 14:15:00.000000
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "0006_scenario_pack_installs"
down_revision: Union[str, None] = "0005_property_provider_registry"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "smart_scenario_pack_installs",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("property_id", sa.Integer(), nullable=False),
        sa.Column("pack_key", sa.String(length=64), nullable=False),
        sa.Column("status", sa.String(length=16), nullable=False, server_default="enabled"),
        sa.Column("installed_by", sa.String(length=128), nullable=True),
        sa.Column("details_json", sa.Text(), nullable=True),
        sa.Column("installed_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("tenant_id", sa.String(length=64), server_default="default", nullable=False),
        sa.ForeignKeyConstraint(["property_id"], ["properties.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("tenant_id", "property_id", "pack_key", name="uq_scenario_pack_tenant_property_key"),
    )
    op.create_index(
        "ix_smart_scenario_pack_installs_property_id",
        "smart_scenario_pack_installs",
        ["property_id"],
        unique=False,
    )
    op.create_index(
        "ix_smart_scenario_pack_installs_pack_key",
        "smart_scenario_pack_installs",
        ["pack_key"],
        unique=False,
    )
    op.create_index(
        "ix_smart_scenario_pack_installs_tenant_id",
        "smart_scenario_pack_installs",
        ["tenant_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_smart_scenario_pack_installs_tenant_id", table_name="smart_scenario_pack_installs")
    op.drop_index("ix_smart_scenario_pack_installs_pack_key", table_name="smart_scenario_pack_installs")
    op.drop_index("ix_smart_scenario_pack_installs_property_id", table_name="smart_scenario_pack_installs")
    op.drop_table("smart_scenario_pack_installs")
