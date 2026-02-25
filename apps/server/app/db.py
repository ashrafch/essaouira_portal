import os

from sqlalchemy import create_engine
from sqlalchemy import event
from sqlalchemy.orm import Session, declarative_base, sessionmaker, with_loader_criteria

from app.core.tenant import get_current_tenant_id
from app.models.tenant_scoped import TenantScopedMixin

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql+psycopg2://essa:essa@localhost:5432/essa",
)

engine = create_engine(
    DATABASE_URL,
    pool_pre_ping=True,
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


@event.listens_for(Session, "do_orm_execute")
def _apply_tenant_scope(execute_state):
    if not execute_state.is_select:
        return

    tenant_id = get_current_tenant_id()
    execute_state.statement = execute_state.statement.options(
        with_loader_criteria(
            TenantScopedMixin,
            lambda cls: cls.tenant_id == tenant_id,
            include_aliases=True,
        )
    )


@event.listens_for(Session, "before_flush")
def _assign_tenant_on_insert(session, flush_context, instances):
    tenant_id = get_current_tenant_id()
    for obj in session.new:
        if isinstance(obj, TenantScopedMixin):
            current_value = getattr(obj, "tenant_id", None)
            if not current_value:
                setattr(obj, "tenant_id", tenant_id)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
