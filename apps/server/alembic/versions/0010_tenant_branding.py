"""add tenant branding fields

Revision ID: 0010_tenant_branding
Revises: 0009_distribution_analytics
Create Date: 2026-02-26
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0010_tenant_branding"
down_revision: Union[str, None] = "0009_distribution_analytics"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("tenants", sa.Column("brand_primary_color", sa.String(length=16), nullable=True))
    op.add_column("tenants", sa.Column("brand_logo_url", sa.String(length=500), nullable=True))


def downgrade() -> None:
    op.drop_column("tenants", "brand_logo_url")
    op.drop_column("tenants", "brand_primary_color")

