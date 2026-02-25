"""add message automation and housekeeping checklist

Revision ID: 0008_ops_automation
Revises: 0007_sales_core
Create Date: 2026-02-25
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0008_ops_automation"
down_revision: Union[str, None] = "0007_sales_core"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "message_templates",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=128), nullable=False),
        sa.Column("trigger_type", sa.String(length=32), nullable=False),
        sa.Column("offset_hours", sa.Integer(), nullable=False, server_default="-24"),
        sa.Column("channel", sa.String(length=32), nullable=False, server_default="email"),
        sa.Column("subject", sa.String(length=255), nullable=True),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("tenant_id", sa.String(length=64), nullable=False, server_default="default"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_message_templates_id"), "message_templates", ["id"], unique=False)
    op.create_index(op.f("ix_message_templates_tenant_id"), "message_templates", ["tenant_id"], unique=False)

    op.create_table(
        "message_jobs",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("booking_id", sa.Integer(), nullable=False),
        sa.Column("template_id", sa.Integer(), nullable=False),
        sa.Column("channel", sa.String(length=32), nullable=False, server_default="email"),
        sa.Column("recipient", sa.String(length=255), nullable=True),
        sa.Column("scheduled_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="scheduled"),
        sa.Column("payload", sa.Text(), nullable=True),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("sent_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("tenant_id", sa.String(length=64), nullable=False, server_default="default"),
        sa.ForeignKeyConstraint(["booking_id"], ["bookings.id"]),
        sa.ForeignKeyConstraint(["template_id"], ["message_templates.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_message_jobs_id"), "message_jobs", ["id"], unique=False)
    op.create_index(op.f("ix_message_jobs_booking_id"), "message_jobs", ["booking_id"], unique=False)
    op.create_index(op.f("ix_message_jobs_template_id"), "message_jobs", ["template_id"], unique=False)
    op.create_index(op.f("ix_message_jobs_tenant_id"), "message_jobs", ["tenant_id"], unique=False)

    op.create_table(
        "housekeeping_checklist_items",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("staff_task_id", sa.Integer(), nullable=False),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("is_done", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("done_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("notes", sa.String(length=500), nullable=True),
        sa.Column("photo_url", sa.String(length=500), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("tenant_id", sa.String(length=64), nullable=False, server_default="default"),
        sa.ForeignKeyConstraint(["staff_task_id"], ["staff_tasks.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_housekeeping_checklist_items_id"), "housekeeping_checklist_items", ["id"], unique=False)
    op.create_index(op.f("ix_housekeeping_checklist_items_staff_task_id"), "housekeeping_checklist_items", ["staff_task_id"], unique=False)
    op.create_index(op.f("ix_housekeeping_checklist_items_tenant_id"), "housekeeping_checklist_items", ["tenant_id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_housekeeping_checklist_items_tenant_id"), table_name="housekeeping_checklist_items")
    op.drop_index(op.f("ix_housekeeping_checklist_items_staff_task_id"), table_name="housekeeping_checklist_items")
    op.drop_index(op.f("ix_housekeeping_checklist_items_id"), table_name="housekeeping_checklist_items")
    op.drop_table("housekeeping_checklist_items")

    op.drop_index(op.f("ix_message_jobs_tenant_id"), table_name="message_jobs")
    op.drop_index(op.f("ix_message_jobs_template_id"), table_name="message_jobs")
    op.drop_index(op.f("ix_message_jobs_booking_id"), table_name="message_jobs")
    op.drop_index(op.f("ix_message_jobs_id"), table_name="message_jobs")
    op.drop_table("message_jobs")

    op.drop_index(op.f("ix_message_templates_tenant_id"), table_name="message_templates")
    op.drop_index(op.f("ix_message_templates_id"), table_name="message_templates")
    op.drop_table("message_templates")
