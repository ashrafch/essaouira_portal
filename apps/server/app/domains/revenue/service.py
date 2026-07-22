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
from app.models.revenue_rules import LeadTimeRule, PricingSeason
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


def get_min_stay(db: Session, unit_id: int, checkin_date: date) -> int | None:
    """Minimum-stay (nights) required to start a stay on ``checkin_date``, from
    the rate calendar. None means no constraint."""
    row = (
        db.query(RateCalendar)
        .filter(RateCalendar.unit_id == unit_id, RateCalendar.date == checkin_date)
        .first()
    )
    if row and row.min_stay:
        return row.min_stay
    return None


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


def _match_season(seasons: list, unit_id: int, d: date):
    """Highest-priority active season covering date ``d`` for this unit."""
    matches = [
        s
        for s in seasons
        if s.start_date <= d <= s.end_date
        and (s.unit_id is None or s.unit_id == unit_id)
    ]
    if not matches:
        return None
    matches.sort(key=lambda s: (s.priority, s.id), reverse=True)
    return matches[0]


def _match_lead_time_rule(rules: list, lead_days: int):
    """First active lead-time rule (ordered by min_days) matching ``lead_days``."""
    for r in rules:
        if lead_days >= r.min_days and (r.max_days is None or lead_days <= r.max_days):
            return r
    return None


def _unit_occupied_nights(db: Session, unit_id: int, start: date, end: date) -> set:
    """Set of nights this unit is occupied within [start, end) (non-cancelled)."""
    rows = (
        db.query(Booking)
        .filter(
            Booking.unit_id == unit_id,
            Booking.checkin_date < end,
            Booking.checkout_date > start,
            Booking.status != "cancelled",
        )
        .all()
    )
    occupied = set()
    for b in rows:
        night = max(b.checkin_date, start)
        stop = min(b.checkout_date, end)
        while night < stop:
            occupied.add(night)
            night = night + timedelta(days=1)
    return occupied


def recommend_prices(
    db: Session, unit: Unit, from_date: date, to_date: date, *, reference_date: date | None = None
) -> list:
    """Transparent price recommendation. Base rate adjusted, in order, by:
    seasonal profile → day-of-week → portfolio forward occupancy → lead time →
    orphan-gap fill, then clamped to the unit's [min_price, max_price] band.
    Every adjustment is recorded in ``reason``. Requires a base rate."""
    base = float(unit.base_nightly_rate) if unit.base_nightly_rate is not None else None
    if base is None:
        raise HTTPException(
            status_code=400,
            detail=(
                "L'unità non ha una tariffa base: impostala prima di generare "
                "raccomandazioni."
            ),
        )

    today = reference_date or date.today()
    min_price = float(unit.min_price) if unit.min_price is not None else None
    max_price = float(unit.max_price) if unit.max_price is not None else None

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

    seasons = (
        db.query(PricingSeason)
        .filter(
            PricingSeason.is_active.is_(True),
            PricingSeason.start_date <= to_date,
            PricingSeason.end_date >= from_date,
        )
        .all()
    )
    lead_rules = (
        db.query(LeadTimeRule)
        .filter(LeadTimeRule.is_active.is_(True))
        .order_by(LeadTimeRule.min_days)
        .all()
    )
    # Orphan detection needs the neighbours of the window too.
    unit_occupied = _unit_occupied_nights(
        db, unit.id, from_date - timedelta(days=1), to_date + timedelta(days=1)
    )

    recs = []
    for d in _daterange(from_date, to_date):
        price = base
        reasons = []

        season = _match_season(seasons, unit.id, d)
        if season is not None and season.adjustment_percent:
            price *= 1 + float(season.adjustment_percent) / 100.0
            sign = "+" if season.adjustment_percent >= 0 else ""
            reasons.append(f"{season.name} {sign}{float(season.adjustment_percent):.0f}%")

        if d.weekday() in WEEKEND_WEEKDAYS:
            price *= 1.15
            reasons.append("weekend +15%")

        occupied_units = {
            b.unit_id for b in bookings if b.checkin_date <= d < b.checkout_date
        }
        occ = len(occupied_units) / total_units
        if occ >= 0.8:
            price *= 1.25
            reasons.append("occupazione alta +25%")
        elif occ >= 0.6:
            price *= 1.12
            reasons.append("occupazione media +12%")
        elif occ < 0.3:
            price *= 0.90
            reasons.append("occupazione bassa −10%")

        lead_days = (d - today).days
        rule = _match_lead_time_rule(lead_rules, lead_days)
        if rule is not None and rule.adjustment_percent:
            price *= 1 + float(rule.adjustment_percent) / 100.0
            sign = "+" if rule.adjustment_percent >= 0 else ""
            reasons.append(f"{rule.label} {sign}{float(rule.adjustment_percent):.0f}%")

        # Orphan-gap fill: a single free night wedged between two occupied ones.
        is_free = d not in unit_occupied
        if (
            is_free
            and (d - timedelta(days=1)) in unit_occupied
            and (d + timedelta(days=1)) in unit_occupied
        ):
            price *= 0.80
            reasons.append("notte orfana −20%")

        # Guardrail: clamp the recommendation to the unit price band.
        if min_price is not None and price < min_price:
            price = min_price
            reasons.append(f"minimo {min_price:.0f}")
        if max_price is not None and price > max_price:
            price = max_price
            reasons.append(f"massimo {max_price:.0f}")

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


# --------------------------------------------------------------------------- #
# Pricing seasons CRUD
# --------------------------------------------------------------------------- #


def _validate_unit_exists(db: Session, unit_id: int | None) -> None:
    if unit_id is not None and db.query(Unit).filter(Unit.id == unit_id).first() is None:
        raise HTTPException(status_code=400, detail="Unità inesistente")


def list_seasons(db: Session) -> list:
    return (
        db.query(PricingSeason)
        .order_by(PricingSeason.priority.desc(), PricingSeason.start_date)
        .all()
    )


def create_season(db: Session, payload) -> PricingSeason:
    if payload.end_date < payload.start_date:
        raise HTTPException(status_code=400, detail="end_date deve essere >= start_date")
    _validate_unit_exists(db, payload.unit_id)
    row = PricingSeason(
        name=payload.name,
        start_date=payload.start_date,
        end_date=payload.end_date,
        adjustment_percent=payload.adjustment_percent,
        unit_id=payload.unit_id,
        priority=payload.priority,
        is_active=payload.is_active,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def update_season(db: Session, season_id: int, payload) -> PricingSeason:
    row = db.query(PricingSeason).filter(PricingSeason.id == season_id).first()
    if row is None:
        raise HTTPException(status_code=404, detail="Stagione non trovata")
    if payload.end_date < payload.start_date:
        raise HTTPException(status_code=400, detail="end_date deve essere >= start_date")
    _validate_unit_exists(db, payload.unit_id)
    row.name = payload.name
    row.start_date = payload.start_date
    row.end_date = payload.end_date
    row.adjustment_percent = payload.adjustment_percent
    row.unit_id = payload.unit_id
    row.priority = payload.priority
    row.is_active = payload.is_active
    db.commit()
    db.refresh(row)
    return row


def delete_season(db: Session, season_id: int) -> None:
    row = db.query(PricingSeason).filter(PricingSeason.id == season_id).first()
    if row is None:
        raise HTTPException(status_code=404, detail="Stagione non trovata")
    db.delete(row)
    db.commit()


# --------------------------------------------------------------------------- #
# Lead-time rules CRUD
# --------------------------------------------------------------------------- #


def _validate_lead_rule(payload) -> None:
    if payload.min_days < 0:
        raise HTTPException(status_code=400, detail="min_days deve essere >= 0")
    if payload.max_days is not None and payload.max_days < payload.min_days:
        raise HTTPException(status_code=400, detail="max_days deve essere >= min_days")


def list_lead_time_rules(db: Session) -> list:
    return db.query(LeadTimeRule).order_by(LeadTimeRule.min_days).all()


def create_lead_time_rule(db: Session, payload) -> LeadTimeRule:
    _validate_lead_rule(payload)
    row = LeadTimeRule(
        label=payload.label,
        min_days=payload.min_days,
        max_days=payload.max_days,
        adjustment_percent=payload.adjustment_percent,
        is_active=payload.is_active,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def update_lead_time_rule(db: Session, rule_id: int, payload) -> LeadTimeRule:
    row = db.query(LeadTimeRule).filter(LeadTimeRule.id == rule_id).first()
    if row is None:
        raise HTTPException(status_code=404, detail="Regola non trovata")
    _validate_lead_rule(payload)
    row.label = payload.label
    row.min_days = payload.min_days
    row.max_days = payload.max_days
    row.adjustment_percent = payload.adjustment_percent
    row.is_active = payload.is_active
    db.commit()
    db.refresh(row)
    return row


def delete_lead_time_rule(db: Session, rule_id: int) -> None:
    row = db.query(LeadTimeRule).filter(LeadTimeRule.id == rule_id).first()
    if row is None:
        raise HTTPException(status_code=404, detail="Regola non trovata")
    db.delete(row)
    db.commit()


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
