"""SQLAlchemy models package.

Importing this package registers every model on ``Base.metadata`` so that
schema creation (bootstrap) and Alembic autogeneration see the full schema.
"""

from app.models import (  # noqa: F401
    booking,
    channel_connection,
    cost_item,
    maintenance,
    market_rate,
    pricing_defaults,
    property,
    rate_calendar,
    revenue_rules,
    smart_building,
    staff_defaults,
    staff_member,
    staff_task,
    unit,
    user,
)
