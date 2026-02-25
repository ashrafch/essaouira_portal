"""add guest crm, payments and invoices

Revision ID: 0007_sales_core
Revises: 0006_user_password_lifecycle
Create Date: 2026-02-25
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0007_sales_core"
down_revision: Union[str, None] = "0006_user_password_lifecycle"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "guest_profiles",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("full_name", sa.String(length=128), nullable=False),
        sa.Column("email", sa.String(length=255), nullable=False),
        sa.Column("phone", sa.String(length=64), nullable=True),
        sa.Column("notes", sa.String(length=500), nullable=True),
        sa.Column("total_stays", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("total_revenue", sa.Numeric(12, 2), nullable=False, server_default="0"),
        sa.Column("last_stay_date", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("tenant_id", sa.String(length=64), nullable=False, server_default="default"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("tenant_id", "email", name="uq_guest_profiles_tenant_email"),
    )
    op.create_index(op.f("ix_guest_profiles_id"), "guest_profiles", ["id"], unique=False)
    op.create_index(op.f("ix_guest_profiles_email"), "guest_profiles", ["email"], unique=False)
    op.create_index(op.f("ix_guest_profiles_tenant_id"), "guest_profiles", ["tenant_id"], unique=False)

    op.create_table(
        "payment_transactions",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("booking_id", sa.Integer(), nullable=False),
        sa.Column("amount", sa.Numeric(10, 2), nullable=False),
        sa.Column("currency", sa.String(length=3), nullable=False, server_default="EUR"),
        sa.Column("method", sa.String(length=32), nullable=False, server_default="cash"),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="captured"),
        sa.Column("external_ref", sa.String(length=128), nullable=True),
        sa.Column("notes", sa.String(length=500), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("tenant_id", sa.String(length=64), nullable=False, server_default="default"),
        sa.ForeignKeyConstraint(["booking_id"], ["bookings.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_payment_transactions_id"), "payment_transactions", ["id"], unique=False)
    op.create_index(op.f("ix_payment_transactions_booking_id"), "payment_transactions", ["booking_id"], unique=False)
    op.create_index(op.f("ix_payment_transactions_tenant_id"), "payment_transactions", ["tenant_id"], unique=False)

    op.create_table(
        "invoice_documents",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("booking_id", sa.Integer(), nullable=False),
        sa.Column("invoice_number", sa.String(length=64), nullable=False),
        sa.Column("issue_date", sa.Date(), nullable=False),
        sa.Column("amount", sa.Numeric(10, 2), nullable=False),
        sa.Column("currency", sa.String(length=3), nullable=False, server_default="EUR"),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="issued"),
        sa.Column("notes", sa.String(length=500), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("tenant_id", sa.String(length=64), nullable=False, server_default="default"),
        sa.ForeignKeyConstraint(["booking_id"], ["bookings.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("tenant_id", "invoice_number", name="uq_invoice_tenant_number"),
    )
    op.create_index(op.f("ix_invoice_documents_id"), "invoice_documents", ["id"], unique=False)
    op.create_index(op.f("ix_invoice_documents_booking_id"), "invoice_documents", ["booking_id"], unique=False)
    op.create_index(op.f("ix_invoice_documents_invoice_number"), "invoice_documents", ["invoice_number"], unique=False)
    op.create_index(op.f("ix_invoice_documents_tenant_id"), "invoice_documents", ["tenant_id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_invoice_documents_tenant_id"), table_name="invoice_documents")
    op.drop_index(op.f("ix_invoice_documents_invoice_number"), table_name="invoice_documents")
    op.drop_index(op.f("ix_invoice_documents_booking_id"), table_name="invoice_documents")
    op.drop_index(op.f("ix_invoice_documents_id"), table_name="invoice_documents")
    op.drop_table("invoice_documents")

    op.drop_index(op.f("ix_payment_transactions_tenant_id"), table_name="payment_transactions")
    op.drop_index(op.f("ix_payment_transactions_booking_id"), table_name="payment_transactions")
    op.drop_index(op.f("ix_payment_transactions_id"), table_name="payment_transactions")
    op.drop_table("payment_transactions")

    op.drop_index(op.f("ix_guest_profiles_tenant_id"), table_name="guest_profiles")
    op.drop_index(op.f("ix_guest_profiles_email"), table_name="guest_profiles")
    op.drop_index(op.f("ix_guest_profiles_id"), table_name="guest_profiles")
    op.drop_table("guest_profiles")
