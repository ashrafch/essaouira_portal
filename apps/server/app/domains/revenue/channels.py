"""Channel (iCal) availability sync — Fase 3.

Import: pull a channel's busy dates and create local blocking bookings, skipping
(and reporting) any that would collide with an existing reservation. Export:
render our unit calendar as .ics for the channel to import.

Simulation-friendly: ``apply_ical_import`` works on raw .ics text so tests never
touch the network; ``sync_channel`` adds the real fetch on top.
"""

from datetime import datetime, timezone

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.domains.revenue.ical import (
    build_ical_for_unit,
    fetch_ical,
    parse_ical_events,
)
from app.models.booking import Booking
from app.models.channel_connection import ChannelConnection
from app.models.unit import Unit


def _get_unit_or_404(db: Session, unit_id: int) -> Unit:
    unit = db.query(Unit).filter(Unit.id == unit_id).first()
    if not unit:
        raise HTTPException(status_code=404, detail="Unità non trovata")
    return unit


def _get_connection_or_404(db: Session, connection_id: int) -> ChannelConnection:
    conn = db.query(ChannelConnection).filter(ChannelConnection.id == connection_id).first()
    if not conn:
        raise HTTPException(status_code=404, detail="Connessione non trovata")
    return conn


def _import_note(connection_id: int, uid: str) -> str:
    return f"ICAL:{connection_id}:{uid}"


def _import_like(connection_id: int) -> str:
    return f"ICAL:{connection_id}:%"


# --------------------------------------------------------------------------- #
# CRUD
# --------------------------------------------------------------------------- #


def list_connections(db: Session, unit_id: int | None = None) -> list:
    q = db.query(ChannelConnection)
    if unit_id is not None:
        q = q.filter(ChannelConnection.unit_id == unit_id)
    return q.order_by(ChannelConnection.unit_id, ChannelConnection.id).all()


def create_connection(db: Session, payload) -> ChannelConnection:
    _get_unit_or_404(db, payload.unit_id)
    conn = ChannelConnection(
        unit_id=payload.unit_id,
        channel=(payload.channel or "other").strip().lower(),
        ical_import_url=payload.ical_import_url,
        external_ref=payload.external_ref,
        is_active=payload.is_active,
    )
    db.add(conn)
    db.commit()
    db.refresh(conn)
    return conn


def update_connection(db: Session, connection_id: int, payload) -> ChannelConnection:
    conn = _get_connection_or_404(db, connection_id)
    _get_unit_or_404(db, payload.unit_id)
    conn.unit_id = payload.unit_id
    conn.channel = (payload.channel or "other").strip().lower()
    conn.ical_import_url = payload.ical_import_url
    conn.external_ref = payload.external_ref
    conn.is_active = payload.is_active
    db.commit()
    db.refresh(conn)
    return conn


def delete_connection(db: Session, connection_id: int) -> None:
    conn = _get_connection_or_404(db, connection_id)
    # Remove the blocks this connection imported so they don't linger.
    db.query(Booking).filter(
        Booking.unit_id == conn.unit_id,
        Booking.notes.like(_import_like(conn.id)),
    ).delete(synchronize_session=False)
    db.delete(conn)
    db.commit()


# --------------------------------------------------------------------------- #
# Export
# --------------------------------------------------------------------------- #


def build_unit_export(db: Session, unit_id: int) -> str:
    unit = _get_unit_or_404(db, unit_id)
    bookings = (
        db.query(Booking)
        .filter(Booking.unit_id == unit_id, Booking.status != "cancelled")
        .order_by(Booking.checkin_date)
        .all()
    )
    return build_ical_for_unit(unit.name, bookings)


# --------------------------------------------------------------------------- #
# Import
# --------------------------------------------------------------------------- #


def apply_ical_import(db: Session, connection: ChannelConnection, ics_text: str) -> dict:
    """Refresh this connection's imported blocks from raw .ics text.

    Idempotent: previous blocks for this connection are removed first. Events
    that would overlap a booking from another source are reported as conflicts
    and skipped (anti double-booking)."""
    events = parse_ical_events(ics_text)

    # Drop this connection's previous imports, then look at everything else.
    db.query(Booking).filter(
        Booking.unit_id == connection.unit_id,
        Booking.notes.like(_import_like(connection.id)),
    ).delete(synchronize_session=False)
    db.flush()

    existing = (
        db.query(Booking)
        .filter(Booking.unit_id == connection.unit_id, Booking.status != "cancelled")
        .all()
    )

    created = 0
    conflicts: list[dict] = []
    for ev in events:
        start, end = ev.get("start"), ev.get("end")
        if not start or not end or end <= start:
            continue
        clash = next(
            (b for b in existing if b.checkin_date < end and b.checkout_date > start),
            None,
        )
        if clash is not None:
            conflicts.append({"start": start.isoformat(), "end": end.isoformat()})
            continue
        block = Booking(
            unit_id=connection.unit_id,
            guest_name=f"{connection.channel.title()} (blocco)",
            source=connection.channel,
            status="confirmed",
            checkin_date=start,
            checkout_date=end,
            currency="EUR",
            notes=_import_note(connection.id, ev.get("uid") or f"{start}_{end}"),
        )
        db.add(block)
        existing.append(block)  # prevent double-creating overlapping feed events
        created += 1

    connection.last_sync_at = datetime.now(timezone.utc)
    connection.last_sync_status = "partial" if conflicts else "ok"
    connection.last_sync_message = (
        f"{created} blocchi importati, {len(conflicts)} conflitti"
    )
    db.commit()
    return {"created": created, "conflicts": conflicts, "events": len(events)}


def sync_channel(db: Session, connection_id: int) -> dict:
    conn = _get_connection_or_404(db, connection_id)
    if not conn.ical_import_url:
        raise HTTPException(
            status_code=400, detail="La connessione non ha un URL iCal di import"
        )
    try:
        text = fetch_ical(conn.ical_import_url)
    except Exception as exc:  # noqa: BLE001 — surface any fetch failure to the operator
        conn.last_sync_at = datetime.now(timezone.utc)
        conn.last_sync_status = "error"
        conn.last_sync_message = f"Download fallito: {exc}"
        db.commit()
        raise HTTPException(status_code=502, detail=f"Impossibile scaricare l'iCal: {exc}")
    result = apply_ical_import(db, conn, text)
    result["connection_id"] = conn.id
    return result


def sync_all(db: Session) -> dict:
    """Sync every active connection that has an import URL. Intended to be
    triggered by an external scheduler (cron/systemd timer) — the monolith has
    no in-process scheduler by design."""
    conns = (
        db.query(ChannelConnection)
        .filter(
            ChannelConnection.is_active.is_(True),
            ChannelConnection.ical_import_url.isnot(None),
        )
        .all()
    )
    results = []
    synced = errors = 0
    for c in conns:
        try:
            r = sync_channel(db, c.id)
            synced += 1
            results.append(
                {
                    "connection_id": c.id,
                    "status": "ok",
                    "created": r["created"],
                    "conflicts": len(r["conflicts"]),
                }
            )
        except HTTPException as exc:
            errors += 1
            results.append(
                {"connection_id": c.id, "status": "error", "detail": str(exc.detail)}
            )
    return {"synced": synced, "errors": errors, "results": results}


def push_prices(db: Session, connection_id: int, from_date, to_date) -> dict:
    """Push our rate calendar to the channel.

    SIMULATED. Real OTA price push needs the channel's connectivity API (an
    approved account / certified channel manager). This returns a labelled
    simulation so the flow and UI exist without pretending hardware/API work.
    """
    from app.domains.revenue.service import list_rate_calendar

    conn = _get_connection_or_404(db, connection_id)
    cal = list_rate_calendar(db, conn.unit_id, from_date, to_date)
    pushed = sum(1 for d in cal["days"] if d.get("price") is not None)
    return {
        "connection_id": conn.id,
        "simulated": True,
        "pushed": pushed,
        "status": "simulated",
        "message": (
            f"Simulazione: {pushed} tariffe pronte per il push verso "
            f"{conn.channel}. Il push reale richiede l'API di connettività del canale."
        ),
    }
