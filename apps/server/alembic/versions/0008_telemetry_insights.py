"""add telemetry insights table

Revision ID: 0008_telemetry_insights
Revises: 0007_device_telemetry
Create Date: 2026-03-10 09:20:00.000000
"""

from alembic import op
import sqlalchemy as sa


revision = "0008_telemetry_insights"
down_revision = "0007_device_telemetry"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if "telemetry_insights" in inspector.get_table_names():
        return

    op.create_table(
        "telemetry_insights",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("property_id", sa.Integer(), nullable=True),
        sa.Column("unit_id", sa.Integer(), nullable=True),
        sa.Column("device_id", sa.Integer(), nullable=False),
        sa.Column("metric_type", sa.String(length=64), nullable=False),
        sa.Column("insight_type", sa.String(length=64), nullable=False),
        sa.Column("severity", sa.String(length=16), nullable=False, server_default="warning"),
        sa.Column("value", sa.Numeric(14, 4), nullable=True),
        sa.Column("threshold", sa.Numeric(14, 4), nullable=True),
        sa.Column("detected_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("metadata_json", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("tenant_id", sa.String(length=64), nullable=False, server_default="default"),
        sa.ForeignKeyConstraint(["property_id"], ["properties.id"]),
        sa.ForeignKeyConstraint(["unit_id"], ["units.id"]),
        sa.ForeignKeyConstraint(["device_id"], ["devices.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_telemetry_insights_tenant_id", "telemetry_insights", ["tenant_id"], unique=False)
    op.create_index("ix_telemetry_insights_property_id", "telemetry_insights", ["property_id"], unique=False)
    op.create_index("ix_telemetry_insights_unit_id", "telemetry_insights", ["unit_id"], unique=False)
    op.create_index("ix_telemetry_insights_device_id", "telemetry_insights", ["device_id"], unique=False)
    op.create_index("ix_telemetry_insights_metric_type", "telemetry_insights", ["metric_type"], unique=False)
    op.create_index("ix_telemetry_insights_insight_type", "telemetry_insights", ["insight_type"], unique=False)
    op.create_index("ix_telemetry_insights_severity", "telemetry_insights", ["severity"], unique=False)
    op.create_index("ix_telemetry_insights_detected_at", "telemetry_insights", ["detected_at"], unique=False)
    op.create_index("ix_telemetry_insights_resolved_at", "telemetry_insights", ["resolved_at"], unique=False)
    op.create_index(
        "ix_telemetry_insights_device_type_open",
        "telemetry_insights",
        ["device_id", "insight_type", "resolved_at"],
        unique=False,
    )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if "telemetry_insights" not in inspector.get_table_names():
        return
    op.drop_index("ix_telemetry_insights_device_type_open", table_name="telemetry_insights")
    op.drop_index("ix_telemetry_insights_resolved_at", table_name="telemetry_insights")
    op.drop_index("ix_telemetry_insights_detected_at", table_name="telemetry_insights")
    op.drop_index("ix_telemetry_insights_severity", table_name="telemetry_insights")
    op.drop_index("ix_telemetry_insights_insight_type", table_name="telemetry_insights")
    op.drop_index("ix_telemetry_insights_metric_type", table_name="telemetry_insights")
    op.drop_index("ix_telemetry_insights_device_id", table_name="telemetry_insights")
    op.drop_index("ix_telemetry_insights_unit_id", table_name="telemetry_insights")
    op.drop_index("ix_telemetry_insights_property_id", table_name="telemetry_insights")
    op.drop_index("ix_telemetry_insights_tenant_id", table_name="telemetry_insights")
    op.drop_table("telemetry_insights")
