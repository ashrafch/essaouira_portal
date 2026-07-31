import logging

from sqlalchemy import and_, inspect, text

from app.core.auth import hash_password
from app.core.config import settings
from app.core.tenant import normalize_tenant_id
from app.db import Base, engine, get_db
from app.models.pricing_defaults import PricingDefaults
from app.models.property import Property
from app.models.staff_defaults import StaffDefaults
from app.models.staff_member import StaffMember
from app.models.unit import Unit
from app.models.user import User
from app.main_types import StaffRole

logger = logging.getLogger("app.bootstrap")


def _reconcile_users_table_schema() -> None:
    inspector = inspect(engine)
    if "users" not in inspector.get_table_names():
        return

    existing_cols = {col["name"] for col in inspector.get_columns("users")}
    statements: list[str] = []
    if "tenant_id" not in existing_cols:
        statements.append(
            "ALTER TABLE users ADD COLUMN tenant_id VARCHAR(64) NOT NULL DEFAULT 'default'"
        )
    if "role" not in existing_cols:
        statements.append(
            "ALTER TABLE users ADD COLUMN role VARCHAR(32) NOT NULL DEFAULT 'viewer'"
        )
    if "is_active" not in existing_cols:
        statements.append(
            "ALTER TABLE users ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT true"
        )
    if "created_at" not in existing_cols:
        statements.append(
            "ALTER TABLE users ADD COLUMN created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()"
        )
    if "updated_at" not in existing_cols:
        statements.append(
            "ALTER TABLE users ADD COLUMN updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()"
        )

    if not statements:
        return

    with engine.begin() as conn:
        for stmt in statements:
            conn.execute(text(stmt))
    logger.warning("Reconciled legacy users table schema: added missing columns.")


def _reconcile_devices_table_schema() -> None:
    inspector = inspect(engine)
    if "devices" not in inspector.get_table_names():
        return

    existing_cols = {col["name"] for col in inspector.get_columns("devices")}
    statements: list[str] = []
    if "connectivity_status" not in existing_cols:
        statements.append(
            "ALTER TABLE devices ADD COLUMN connectivity_status VARCHAR(16) NOT NULL DEFAULT 'unknown'"
        )
    if "signal_strength" not in existing_cols:
        statements.append(
            "ALTER TABLE devices ADD COLUMN signal_strength INTEGER NULL"
        )
    # VillaCore Link classification columns (migration 0015). Nullable, so an
    # existing dev database keeps working before the first provider sync.
    for column_name in ("zone_key", "capability_key", "facility_key"):
        if column_name not in existing_cols:
            statements.append(f"ALTER TABLE devices ADD COLUMN {column_name} VARCHAR(64) NULL")

    if not statements:
        return

    with engine.begin() as conn:
        for stmt in statements:
            conn.execute(text(stmt))
    logger.warning("Reconciled devices table schema: added missing columns.")


def _reconcile_units_table_schema() -> None:
    inspector = inspect(engine)
    if "units" not in inspector.get_table_names():
        return

    existing_cols = {col["name"] for col in inspector.get_columns("units")}
    statements: list[str] = []
    if "property_id" not in existing_cols:
        statements.append("ALTER TABLE units ADD COLUMN property_id INTEGER NULL")

    if not statements:
        return

    with engine.begin() as conn:
        for stmt in statements:
            conn.execute(text(stmt))
    logger.warning("Reconciled units table schema: added property_id.")


def _reconcile_properties_table_schema() -> None:
    inspector = inspect(engine)
    if "properties" in inspector.get_table_names():
        return
    with engine.begin() as conn:
        conn.execute(
            text(
                """
                CREATE TABLE properties (
                    id SERIAL PRIMARY KEY,
                    tenant_id VARCHAR(64) NOT NULL DEFAULT 'default',
                    name VARCHAR(128) NOT NULL,
                    code VARCHAR(64) NOT NULL,
                    status VARCHAR(16) NOT NULL DEFAULT 'active',
                    timezone VARCHAR(64) NOT NULL DEFAULT 'Africa/Casablanca',
                    address_line1 VARCHAR(255),
                    city VARCHAR(128),
                    country VARCHAR(64),
                    metadata_json TEXT,
                    is_active BOOLEAN NOT NULL DEFAULT true,
                    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
                )
                """
            )
        )
        conn.execute(
            text(
                "CREATE UNIQUE INDEX uq_properties_tenant_code ON properties (tenant_id, code)"
            )
        )
    logger.warning("Created properties table via reconcile.")


def _reconcile_provider_connections_schema() -> None:
    inspector = inspect(engine)
    if "smart_provider_connections" in inspector.get_table_names():
        return
    with engine.begin() as conn:
        conn.execute(
            text(
                """
                CREATE TABLE smart_provider_connections (
                    id SERIAL PRIMARY KEY,
                    tenant_id VARCHAR(64) NOT NULL DEFAULT 'default',
                    property_id INTEGER NOT NULL,
                    provider_name VARCHAR(64) NOT NULL,
                    status VARCHAR(16) NOT NULL DEFAULT 'disconnected',
                    base_url VARCHAR(255),
                    config_json TEXT,
                    last_sync_at TIMESTAMP WITH TIME ZONE,
                    last_error TEXT,
                    is_active BOOLEAN NOT NULL DEFAULT true,
                    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
                )
                """
            )
        )
        conn.execute(
            text(
                "CREATE UNIQUE INDEX uq_provider_connection_tenant_property_provider ON smart_provider_connections (tenant_id, property_id, provider_name)"
            )
        )
    logger.warning("Created smart_provider_connections table via reconcile.")


def _ensure_default_property_for_existing_units(db) -> None:
    default_property = (
        db.query(Property)
        .filter(Property.tenant_id == "default", Property.code == "default-property")
        .first()
    )
    if default_property is None:
        default_property = Property(
            tenant_id="default",
            name="Default Property",
            code="default-property",
            status="active",
            timezone="Africa/Casablanca",
            is_active=True,
        )
        db.add(default_property)
        db.commit()
        db.refresh(default_property)

    units_without_property = db.query(Unit).filter(Unit.property_id.is_(None)).all()
    if units_without_property:
        for unit in units_without_property:
            unit.property_id = default_property.id
        db.commit()


def _ensure_admin_user(db) -> None:
    username = (settings.admin_username or "owner").strip().lower()
    tenant_id = normalize_tenant_id(settings.admin_tenant_id)
    role = (settings.admin_role or "owner").strip().lower()
    password_hash = settings.admin_password_hash or hash_password(settings.admin_password)

    existing = (
        db.query(User)
        .filter(and_(User.tenant_id == tenant_id, User.username == username))
        .first()
    )
    if existing:
        changed = False
        if not existing.is_active:
            existing.is_active = True
            changed = True
        if existing.role != role:
            existing.role = role
            changed = True
        if settings.admin_password_hash and existing.password_hash != settings.admin_password_hash:
            existing.password_hash = settings.admin_password_hash
            changed = True
        if changed:
            db.commit()
        return

    user = User(
        tenant_id=tenant_id,
        username=username,
        password_hash=password_hash,
        role=role,
        is_active=True,
    )
    db.add(user)
    db.commit()


def initialize_schema_and_seed() -> None:
    if settings.auto_create_schema:
        Base.metadata.create_all(bind=engine)
        _reconcile_users_table_schema()
        _reconcile_properties_table_schema()
        _reconcile_units_table_schema()
        _reconcile_devices_table_schema()
        _reconcile_provider_connections_schema()
        logger.info("Schema auto-creation enabled.")
    else:
        logger.info("Schema auto-creation disabled; expecting migrations.")

    if not settings.auto_seed_data:
        logger.info("Auto seed disabled.")
        return

    db = next(get_db())
    try:
        _ensure_admin_user(db)
        _ensure_default_property_for_existing_units(db)

        if db.query(Unit).count() == 0:
            units_seed = [
                Unit(name="Unit A", size_m2=64, capacity=6, base_nightly_rate=80),
                Unit(name="Unit B", size_m2=62, capacity=6, base_nightly_rate=80),
                Unit(name="Unit C", size_m2=60, capacity=6, base_nightly_rate=75),
                Unit(name="Unit D", size_m2=61, capacity=6, base_nightly_rate=75),
                Unit(name="Unit E", size_m2=63, capacity=6, base_nightly_rate=85),
                Unit(name="Unit F", size_m2=60, capacity=6, base_nightly_rate=70),
            ]
            db.add_all(units_seed)
            db.commit()

        if db.query(StaffDefaults).count() == 0:
            defaults = StaffDefaults(
                cleaning_default_assignee="Operatore 1",
                cleaning_default_cost=5.0,
                cleaning_default_hours=1.0,
                currency="EUR",
            )
            db.add(defaults)
            db.commit()

        if db.query(StaffMember).count() == 0:
            staff_seed = [
                StaffMember(
                    name="Fatima (Housekeeping)",
                    role=StaffRole.housekeeping.value,
                    color_hex="#0f766e",
                    is_active=True,
                    hourly_cost=None,
                ),
                StaffMember(
                    name="Ali (Cucina)",
                    role=StaffRole.kitchen.value,
                    color_hex="#f97316",
                    is_active=True,
                    hourly_cost=None,
                ),
                StaffMember(
                    name="Sara (Reception giorno)",
                    role=StaffRole.reception_day.value,
                    color_hex="#2563eb",
                    is_active=True,
                    hourly_cost=None,
                ),
                StaffMember(
                    name="Youssef (Reception notte)",
                    role=StaffRole.reception_night.value,
                    color_hex="#1d4ed8",
                    is_active=True,
                    hourly_cost=None,
                ),
                StaffMember(
                    name="Ashraf (Manager)",
                    role=StaffRole.manager.value,
                    color_hex="#a855f7",
                    is_active=True,
                    hourly_cost=None,
                ),
            ]
            db.add_all(staff_seed)
            db.commit()

        if db.query(PricingDefaults).count() == 0:
            pricing_defaults = PricingDefaults(
                default_cleaning_fee=None,
                default_city_tax_per_night=None,
                default_channel_commission_percent=None,
                currency="EUR",
            )
            db.add(pricing_defaults)
            db.commit()
    finally:
        db.close()
