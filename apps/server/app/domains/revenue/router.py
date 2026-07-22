from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy.orm import Session

from app.db import get_db
from app.domains.revenue import alerts, channels, service
from app.domains.revenue.ical import export_token
from app.domains.revenue.schemas import (
    ApplyRecommendationsIn,
    ApplyRecommendationsOut,
    ChannelConnectionIn,
    ChannelConnectionOut,
    ExportInfoOut,
    LeadTimeRuleIn,
    LeadTimeRuleOut,
    MarketRateIn,
    MarketRateOut,
    PricePushResultOut,
    PricingAlertOut,
    RateCalendarOut,
    RateCalendarUpsertIn,
    RecommendationsOut,
    SeasonIn,
    SeasonOut,
    SyncAllResultOut,
    SyncResultOut,
)

router = APIRouter(prefix="/revenue", tags=["revenue"])


# ---------- iCal EXPORT (public, token-protected — whitelisted in auth mw) ----------


@router.get("/ical/units/{unit_id}.ics")
def export_unit_ical(unit_id: int, token: str = "", db: Session = Depends(get_db)):
    # Constant-ish check; wrong/missing token looks like "not found" (no oracle).
    if not token or token != export_token(unit_id):
        raise HTTPException(status_code=404, detail="Not found")
    ics = channels.build_unit_export(db, unit_id)
    return Response(
        content=ics,
        media_type="text/calendar",
        headers={"Content-Disposition": f'inline; filename="unit-{unit_id}.ics"'},
    )


@router.get("/channels/units/{unit_id}/export-info", response_model=ExportInfoOut)
def channel_export_info(unit_id: int, db: Session = Depends(get_db)):
    channels.build_unit_export(db, unit_id)  # 404s if the unit doesn't exist
    return ExportInfoOut(
        unit_id=unit_id,
        ical_path=f"/revenue/ical/units/{unit_id}.ics",
        token=export_token(unit_id),
    )


@router.get("/rate-calendar", response_model=RateCalendarOut)
def get_rate_calendar(
    unit_id: int,
    from_date: date | None = None,
    to_date: date | None = None,
    db: Session = Depends(get_db),
):
    f, t = service.default_month_range(from_date, to_date)
    if t <= f:
        raise HTTPException(status_code=400, detail="to_date deve essere dopo from_date")
    return service.list_rate_calendar(db, unit_id, f, t)


@router.put("/rate-calendar", response_model=RateCalendarOut)
def put_rate_calendar(payload: RateCalendarUpsertIn, db: Session = Depends(get_db)):
    return service.upsert_rate_calendar(db, payload.unit_id, payload.entries)


@router.delete("/rate-calendar", status_code=204)
def delete_rate_calendar_day(
    unit_id: int, day: date, db: Session = Depends(get_db)
):
    service.delete_rate_day(db, unit_id, day)
    return


@router.get("/recommendations", response_model=RecommendationsOut)
def read_recommendations(
    unit_id: int,
    from_date: date | None = None,
    to_date: date | None = None,
    db: Session = Depends(get_db),
):
    f, t = service.default_month_range(from_date, to_date)
    if t <= f:
        raise HTTPException(status_code=400, detail="to_date deve essere dopo from_date")
    return service.get_recommendations(db, unit_id, f, t)


@router.post("/recommendations/apply", response_model=ApplyRecommendationsOut)
def apply_recommendations_endpoint(
    payload: ApplyRecommendationsIn, db: Session = Depends(get_db)
):
    if payload.to_date <= payload.from_date:
        raise HTTPException(status_code=400, detail="to_date deve essere dopo from_date")
    return service.apply_recommendations(
        db, payload.unit_id, payload.from_date, payload.to_date
    )


# ---------- SEASONS ----------


@router.get("/seasons", response_model=list[SeasonOut])
def list_seasons(db: Session = Depends(get_db)):
    return service.list_seasons(db)


@router.post("/seasons", response_model=SeasonOut)
def create_season(payload: SeasonIn, db: Session = Depends(get_db)):
    return service.create_season(db, payload)


@router.put("/seasons/{season_id}", response_model=SeasonOut)
def update_season(season_id: int, payload: SeasonIn, db: Session = Depends(get_db)):
    return service.update_season(db, season_id, payload)


@router.delete("/seasons/{season_id}", status_code=204)
def delete_season(season_id: int, db: Session = Depends(get_db)):
    service.delete_season(db, season_id)
    return


# ---------- LEAD-TIME RULES ----------


@router.get("/lead-time-rules", response_model=list[LeadTimeRuleOut])
def list_lead_time_rules(db: Session = Depends(get_db)):
    return service.list_lead_time_rules(db)


@router.post("/lead-time-rules", response_model=LeadTimeRuleOut)
def create_lead_time_rule(payload: LeadTimeRuleIn, db: Session = Depends(get_db)):
    return service.create_lead_time_rule(db, payload)


@router.put("/lead-time-rules/{rule_id}", response_model=LeadTimeRuleOut)
def update_lead_time_rule(
    rule_id: int, payload: LeadTimeRuleIn, db: Session = Depends(get_db)
):
    return service.update_lead_time_rule(db, rule_id, payload)


@router.delete("/lead-time-rules/{rule_id}", status_code=204)
def delete_lead_time_rule(rule_id: int, db: Session = Depends(get_db)):
    service.delete_lead_time_rule(db, rule_id)
    return


# ---------- CHANNEL CONNECTIONS (iCal availability sync) ----------


@router.get("/channels", response_model=list[ChannelConnectionOut])
def list_channels(unit_id: int | None = None, db: Session = Depends(get_db)):
    return channels.list_connections(db, unit_id)


@router.post("/channels", response_model=ChannelConnectionOut)
def create_channel(payload: ChannelConnectionIn, db: Session = Depends(get_db)):
    return channels.create_connection(db, payload)


@router.put("/channels/{connection_id}", response_model=ChannelConnectionOut)
def update_channel(
    connection_id: int, payload: ChannelConnectionIn, db: Session = Depends(get_db)
):
    return channels.update_connection(db, connection_id, payload)


@router.delete("/channels/{connection_id}", status_code=204)
def delete_channel(connection_id: int, db: Session = Depends(get_db)):
    channels.delete_connection(db, connection_id)
    return


@router.post("/channels/sync-all", response_model=SyncAllResultOut)
def sync_all_channels(db: Session = Depends(get_db)):
    return channels.sync_all(db)


@router.post("/channels/{connection_id}/sync", response_model=SyncResultOut)
def sync_channel(connection_id: int, db: Session = Depends(get_db)):
    return channels.sync_channel(db, connection_id)


@router.post("/channels/{connection_id}/push-prices", response_model=PricePushResultOut)
def push_channel_prices(
    connection_id: int,
    from_date: date | None = None,
    to_date: date | None = None,
    db: Session = Depends(get_db),
):
    f, t = service.default_month_range(from_date, to_date)
    return channels.push_prices(db, connection_id, f, t)


# ---------- COMP-SET (market rates) + PRICING ALERTS ----------


@router.get("/market-rates", response_model=list[MarketRateOut])
def list_market_rates(db: Session = Depends(get_db)):
    return alerts.list_market_rates(db)


@router.post("/market-rates", response_model=MarketRateOut)
def create_market_rate(payload: MarketRateIn, db: Session = Depends(get_db)):
    return alerts.create_market_rate(db, payload)


@router.put("/market-rates/{rate_id}", response_model=MarketRateOut)
def update_market_rate(rate_id: int, payload: MarketRateIn, db: Session = Depends(get_db)):
    return alerts.update_market_rate(db, rate_id, payload)


@router.delete("/market-rates/{rate_id}", status_code=204)
def delete_market_rate(rate_id: int, db: Session = Depends(get_db)):
    alerts.delete_market_rate(db, rate_id)
    return


@router.get("/pricing-alerts", response_model=list[PricingAlertOut])
def pricing_alerts(horizon_days: int = 60, db: Session = Depends(get_db)):
    return alerts.compute_pricing_alerts(db, horizon_days=horizon_days)
