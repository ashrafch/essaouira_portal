"""add property domain and provider registry

Revision ID: 0005_property_provider_registry
Revises: 0004_setup_sessions
Create Date: 2026-03-09
"""

from alembic import op
import sqlalchemy as sa


revision = "0005_property_provider_registry"
down_revision = "0004_setup_sessions"
branch_labels = None
depends_on = None


def _table_names(bind) -> set[str]:
    return set(sa.inspect(bind).get_table_names())


def _column_names(bind, table_name: str) -> set[str]:
    inspector = sa.inspect(bind)
    if table_name not in inspector.get_table_names():
        return set()
    return {col["name"] for col in inspector.get_columns(table_name)}


def upgrade() -> None:
    bind = op.get_bind()
    tables = _table_names(bind)

    if "properties" not in tables:
        op.create_table(
            "properties",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("tenant_id", sa.String(length=64), nullable=False, server_default="default"),
            sa.Column("name", sa.String(length=128), nullable=False),
            sa.Column("code", sa.String(length=64), nullable=False),
            sa.Column("status", sa.String(length=16), nullable=False, server_default="active"),
            sa.Column("timezone", sa.String(length=64), nullable=False, server_default="Africa/Casablanca"),
            sa.Column("address_line1", sa.String(length=255), nullable=True),
            sa.Column("city", sa.String(length=128), nullable=True),
            sa.Column("country", sa.String(length=64), nullable=True),
            sa.Column("metadata_json", sa.Text(), nullable=True),
            sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
            sa.PrimaryKeyConstraint("id"),
        )
        op.create_index("ix_properties_id", "properties", ["id"], unique=False)
        op.create_index("uq_properties_tenant_code", "properties", ["tenant_id", "code"], unique=True)

    unit_columns = _column_names(bind, "units")
    if "property_id" not in unit_columns:
        op.add_column("units", sa.Column("property_id", sa.Integer(), nullable=True))
        op.create_index("ix_units_property_id", "units", ["property_id"], unique=False)

    if "smart_provider_connections" not in tables:
        op.create_table(
            "smart_provider_connections",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("tenant_id", sa.String(length=64), nullable=False, server_default="default"),
            sa.Column("property_id", sa.Integer(), nullable=False),
            sa.Column("provider_name", sa.String(length=64), nullable=False),
            sa.Column("status", sa.String(length=16), nullable=False, server_default="disconnected"),
            sa.Column("base_url", sa.String(length=255), nullable=True),
            sa.Column("config_json", sa.Text(), nullable=True),
            sa.Column("last_sync_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("last_error", sa.Text(), nullable=True),
            sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
            sa.PrimaryKeyConstraint("id"),
        )
        op.create_index("ix_smart_provider_connections_id", "smart_provider_connections", ["id"], unique=False)
        op.create_index(
            "uq_provider_connection_tenant_property_provider",
            "smart_provider_connections",
            ["tenant_id", "property_id", "provider_name"],
            unique=True,
        )

    if "properties" in _table_names(bind):
        existing_default = bind.execute(
            sa.text("SELECT id FROM properties WHERE tenant_id='default' AND code='default-property' LIMIT 1")
        ).fetchone()
        if not existing_default:
            bind.execute(
                sa.text(
                    """
                    INSERT INTO properties (tenant_id, name, code, status, timezone, is_active)
                    VALUES ('default', 'Default Property', 'default-property', 'active', 'Africa/Casablanca', true)
                    """
                )
            )
        bind.execute(
            sa.text(
                """
                UPDATE units
                SET property_id = (
                    SELECT id FROM properties WHERE tenant_id='default' AND code='default-property' LIMIT 1
                )
                WHERE property_id IS NULL
                """
            )
        )


def downgrade() -> None:
    bind = op.get_bind()
    tables = _table_names(bind)
    if "smart_provider_connections" in tables:
        op.drop_index("uq_provider_connection_tenant_property_provider", table_name="smart_provider_connections")
        op.drop_index("ix_smart_provider_connections_id", table_name="smart_provider_connections")
        op.drop_table("smart_provider_connections")

    columns = _column_names(bind, "units")
    if "property_id" in columns:
        op.drop_index("ix_units_property_id", table_name="units")
        op.drop_column("units", "property_id")

    if "properties" in tables:
        op.drop_index("uq_properties_tenant_code", table_name="properties")
        op.drop_index("ix_properties_id", table_name="properties")
        op.drop_table("properties")
