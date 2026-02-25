import contextvars


DEFAULT_TENANT_ID = "default"

_current_tenant_id: contextvars.ContextVar[str] = contextvars.ContextVar(
    "current_tenant_id",
    default=DEFAULT_TENANT_ID,
)


def normalize_tenant_id(value: str | None) -> str:
    tenant_id = (value or "").strip().lower()
    return tenant_id or DEFAULT_TENANT_ID


def get_current_tenant_id() -> str:
    return _current_tenant_id.get()


def set_current_tenant_id(value: str) -> contextvars.Token:
    return _current_tenant_id.set(normalize_tenant_id(value))


def reset_current_tenant_id(token: contextvars.Token) -> None:
    _current_tenant_id.reset(token)
