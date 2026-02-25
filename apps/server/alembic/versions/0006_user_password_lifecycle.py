"""add user password lifecycle fields

Revision ID: 0006_user_password_lifecycle
Revises: 0005_tenants
Create Date: 2026-02-25
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0006_user_password_lifecycle"
down_revision: Union[str, None] = "0005_tenants"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("must_change_password", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.add_column(
        "users",
        sa.Column("last_password_change_at", sa.DateTime(timezone=True), nullable=True, server_default=sa.text("now()")),
    )


def downgrade() -> None:
    op.drop_column("users", "last_password_change_at")
    op.drop_column("users", "must_change_password")
