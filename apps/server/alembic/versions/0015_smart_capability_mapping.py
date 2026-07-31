"""VillaCore Link: zone / capability / facility mapping on devices

Adds three nullable, indexed columns to ``devices``:

* ``zone_key``      — the site zone an entity belongs to (``a1``, ``pool``…)
* ``capability_key``— the role it plays (``workflow.checkin``, ``facility.alarm``…)
* ``facility_key``  — set only for shared plants, so facility read models can
                      group without re-deriving the zone kind

They let the portal ask for a capability instead of hardcoding a Home Assistant
entity id. Nullable on purpose: mock devices and generic Home Assistant setups
carry none of them and keep working exactly as before.

Guarded/idempotent so create_all-bootstrapped databases upgrade cleanly.

Revision ID: 0015_smart_capability_mapping
Revises: 0014_market_rates
Create Date: 2026-07-31
"""

from alembic import op
import sqlalchemy as sa


revision = "0015_smart_capability_mapping"
down_revision = "0014_market_rates"
branch_labels = None
depends_on = None


NEW_COLUMNS = (
    ("zone_key", sa.String(64)),
    ("capability_key", sa.String(64)),
    ("facility_key", sa.String(64)),
)
NEW_INDEXES = (
    ("ix_devices_zone_key", "zone_key"),
    ("ix_devices_capability_key", "capability_key"),
    ("ix_devices_facility_key", "facility_key"),
)


def _existing_columns(bind, table_name: str) -> set[str]:
    inspector = sa.inspect(bind)
    return {col["name"] for col in inspector.get_columns(table_name)}


def _existing_indexes(bind, table_name: str) -> set[str]:
    inspector = sa.inspect(bind)
    return {index["name"] for index in inspector.get_indexes(table_name)}


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if "devices" not in set(inspector.get_table_names()):
        return

    columns = _existing_columns(bind, "devices")
    for name, column_type in NEW_COLUMNS:
        if name not in columns:
            op.add_column("devices", sa.Column(name, column_type, nullable=True))

    indexes = _existing_indexes(bind, "devices")
    for index_name, column_name in NEW_INDEXES:
        if index_name not in indexes:
            op.create_index(index_name, "devices", [column_name])


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if "devices" not in set(inspector.get_table_names()):
        return

    indexes = _existing_indexes(bind, "devices")
    for index_name, _ in NEW_INDEXES:
        if index_name in indexes:
            op.drop_index(index_name, table_name="devices")

    columns = _existing_columns(bind, "devices")
    for name, _ in NEW_COLUMNS:
        if name in columns:
            op.drop_column("devices", name)
