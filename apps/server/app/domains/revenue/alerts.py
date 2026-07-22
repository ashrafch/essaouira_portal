"""Pricing alerts + manual comp-set (Fase 4).

All alerts are computed on demand (no table) from the rate calendar, bookings
and the manual comp-set. Transparent and read-only: they flag situations for the
owner to act on, they never change prices automatically.
"""

from datetime import date, timedelta

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.domains.revenue.service import _daterange, _unit_occupied_nights
from app.models.market_rate import MarketRate
from app.models.rate_calendar import RateCalendar
from app.models.unit import Unit

OUT_OF_BAND = 0.25  # ±25% vs comp-set market rate
LOW_OCC_WINDOW = 14  # days
LOW_OCC_THRESHOLD = 0.30


# --------------------------------------------------------------------------- #
# Comp-set (market rates) CRUD
# --------------------------------------------------------------------------- #


def _validate_unit(db: Session, unit_id: int | None) -> None:
    if unit_id is not None and db.query(Unit).filter(Unit.id == unit_id).first() is None:
        raise HTTPException(status_code=400, detail="Unità inesistente")


def list_market_rates(db: Session) -> list:
    return (
        db.query(MarketRate)
        .order_by(MarketRate.unit_id.is_(None).desc(), MarketRate.start_date)
        .all()
    )


def create_market_rate(db: Session, payload) -> MarketRate:
    if payload.end_date < payload.start_date:
        raise HTTPException(status_code=400, detail="end_date deve essere >= start_date")
    _validate_unit(db, payload.unit_id)
    row = MarketRate(
        label=payload.label,
        nightly_rate=payload.nightly_rate,
        start_date=payload.start_date,
        end_date=payload.end_date,
        unit_id=payload.unit_id,
        is_active=payload.is_active,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def update_market_rate(db: Session, rate_id: int, payload) -> MarketRate:
    row = db.query(MarketRate).filter(MarketRate.id == rate_id).first()
    if row is None:
        raise HTTPException(status_code=404, detail="Tariffa di mercato non trovata")
    if payload.end_date < payload.start_date:
        raise HTTPException(status_code=400, detail="end_date deve essere >= start_date")
    _validate_unit(db, payload.unit_id)
    row.label = payload.label
    row.nightly_rate = payload.nightly_rate
    row.start_date = payload.start_date
    row.end_date = payload.end_date
    row.unit_id = payload.unit_id
    row.is_active = payload.is_active
    db.commit()
    db.refresh(row)
    return row


def delete_market_rate(db: Session, rate_id: int) -> None:
    row = db.query(MarketRate).filter(MarketRate.id == rate_id).first()
    if row is None:
        raise HTTPException(status_code=404, detail="Tariffa di mercato non trovata")
    db.delete(row)
    db.commit()


# --------------------------------------------------------------------------- #
# Pricing alerts
# --------------------------------------------------------------------------- #


def _market_rate_for(rates: list, unit_id: int, d: date) -> float | None:
    """Applicable comp-set rate for a unit/date: unit-specific first, else
    portfolio-wide; the mean when several match."""
    unit_specific = [
        float(r.nightly_rate)
        for r in rates
        if r.unit_id == unit_id and r.start_date <= d <= r.end_date
    ]
    if unit_specific:
        return sum(unit_specific) / len(unit_specific)
    portfolio = [
        float(r.nightly_rate)
        for r in rates
        if r.unit_id is None and r.start_date <= d <= r.end_date
    ]
    if portfolio:
        return sum(portfolio) / len(portfolio)
    return None


def compute_pricing_alerts(
    db: Session, horizon_days: int = 60, reference_date: date | None = None
) -> list:
    today = reference_date or date.today()
    end = today + timedelta(days=max(1, horizon_days))
    units = db.query(Unit).order_by(Unit.id).all()
    market = (
        db.query(MarketRate)
        .filter(
            MarketRate.is_active.is_(True),
            MarketRate.start_date <= end,
            MarketRate.end_date >= today,
        )
        .all()
    )

    alerts: list[dict] = []
    for unit in units:
        base = float(unit.base_nightly_rate) if unit.base_nightly_rate is not None else None
        rc = {
            r.date: float(r.price)
            for r in db.query(RateCalendar).filter(
                RateCalendar.unit_id == unit.id,
                RateCalendar.date >= today,
                RateCalendar.date < end,
            )
        }
        occ_nights = _unit_occupied_nights(
            db, unit.id, today - timedelta(days=1), end + timedelta(days=1)
        )

        below = above = orphans = 0
        for d in _daterange(today, end):
            price = rc.get(d, base)
            market_rate = _market_rate_for(market, unit.id, d)
            if price is not None and market_rate and market_rate > 0:
                dev = (price - market_rate) / market_rate
                if dev <= -OUT_OF_BAND:
                    below += 1
                elif dev >= OUT_OF_BAND:
                    above += 1
            if (
                d not in occ_nights
                and (d - timedelta(days=1)) in occ_nights
                and (d + timedelta(days=1)) in occ_nights
            ):
                orphans += 1

        if below:
            alerts.append(
                {
                    "code": "price_below_market",
                    "severity": "warning",
                    "unit_id": unit.id,
                    "unit_name": unit.name,
                    "title": "Prezzo sotto il mercato",
                    "details": f"{below} giorni con prezzo ≥25% sotto la tariffa di mercato",
                    "count": below,
                }
            )
        if above:
            alerts.append(
                {
                    "code": "price_above_market",
                    "severity": "info",
                    "unit_id": unit.id,
                    "unit_name": unit.name,
                    "title": "Prezzo sopra il mercato",
                    "details": f"{above} giorni con prezzo ≥25% sopra la tariffa di mercato",
                    "count": above,
                }
            )
        if orphans:
            alerts.append(
                {
                    "code": "orphan_nights",
                    "severity": "warning",
                    "unit_id": unit.id,
                    "unit_name": unit.name,
                    "title": "Notti orfane",
                    "details": f"{orphans} notti singole libere tra due prenotazioni da riempire",
                    "count": orphans,
                }
            )

        window_nights = sum(
            1 for d in _daterange(today, today + timedelta(days=LOW_OCC_WINDOW)) if d in occ_nights
        )
        occ_rate = window_nights / LOW_OCC_WINDOW
        if occ_rate < LOW_OCC_THRESHOLD:
            alerts.append(
                {
                    "code": "low_forward_occupancy",
                    "severity": "high" if occ_rate < 0.15 else "warning",
                    "unit_id": unit.id,
                    "unit_name": unit.name,
                    "title": "Occupazione futura bassa",
                    "details": (
                        f"Occupazione prossimi {LOW_OCC_WINDOW} giorni: "
                        f"{round(occ_rate * 100)}%"
                    ),
                    "count": window_nights,
                }
            )

    return alerts
