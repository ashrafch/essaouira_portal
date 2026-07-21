from datetime import date

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.db import get_db
from app.domains.revenue import service
from app.domains.revenue.schemas import (
    ApplyRecommendationsIn,
    ApplyRecommendationsOut,
    RateCalendarOut,
    RateCalendarUpsertIn,
    RecommendationsOut,
)

router = APIRouter(prefix="/revenue", tags=["revenue"])


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
