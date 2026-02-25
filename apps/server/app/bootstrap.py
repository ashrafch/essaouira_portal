import logging

from app.core.config import settings
from app.core.auth import hash_password
from app.db import Base, engine, get_db
from app.models.pricing_defaults import PricingDefaults
from app.models.tenant import Tenant
from app.models.staff_defaults import StaffDefaults
from app.models.staff_member import StaffMember
from app.models.user import User
from app.models.unit import Unit
from app.main_types import StaffRole

logger = logging.getLogger("app.bootstrap")


def initialize_schema_and_seed() -> None:
    if settings.auto_create_schema:
        Base.metadata.create_all(bind=engine)
        logger.info("Schema auto-creation enabled.")
    else:
        logger.info("Schema auto-creation disabled; expecting migrations.")

    if not settings.auto_seed_data:
        logger.info("Auto seed disabled.")
        return

    db = next(get_db())
    try:
        default_tenant_id = settings.admin_tenant_id
        default_tenant = db.query(Tenant).filter(Tenant.tenant_id == default_tenant_id).first()
        if default_tenant is None:
            db.add(Tenant(tenant_id=default_tenant_id, name="Default Tenant", is_active=True))
            db.commit()

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

        owner_user = (
            db.query(User)
            .filter(User.username == settings.admin_username)
            .first()
        )
        if owner_user is None:
            if settings.admin_password_hash:
                password_hash = settings.admin_password_hash
            else:
                password_hash = hash_password(settings.admin_password)

            owner_user = User(
                username=settings.admin_username,
                password_hash=password_hash,
                role=settings.admin_role,
                is_active=True,
            )
            db.add(owner_user)
            db.commit()
    finally:
        db.close()
