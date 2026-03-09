"""add setup sessions table

Revision ID: 0004_setup_sessions
Revises: 0003_device_health_columns
Create Date: 2026-03-09
"""

from alembic import op
import sqlalchemy as sa


revision = "0004_setup_sessions"
down_revision = "0003_device_health_columns"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if "setup_sessions" in inspector.get_table_names():
        return
    op.create_table(
        "setup_sessions",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("tenant_id", sa.String(length=64), nullable=False, server_default="default"),
        sa.Column("status", sa.String(length=16), nullable=False, server_default="in_progress"),
        sa.Column("current_step", sa.String(length=32), nullable=False, server_default="property"),
        sa.Column("metadata_json", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_setup_sessions_id"), "setup_sessions", ["id"], unique=False)
    op.create_index(op.f("ix_setup_sessions_status"), "setup_sessions", ["status"], unique=False)


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if "setup_sessions" not in inspector.get_table_names():
        return
    op.drop_index(op.f("ix_setup_sessions_status"), table_name="setup_sessions")
    op.drop_index(op.f("ix_setup_sessions_id"), table_name="setup_sessions")
    op.drop_table("setup_sessions")
