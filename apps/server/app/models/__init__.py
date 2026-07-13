"""SQLAlchemy models package.

Importing this package registers every model on ``Base.metadata`` so that
schema creation (bootstrap) and Alembic autogeneration see the full schema.
"""

from app.models import (  # noqa: F401
    booking,
    cost_item,
    maintenance,
    pricing_defaults,
    property,
    smart_building,
    staff_defaults,
    staff_member,
    staff_task,
    unit,
    user,
)
