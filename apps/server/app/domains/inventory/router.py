from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from app.api.deps import require_owner
from app.core.tenant import normalize_tenant_id
from app.db import get_db
from app.domains.inventory.schemas import (
    PropertyCreate,
    PropertyOut,
    PropertyUpdate,
    UnitOut,
    UnitUpdate,
)
from app.models.property import Property
from app.models.smart_building import (
    DeviceTelemetry,
    SmartProviderConnection,
    SmartScenarioPackInstall,
    TelemetryInsight,
)
from app.models.unit import Unit

router = APIRouter()


# ---------- UNITS ----------


@router.get("/units", response_model=list[UnitOut])
def list_units(db: Session = Depends(get_db)):
    units = db.query(Unit).all()
    return units


@router.put("/units/{unit_id}", response_model=UnitOut)
def update_unit(unit_id: int, payload: UnitUpdate, db: Session = Depends(get_db)):
    unit = db.query(Unit).filter(Unit.id == unit_id).first()
    if not unit:
        raise HTTPException(status_code=404, detail="Unità non trovata")

    if payload.property_id is not None:
        unit.property_id = payload.property_id
    if payload.name is not None:
        unit.name = payload.name
    if payload.size_m2 is not None:
        unit.size_m2 = payload.size_m2
    if payload.capacity is not None:
        unit.capacity = payload.capacity
    if payload.base_nightly_rate is not None:
        unit.base_nightly_rate = payload.base_nightly_rate
    if payload.currency is not None:
        unit.currency = payload.currency
    if payload.min_price is not None:
        unit.min_price = payload.min_price
    if payload.max_price is not None:
        unit.max_price = payload.max_price

    db.commit()
    db.refresh(unit)
    return unit


# ---------- PROPERTIES ----------


def _slugify_property(value: str) -> str:
    raw = (value or "").strip().lower()
    slug = "".join(ch if ch.isalnum() else "-" for ch in raw)
    while "--" in slug:
        slug = slug.replace("--", "-")
    return slug.strip("-")[:64] or "property"


@router.get("/properties", response_model=list[PropertyOut])
def list_properties(request: Request, db: Session = Depends(get_db)):
    tenant_id = normalize_tenant_id(getattr(request.state, "tenant_id", None))
    return (
        db.query(Property)
        .filter(Property.tenant_id == tenant_id)
        .order_by(Property.name.asc(), Property.id.asc())
        .all()
    )


@router.post("/properties", response_model=PropertyOut)
def create_property(payload: PropertyCreate, request: Request, db: Session = Depends(get_db)):
    require_owner(request)
    tenant_id = normalize_tenant_id(getattr(request.state, "tenant_id", None))
    code = _slugify_property(payload.code or payload.name)
    exists = (
        db.query(Property)
        .filter(Property.tenant_id == tenant_id, Property.code == code)
        .first()
    )
    if exists is not None:
        raise HTTPException(status_code=400, detail="Property code gia presente per questo tenant")
    prop = Property(
        tenant_id=tenant_id,
        name=payload.name.strip(),
        code=code,
        status=(payload.status or "active").strip().lower(),
        timezone=payload.timezone.strip() if payload.timezone else "Africa/Casablanca",
        address_line1=payload.address_line1,
        city=payload.city,
        country=payload.country,
        metadata_json=payload.metadata_json,
        is_active=payload.is_active,
    )
    db.add(prop)
    db.commit()
    db.refresh(prop)
    return prop


@router.get("/properties/{property_id}", response_model=PropertyOut)
def get_property(property_id: int, request: Request, db: Session = Depends(get_db)):
    tenant_id = normalize_tenant_id(getattr(request.state, "tenant_id", None))
    prop = (
        db.query(Property)
        .filter(Property.id == property_id, Property.tenant_id == tenant_id)
        .first()
    )
    if prop is None:
        raise HTTPException(status_code=404, detail="Property non trovata")
    return prop


@router.put("/properties/{property_id}", response_model=PropertyOut)
def update_property(
    property_id: int, payload: PropertyUpdate, request: Request, db: Session = Depends(get_db)
):
    require_owner(request)
    tenant_id = normalize_tenant_id(getattr(request.state, "tenant_id", None))
    prop = (
        db.query(Property)
        .filter(Property.id == property_id, Property.tenant_id == tenant_id)
        .first()
    )
    if prop is None:
        raise HTTPException(status_code=404, detail="Property non trovata")
    if payload.name is not None:
        prop.name = payload.name
    if payload.code is not None:
        next_code = _slugify_property(payload.code)
        conflict = (
            db.query(Property)
            .filter(Property.tenant_id == tenant_id, Property.code == next_code, Property.id != property_id)
            .first()
        )
        if conflict is not None:
            raise HTTPException(status_code=400, detail="Property code gia presente per questo tenant")
        prop.code = next_code
    if payload.status is not None:
        prop.status = payload.status.strip().lower()
    if payload.timezone is not None:
        prop.timezone = payload.timezone
    if payload.address_line1 is not None:
        prop.address_line1 = payload.address_line1
    if payload.city is not None:
        prop.city = payload.city
    if payload.country is not None:
        prop.country = payload.country
    if payload.metadata_json is not None:
        prop.metadata_json = payload.metadata_json
    if payload.is_active is not None:
        prop.is_active = payload.is_active
    db.commit()
    db.refresh(prop)
    return prop


@router.delete("/properties/{property_id}", status_code=204)
def delete_property(property_id: int, request: Request, db: Session = Depends(get_db)):
    require_owner(request)
    tenant_id = normalize_tenant_id(getattr(request.state, "tenant_id", None))
    prop = (
        db.query(Property)
        .filter(Property.id == property_id, Property.tenant_id == tenant_id)
        .first()
    )
    if prop is None:
        raise HTTPException(status_code=404, detail="Property non trovata")

    linked_units = db.query(Unit).filter(Unit.property_id == property_id).count()
    linked_connections = (
        db.query(SmartProviderConnection)
        .filter(
            SmartProviderConnection.tenant_id == tenant_id,
            SmartProviderConnection.property_id == property_id,
        )
        .count()
    )
    linked_packs = (
        db.query(SmartScenarioPackInstall)
        .filter(
            SmartScenarioPackInstall.tenant_id == tenant_id,
            SmartScenarioPackInstall.property_id == property_id,
        )
        .count()
    )
    linked_telemetry = (
        db.query(DeviceTelemetry)
        .filter(
            DeviceTelemetry.tenant_id == tenant_id,
            DeviceTelemetry.property_id == property_id,
        )
        .count()
    )
    linked_insights = (
        db.query(TelemetryInsight)
        .filter(
            TelemetryInsight.tenant_id == tenant_id,
            TelemetryInsight.property_id == property_id,
        )
        .count()
    )

    blockers = []
    if linked_units:
        blockers.append(f"unita collegate: {linked_units}")
    if linked_connections:
        blockers.append(f"connessioni provider: {linked_connections}")
    if linked_packs:
        blockers.append(f"scenario packs: {linked_packs}")
    if linked_telemetry:
        blockers.append(f"telemetry records: {linked_telemetry}")
    if linked_insights:
        blockers.append(f"telemetry insights: {linked_insights}")
    if blockers:
        raise HTTPException(
            status_code=400,
            detail="Impossibile eliminare property con dipendenze attive (" + ", ".join(blockers) + ").",
        )

    db.delete(prop)
    db.commit()
    return
