"""baseline schema

Revision ID: 0001_baseline
Revises:
Create Date: 2026-02-24
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0001_baseline"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "units",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("size_m2", sa.Integer(), nullable=True),
        sa.Column("capacity", sa.Integer(), nullable=True),
        sa.Column("base_nightly_rate", sa.Numeric(10, 2), nullable=True),
        sa.Column("currency", sa.String(3), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_units_id"), "units", ["id"], unique=False)
    op.create_index(op.f("ix_units_name"), "units", ["name"], unique=True)

    op.create_table(
        "staff_defaults",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("cleaning_default_assignee", sa.String(length=100), nullable=True),
        sa.Column("cleaning_default_cost", sa.Float(), nullable=True),
        sa.Column("cleaning_default_hours", sa.Float(), nullable=True),
        sa.Column("currency", sa.String(length=3), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_staff_defaults_id"), "staff_defaults", ["id"], unique=False)

    op.create_table(
        "staff_members",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("role", sa.String(), nullable=True),
        sa.Column("email", sa.String(), nullable=True),
        sa.Column("phone", sa.String(), nullable=True),
        sa.Column("color_hex", sa.String(), nullable=True),
        sa.Column("hourly_cost", sa.Float(), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_staff_members_id"), "staff_members", ["id"], unique=False)

    op.create_table(
        "pricing_defaults",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("default_cleaning_fee", sa.Numeric(10, 2), nullable=True),
        sa.Column("default_city_tax_per_night", sa.Numeric(10, 2), nullable=True),
        sa.Column("default_channel_commission_percent", sa.Numeric(5, 2), nullable=True),
        sa.Column("currency", sa.String(3), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_pricing_defaults_id"), "pricing_defaults", ["id"], unique=False)

    op.create_table(
        "bookings",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("unit_id", sa.Integer(), nullable=False),
        sa.Column("guest_name", sa.String(), nullable=False),
        sa.Column("guest_email", sa.String(), nullable=True),
        sa.Column("guest_phone", sa.String(), nullable=True),
        sa.Column("num_adults", sa.Integer(), nullable=False),
        sa.Column("num_children", sa.Integer(), nullable=False),
        sa.Column("estimated_arrival_time", sa.Time(), nullable=True),
        sa.Column("source", sa.String(), nullable=False),
        sa.Column("checkin_date", sa.Date(), nullable=False),
        sa.Column("checkout_date", sa.Date(), nullable=False),
        sa.Column("notes", sa.String(), nullable=True),
        sa.Column("nightly_rate", sa.Numeric(10, 2), nullable=True),
        sa.Column("total_price", sa.Numeric(10, 2), nullable=True),
        sa.Column("currency", sa.String(3), nullable=False),
        sa.Column("cleaning_fee", sa.Numeric(10, 2), nullable=True),
        sa.Column("city_tax", sa.Numeric(10, 2), nullable=True),
        sa.Column("channel_fee", sa.Numeric(10, 2), nullable=True),
        sa.Column("is_paid", sa.Boolean(), nullable=False),
        sa.Column("has_late_checkout", sa.Boolean(), nullable=False),
        sa.ForeignKeyConstraint(["unit_id"], ["units.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_bookings_id"), "bookings", ["id"], unique=False)

    op.create_table(
        "cost_items",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("date", sa.Date(), nullable=False),
        sa.Column("category", sa.String(), nullable=False),
        sa.Column("description", sa.String(), nullable=True),
        sa.Column("amount", sa.Numeric(10, 2), nullable=False),
        sa.Column("currency", sa.String(3), nullable=False),
        sa.Column("unit_id", sa.Integer(), nullable=True),
        sa.ForeignKeyConstraint(["unit_id"], ["units.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_cost_items_id"), "cost_items", ["id"], unique=False)

    op.create_table(
        "maintenance_tickets",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("title", sa.String(), nullable=False),
        sa.Column("description", sa.String(), nullable=True),
        sa.Column("unit_id", sa.Integer(), nullable=True),
        sa.Column("assigned_to_id", sa.Integer(), nullable=True),
        sa.Column("status", sa.String(), nullable=False),
        sa.Column("priority", sa.String(), nullable=False),
        sa.Column("ticket_type", sa.String(), nullable=False),
        sa.Column("cost", sa.Numeric(10, 2), nullable=True),
        sa.Column("currency", sa.String(3), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["assigned_to_id"], ["staff_members.id"]),
        sa.ForeignKeyConstraint(["unit_id"], ["units.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_maintenance_tickets_id"), "maintenance_tickets", ["id"], unique=False)

    op.create_table(
        "staff_tasks",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("booking_id", sa.Integer(), nullable=True),
        sa.Column("unit_id", sa.Integer(), nullable=True),
        sa.Column("date", sa.Date(), nullable=False),
        sa.Column("time", sa.Time(), nullable=True),
        sa.Column("task_type", sa.String(), nullable=False),
        sa.Column("assignee_name", sa.String(), nullable=True),
        sa.Column("estimated_hours", sa.Numeric(5, 2), nullable=True),
        sa.Column("status", sa.String(), nullable=False),
        sa.Column("notes", sa.String(), nullable=True),
        sa.Column("cost", sa.Numeric(10, 2), nullable=True),
        sa.Column("currency", sa.String(3), nullable=False),
        sa.ForeignKeyConstraint(["booking_id"], ["bookings.id"]),
        sa.ForeignKeyConstraint(["unit_id"], ["units.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_staff_tasks_id"), "staff_tasks", ["id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_staff_tasks_id"), table_name="staff_tasks")
    op.drop_table("staff_tasks")

    op.drop_index(op.f("ix_maintenance_tickets_id"), table_name="maintenance_tickets")
    op.drop_table("maintenance_tickets")

    op.drop_index(op.f("ix_cost_items_id"), table_name="cost_items")
    op.drop_table("cost_items")

    op.drop_index(op.f("ix_bookings_id"), table_name="bookings")
    op.drop_table("bookings")

    op.drop_index(op.f("ix_pricing_defaults_id"), table_name="pricing_defaults")
    op.drop_table("pricing_defaults")

    op.drop_index(op.f("ix_staff_members_id"), table_name="staff_members")
    op.drop_table("staff_members")

    op.drop_index(op.f("ix_staff_defaults_id"), table_name="staff_defaults")
    op.drop_table("staff_defaults")

    op.drop_index(op.f("ix_units_name"), table_name="units")
    op.drop_index(op.f("ix_units_id"), table_name="units")
    op.drop_table("units")
