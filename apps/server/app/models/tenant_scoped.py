from sqlalchemy import Column, String

from app.core.tenant import DEFAULT_TENANT_ID


class TenantScopedMixin:
    tenant_id = Column(String(64), nullable=False, default=DEFAULT_TENANT_ID, index=True)
