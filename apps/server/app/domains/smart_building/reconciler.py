"""Optional background reconciliation of the building link.

Push delivery is the fast path; this is the slow, boring one that guarantees
convergence. It exists because a missed POST is invisible: without a periodic
re-read the portal would keep showing stale state and nobody would know.

Off by default (``SMART_POLL_INTERVAL_SECONDS=0``). When enabled it runs one
tenant — the admin tenant — because the shared ingest secret is single-tenant by
design; a multi-tenant deployment should drive reconciliation per tenant from an
external scheduler instead (``POST /smart/link/reconcile``).
"""

from __future__ import annotations

import asyncio
import logging

from app.core.config import settings
from app.db import SessionLocal
from app.domains.smart_building.service import SmartBuildingService

logger = logging.getLogger("app.smart.reconciler")

# Never hammer the building: one minute is already frequent for a property.
MIN_INTERVAL_SECONDS = 60


def _reconcile_once() -> dict[str, object] | None:
    db = SessionLocal()
    try:
        service = SmartBuildingService(
            db=db, tenant_id=settings.admin_tenant_id, role="owner"
        )
        return service.reconcile_link()
    finally:
        db.close()


async def reconciliation_loop() -> None:
    interval = max(MIN_INTERVAL_SECONDS, settings.smart_poll_interval_seconds)
    logger.info("Smart link reconciliation enabled every %ss", interval)
    while True:
        try:
            await asyncio.sleep(interval)
            # The service is synchronous SQLAlchemy: run it off the event loop so
            # a slow Home Assistant cannot stall request handling.
            result = await asyncio.to_thread(_reconcile_once)
            if result:
                logger.info(
                    "Smart link reconciled: %s devices imported, %s states updated, %s errors",
                    result.get("imported_devices"),
                    result.get("updated_states"),
                    result.get("errors"),
                )
        except asyncio.CancelledError:
            logger.info("Smart link reconciliation stopped")
            raise
        except Exception:
            # A provider outage must never kill the loop: log and retry next tick.
            logger.exception("Smart link reconciliation failed; retrying next cycle")


def start_reconciliation(loop_factory=reconciliation_loop) -> asyncio.Task | None:
    """Start the loop when configured. Returns the task so it can be cancelled."""
    if settings.smart_poll_interval_seconds <= 0:
        return None
    if settings.smart_provider_mode in {"mock", ""}:
        logger.info("Smart link reconciliation skipped: provider mode is mock")
        return None
    return asyncio.create_task(loop_factory(), name="smart-link-reconciliation")
