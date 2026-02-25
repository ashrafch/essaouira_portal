import json
import logging
from typing import Any

from app.db import SessionLocal
from app.models.audit_log import AuditLog

logger = logging.getLogger("app.audit")


def record_audit_event(
    *,
    event_type: str,
    username: str | None,
    role: str | None,
    method: str,
    path: str,
    status_code: int,
    client_ip: str | None,
    details: dict[str, Any] | None = None,
) -> None:
    db = None
    try:
        db = SessionLocal()
        payload = AuditLog(
            event_type=event_type,
            username=username,
            role=role,
            method=method,
            path=path,
            status_code=status_code,
            client_ip=client_ip,
            details=json.dumps(details, ensure_ascii=True) if details else None,
        )
        db.add(payload)
        db.commit()
    except Exception:
        logger.exception("Audit log write failed")
    finally:
        try:
            if db is not None:
                db.close()
        except Exception:
            pass
