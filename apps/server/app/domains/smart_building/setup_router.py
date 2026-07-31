from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from app.db import get_db
from app.domains.smart_building.schemas import (
    SetupAssignDevicesIn,
    SetupConnectProviderIn,
    SetupEnableAutomationsIn,
    SetupImportDevicesIn,
    SetupMapZonesIn,
    SetupPropertyIn,
    SetupSessionOut,
    SetupStartOut,
    SetupUnitsIn,
    SetupZoneSuggestionsOut,
)
from app.domains.smart_building.service import SmartBuildingService


router = APIRouter(prefix="/setup", tags=["setup-wizard"])


def _service(request: Request, db: Session) -> SmartBuildingService:
    tenant_id = getattr(request.state, "tenant_id", None)
    if not tenant_id:
        raise HTTPException(status_code=401, detail="Tenant context missing")
    role = getattr(request.state, "role", "owner")
    return SmartBuildingService(db=db, tenant_id=tenant_id, role=role)


@router.post("/start", response_model=SetupStartOut)
def start_setup(request: Request, db: Session = Depends(get_db)):
    return _service(request, db).setup_start()


@router.post("/restart", response_model=SetupStartOut)
def restart_setup(request: Request, db: Session = Depends(get_db)):
    """Abandon the session in progress and begin again. Deletes no data."""
    return _service(request, db).setup_restart()


@router.get("/session", response_model=SetupSessionOut | None)
def get_setup_session(request: Request, db: Session = Depends(get_db)):
    return _service(request, db).get_setup_session()


@router.post("/property", response_model=SetupSessionOut)
def setup_property(payload: SetupPropertyIn, request: Request, db: Session = Depends(get_db)):
    return _service(request, db).setup_property(payload)


@router.post("/units", response_model=SetupSessionOut)
def setup_units(payload: SetupUnitsIn, request: Request, db: Session = Depends(get_db)):
    return _service(request, db).setup_units(payload)


@router.post("/connect-provider", response_model=SetupSessionOut)
def setup_connect_provider(
    payload: SetupConnectProviderIn, request: Request, db: Session = Depends(get_db)
):
    return _service(request, db).setup_connect_provider(payload)


@router.post("/import-devices", response_model=SetupSessionOut)
def setup_import_devices(
    payload: SetupImportDevicesIn, request: Request, db: Session = Depends(get_db)
):
    return _service(request, db).setup_import_devices(payload)


@router.get("/zone-suggestions", response_model=SetupZoneSuggestionsOut)
def setup_zone_suggestions(request: Request, db: Session = Depends(get_db)):
    """Zones discovered in the building, with the units they can be bound to."""
    return _service(request, db).setup_zone_suggestions()


@router.post("/map-zones", response_model=SetupSessionOut)
def setup_map_zones(payload: SetupMapZonesIn, request: Request, db: Session = Depends(get_db)):
    """Bind zones to units and re-sync, so the mapping takes effect immediately."""
    return _service(request, db).setup_map_zones(payload)


# Kept for manual, per-device corrections; the guided flow uses /map-zones.
@router.post("/assign-devices", response_model=SetupSessionOut)
def setup_assign_devices(
    payload: SetupAssignDevicesIn, request: Request, db: Session = Depends(get_db)
):
    return _service(request, db).setup_assign_devices(payload)


@router.post("/enable-automations", response_model=SetupSessionOut)
def setup_enable_automations(
    payload: SetupEnableAutomationsIn, request: Request, db: Session = Depends(get_db)
):
    return _service(request, db).setup_enable_automations(payload)


@router.post("/complete", response_model=SetupSessionOut)
def setup_complete(request: Request, db: Session = Depends(get_db)):
    return _service(request, db).setup_complete()
