"""Revenue-management service (Fase 0).

Owns the per-unit rate calendar and a first, honest price-recommendation
engine driven purely by the portfolio's own data (base rate, day-of-week,
forward occupancy). No external market feed is used — recommendations are
transparent and reproducible, not a black box.
"""

from datetime import date, timedelta

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models.booking import Booking
from app.models.rate_calendar import RateCalendar
from app.models.unit import Unit

# Monday=0 .. Sunday=6. Friday and Saturday nights carry a weekend premium.
WEEKEND_WEEKDAYS = (4, 5)


def _get_unit_or_404(db: Session, unit_id: int) -> Unit:
    unit = db.query(Unit).filter(Unit.id == unit_id).first()
    if not unit:
        raise HTTPException(status_code=404, detail="Unità non trovata")
    return unit


def _daterange(from_date: date, to_date: date):
    d = from_date
    while d < to_date:
        yield d
        d = d + timedelta(days=1)


def default_month_range(
    from_date: date | None, to_date: date | None
) -> tuple[date, date]:
    """Fill missing bounds with the current calendar month [start, next start)."""
    if from_date and to_date:
        return from_date, to_date
    today = date.today()
    start = today.replace(day=1)
    if start.month == 12:
        nxt = date(start.year + 1, 1, 1)
    else:
        nxt = date(start.year, start.month + 1, 1)
    return (from_date or start), (to_date or nxt)


def get_effective_nightly_prices(
    db: Session, unit: Unit, checkin: date, checkout: date
) -> list[float | None]:
    """Per-night price for a stay: the stored rate-calendar price where present,
    otherwise the unit base rate (which may be None). One element per night.

    An empty calendar therefore reproduces the legacy flat-rate behaviour.
    """
    nights = (checkout - checkin).days
    if nights <= 0:
        return []
    rows = (
        db.query(RateCalendar)
        .filter(
            RateCalendar.unit_id == unit.id,
            RateCalendar.date >= checkin,
            RateCalendar.date < checkout,
        )
        .all()
    )
    by_date = {r.date: float(r.price) for r in rows}
    base = float(unit.base_nightly_rate) if unit.base_nightly_rate is not None else None
    return [by_date.get(d, base) for d in _daterange(checkin, checkout)]


def list_rate_calendar(
    db: Session, unit_id: int, from_date: date, to_date: date
) -> dict:
    """Full per-date view over [from_date, to_date): stored rows plus base-rate
    fallbacks, so the UI always has a complete calendar to render."""
    unit = _get_unit_or_404(db, unit_id)
    rows = {
        r.date: r
        for r in db.query(RateCalendar).filter(
            RateCalendar.unit_id == unit_id,
            RateCalendar.date >= from_date,
            RateCalendar.date < to_date,
        )
    }
    base = float(unit.base_nightly_rate) if unit.base_nightly_rate is not None else None
    currency = unit.currency or "EUR"

    days = []
    for d in _daterange(from_date, to_date):
        r = rows.get(d)
        if r is not None:
            days.append(
                {
                    "date": d,
                    "price": float(r.price),
                    "min_stay": r.min_stay,
                    "currency": r.currency or currency,
                    "price_source": r.price_source,
                    "is_override": r.is_override,
                    "is_stored": True,
                }
            )
        else:
            days.append(
                {
                    "date": d,
                    "price": base,
                    "min_stay": None,
                    "currency": currency,
                    "price_source": "base",
                    "is_override": False,
                    "is_stored": False,
                }
            )

    return {
        "unit_id": unit.id,
        "unit_name": unit.name,
        "from_date": from_date,
        "to_date": to_date,
        "currency": currency,
        "days": days,
    }


def upsert_rate_calendar(db: Session, unit_id: int, entries: list) -> dict:
    """Insert/update manual rate rows. Manual edits are marked as overrides so
    later recomputes/recommendations leave them untouched."""
    unit = _get_unit_or_404(db, unit_id)
    if not entries:
        raise HTTPException(status_code=400, detail="Nessuna tariffa da salvare")
    default_currency = unit.currency or "EUR"

    for e in entries:
        row = (
            db.query(RateCalendar)
            .filter(RateCalendar.unit_id == unit_id, RateCalendar.date == e.date)
            .first()
        )
        if row is None:
            row = RateCalendar(
                unit_id=unit_id,
                date=e.date,
                price=e.price,
                min_stay=e.min_stay,
                currency=e.currency or default_currency,
                price_source="manual",
                is_override=True,
            )
            db.add(row)
        else:
            row.price = e.price
            row.min_stay = e.min_stay
            if e.currency:
                row.currency = e.currency
            row.price_source = "manual"
            row.is_override = True
    db.commit()

    return list_rate_calendar(
        db,
        unit_id,
        min(e.date for e in entries),
        max(e.date for e in entries) + timedelta(days=1),
    )


def delete_rate_day(db: Session, unit_id: int, day: date) -> None:
    """Remove a stored rate for a date (reverts that day to the base rate)."""
    row = (
        db.query(RateCalendar)
        .filter(RateCalendar.unit_id == unit_id, RateCalendar.date == day)
        .first()
    )
    if row is None:
        raise HTTPException(
            status_code=404, detail="Nessuna tariffa impostata per questa data"
        )
    db.delete(row)
    db.commit()


def recommend_prices(db: Session, unit: Unit, from_date: date, to_date: date) -> list:
    """Transparent price recommendation: base rate adjusted by day-of-week and
    the portfolio's forward occupancy on each date. Requires a base rate."""
    base = float(unit.base_nightly_rate) if unit.base_nightly_rate is not None else None
    if base is None:
        raise HTTPException(
            status_code=400,
            detail=(
                "L'unità non ha una tariffa base: impostala prima di generare "
                "raccomandazioni."
            ),
        )

    total_units = db.query(Unit).count() or 1
    bookings = (
        db.query(Booking)
        .filter(
            Booking.checkin_date < to_date,
            Booking.checkout_date > from_date,
            Booking.status != "cancelled",
        )
        .all()
    )

    recs = []
    for d in _daterange(from_date, to_date):
        occupied_units = {
            b.unit_id for b in bookings if b.checkin_date <= d < b.checkout_date
        }
        occ = len(occupied_units) / total_units

        price = base
        reasons = []
        if d.weekday() in WEEKEND_WEEKDAYS:
            price *= 1.15
            reasons.append("weekend +15%")
        if occ >= 0.8:
            price *= 1.25
            reasons.append("occupazione alta +25%")
        elif occ >= 0.6:
            price *= 1.12
            reasons.append("occupazione media +12%")
        elif occ < 0.3:
            price *= 0.90
            reasons.append("occupazione bassa −10%")

        recs.append(
            {
                "unit_id": unit.id,
                "date": d,
                "base_price": round(base, 2),
                "recommended_price": round(price, 2),
                "occupancy": round(occ, 2),
                "reason": ", ".join(reasons) or "prezzo base",
            }
        )
    return recs


def get_recommendations(
    db: Session, unit_id: int, from_date: date, to_date: date
) -> dict:
    unit = _get_unit_or_404(db, unit_id)
    return {
        "unit_id": unit.id,
        "unit_name": unit.name,
        "from_date": from_date,
        "to_date": to_date,
        "recommendations": recommend_prices(db, unit, from_date, to_date),
    }


def apply_recommendations(
    db: Session, unit_id: int, from_date: date, to_date: date
) -> dict:
    """Persist recommendations as `reco` prices, skipping manual overrides."""
    unit = _get_unit_or_404(db, unit_id)
    recs = recommend_prices(db, unit, from_date, to_date)
    default_currency = unit.currency or "EUR"

    applied = 0
    skipped = 0
    for r in recs:
        row = (
            db.query(RateCalendar)
            .filter(RateCalendar.unit_id == unit_id, RateCalendar.date == r["date"])
            .first()
        )
        if row is not None and row.is_override:
            skipped += 1
            continue
        if row is None:
            row = RateCalendar(
                unit_id=unit_id,
                date=r["date"],
                price=r["recommended_price"],
                currency=default_currency,
                price_source="reco",
                is_override=False,
            )
            db.add(row)
        else:
            row.price = r["recommended_price"]
            row.price_source = "reco"
        applied += 1
    db.commit()

    return {"unit_id": unit.id, "applied": applied, "skipped_overrides": skipped}
