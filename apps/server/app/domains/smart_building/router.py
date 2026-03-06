from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.orm import Session

from app.db import get_db
from app.domains.smart_building.schemas import (
    AlertCreate,
    AlertOut,
    AutomationExecutionOut,
    AutomationRuleCreate,
    AutomationRuleOut,
    AutomationRuleUpdate,
    DeviceCommandCreate,
    DeviceCommandOut,
    DeviceCreate,
    DeviceEventCreate,
    DeviceEventOut,
    DeviceOut,
    DeviceStateOut,
    DeviceStateUpdate,
    DeviceUpdate,
    ProviderDebugOut,
    ProviderSyncOut,
    ProviderWebhookIn,
    ProviderWebhookOut,
    RuleTriggerRequest,
    SceneActionCreate,
    SceneActionOut,
    SceneActionUpdate,
    SceneCreate,
    SceneOut,
    SceneRunRequest,
    SceneUpdate,
    SmartUnitDetailOut,
    SmartUnitTimelineOut,
    SmartOverviewOut,
)
from app.domains.smart_building.service import SmartBuildingService


router = APIRouter(prefix="/smart", tags=["smart-building"])


def _service(request: Request, db: Session) -> SmartBuildingService:
    tenant_id = getattr(request.state, "tenant_id", None)
    if not tenant_id:
        raise HTTPException(status_code=401, detail="Tenant context missing")
    role = getattr(request.state, "role", "owner")
    return SmartBuildingService(db=db, tenant_id=tenant_id, role=role)


@router.get("/overview", response_model=SmartOverviewOut)
def get_smart_overview(request: Request, db: Session = Depends(get_db)):
    return _service(request, db).smart_overview()


@router.get("/units/{unit_id}", response_model=SmartUnitDetailOut)
def get_smart_unit_detail(
    unit_id: int,
    request: Request,
    db: Session = Depends(get_db),
    events_limit: int = Query(default=50, ge=1, le=200),
):
    return _service(request, db).get_unit_smart_detail(unit_id=unit_id, events_limit=events_limit)


@router.get("/units/{unit_id}/timeline", response_model=SmartUnitTimelineOut)
def get_smart_unit_timeline(
    unit_id: int,
    request: Request,
    db: Session = Depends(get_db),
    limit: int = Query(default=50, ge=1, le=200),
    before: datetime | None = Query(default=None),
):
    return _service(request, db).get_unit_timeline(unit_id=unit_id, limit=limit, before=before)


@router.get("/providers/debug", response_model=ProviderDebugOut)
def provider_debug(
    request: Request,
    db: Session = Depends(get_db),
    provider: str | None = Query(default=None),
):
    return _service(request, db).provider_debug(provider)


@router.post("/providers/sync", response_model=ProviderSyncOut)
def provider_catalog_sync(
    request: Request,
    db: Session = Depends(get_db),
    provider: str | None = Query(default=None),
):
    return _service(request, db).sync_catalog_from_provider(provider)


@router.post("/providers/{provider}/webhook", response_model=ProviderWebhookOut)
def provider_webhook_ingest(
    provider: str,
    body: ProviderWebhookIn,
    request: Request,
    db: Session = Depends(get_db),
):
    username = getattr(request.state, "user", None)
    return _service(request, db).ingest_provider_webhook(
        provider_name=provider,
        payload=body.payload,
        username=username,
    )


@router.get("/devices", response_model=list[DeviceOut])
def list_devices(request: Request, db: Session = Depends(get_db)):
    return _service(request, db).list_devices()


@router.post("/devices", response_model=DeviceOut)
def create_device(payload: DeviceCreate, request: Request, db: Session = Depends(get_db)):
    return _service(request, db).create_device(payload)


@router.get("/devices/{device_id}", response_model=DeviceOut)
def get_device(device_id: int, request: Request, db: Session = Depends(get_db)):
    return _service(request, db).get_device_or_404(device_id)


@router.put("/devices/{device_id}", response_model=DeviceOut)
def update_device(
    device_id: int, payload: DeviceUpdate, request: Request, db: Session = Depends(get_db)
):
    return _service(request, db).update_device(device_id, payload)


@router.get("/devices/{device_id}/state", response_model=DeviceStateOut)
def get_device_state(device_id: int, request: Request, db: Session = Depends(get_db)):
    return _service(request, db).get_device_state(device_id)


@router.put("/devices/{device_id}/state", response_model=DeviceStateOut)
def update_device_state(
    device_id: int,
    payload: DeviceStateUpdate,
    request: Request,
    db: Session = Depends(get_db),
):
    return _service(request, db).upsert_device_state(device_id, payload)


@router.post("/devices/{device_id}/simulate-sync", response_model=DeviceStateOut)
def simulate_device_sync(device_id: int, request: Request, db: Session = Depends(get_db)):
    return _service(request, db).simulate_sync(device_id)


@router.get("/devices/{device_id}/commands", response_model=list[DeviceCommandOut])
def list_device_commands(
    device_id: int,
    request: Request,
    db: Session = Depends(get_db),
    status: str | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
):
    return _service(request, db).list_device_commands(device_id=device_id, status=status, limit=limit)


@router.post("/devices/{device_id}/commands", response_model=DeviceCommandOut)
def create_device_command(
    device_id: int,
    payload: DeviceCommandCreate,
    request: Request,
    db: Session = Depends(get_db),
):
    username = getattr(request.state, "user", None) or "system"
    return _service(request, db).create_device_command(
        device_id=device_id, payload=payload, requested_by=username
    )


@router.get("/devices/{device_id}/commands/{command_id}", response_model=DeviceCommandOut)
def get_device_command(
    device_id: int,
    command_id: int,
    request: Request,
    db: Session = Depends(get_db),
):
    return _service(request, db).get_device_command_or_404(device_id=device_id, command_id=command_id)


@router.get("/events", response_model=list[DeviceEventOut])
def list_device_events(
    request: Request,
    db: Session = Depends(get_db),
    device_id: int | None = Query(default=None),
    limit: int = Query(default=100, ge=1, le=500),
):
    return _service(request, db).list_device_events(device_id=device_id, limit=limit)


@router.post("/devices/{device_id}/events", response_model=DeviceEventOut)
def create_device_event(
    device_id: int,
    payload: DeviceEventCreate,
    request: Request,
    db: Session = Depends(get_db),
):
    return _service(request, db).create_device_event(device_id, payload)


@router.get("/alerts", response_model=list[AlertOut])
def list_alerts(
    request: Request, db: Session = Depends(get_db), status: str | None = Query(default=None)
):
    return _service(request, db).list_alerts(status=status)


@router.post("/alerts", response_model=AlertOut)
def create_alert(payload: AlertCreate, request: Request, db: Session = Depends(get_db)):
    username = getattr(request.state, "user", None) or "system"
    return _service(request, db).create_alert(
        payload,
        trigger_rules=True,
        trigger_source="api.smart",
        requested_by=username,
    )


@router.put("/alerts/{alert_id}/acknowledge", response_model=AlertOut)
def acknowledge_alert(alert_id: int, request: Request, db: Session = Depends(get_db)):
    username = getattr(request.state, "user", None) or "system"
    return _service(request, db).acknowledge_alert(alert_id=alert_id, username=username)


@router.get("/scenes", response_model=list[SceneOut])
def list_scenes(request: Request, db: Session = Depends(get_db)):
    return _service(request, db).list_scenes()


@router.post("/scenes", response_model=SceneOut)
def create_scene(payload: SceneCreate, request: Request, db: Session = Depends(get_db)):
    return _service(request, db).create_scene(payload)


@router.get("/scenes/{scene_id}", response_model=SceneOut)
def get_scene(scene_id: int, request: Request, db: Session = Depends(get_db)):
    return _service(request, db).get_scene_or_404(scene_id)


@router.put("/scenes/{scene_id}", response_model=SceneOut)
def update_scene(
    scene_id: int, payload: SceneUpdate, request: Request, db: Session = Depends(get_db)
):
    return _service(request, db).update_scene(scene_id=scene_id, payload=payload)


@router.get("/scenes/{scene_id}/actions", response_model=list[SceneActionOut])
def list_scene_actions(scene_id: int, request: Request, db: Session = Depends(get_db)):
    return _service(request, db).list_scene_actions(scene_id=scene_id)


@router.post("/scenes/{scene_id}/actions", response_model=SceneActionOut)
def create_scene_action(
    scene_id: int, payload: SceneActionCreate, request: Request, db: Session = Depends(get_db)
):
    return _service(request, db).create_scene_action(scene_id=scene_id, payload=payload)


@router.put("/scenes/{scene_id}/actions/{action_id}", response_model=SceneActionOut)
def update_scene_action(
    scene_id: int,
    action_id: int,
    payload: SceneActionUpdate,
    request: Request,
    db: Session = Depends(get_db),
):
    return _service(request, db).update_scene_action(
        scene_id=scene_id, action_id=action_id, payload=payload
    )


@router.delete("/scenes/{scene_id}/actions/{action_id}", status_code=204)
def delete_scene_action(scene_id: int, action_id: int, request: Request, db: Session = Depends(get_db)):
    _service(request, db).delete_scene_action(scene_id=scene_id, action_id=action_id)
    return None


@router.post("/scenes/{scene_id}/run", response_model=AutomationExecutionOut)
def run_scene(
    scene_id: int, payload: SceneRunRequest, request: Request, db: Session = Depends(get_db)
):
    username = getattr(request.state, "user", None) or "system"
    return _service(request, db).run_scene(
        scene_id=scene_id, requested_by=username, context=payload.context
    )


@router.get("/automation-rules", response_model=list[AutomationRuleOut])
def list_automation_rules(request: Request, db: Session = Depends(get_db)):
    return _service(request, db).list_automation_rules()


@router.post("/automation-rules", response_model=AutomationRuleOut)
def create_automation_rule(
    payload: AutomationRuleCreate, request: Request, db: Session = Depends(get_db)
):
    return _service(request, db).create_automation_rule(payload)


@router.get("/automation-rules/{rule_id}", response_model=AutomationRuleOut)
def get_automation_rule(rule_id: int, request: Request, db: Session = Depends(get_db)):
    return _service(request, db).get_automation_rule_or_404(rule_id)


@router.put("/automation-rules/{rule_id}", response_model=AutomationRuleOut)
def update_automation_rule(
    rule_id: int,
    payload: AutomationRuleUpdate,
    request: Request,
    db: Session = Depends(get_db),
):
    return _service(request, db).update_automation_rule(rule_id=rule_id, payload=payload)


@router.post("/automation-rules/{rule_id}/trigger", response_model=AutomationExecutionOut)
def trigger_automation_rule(
    rule_id: int,
    payload: RuleTriggerRequest,
    request: Request,
    db: Session = Depends(get_db),
):
    username = getattr(request.state, "user", None) or "system"
    return _service(request, db).trigger_automation_rule(
        rule_id=rule_id,
        payload=payload,
        requested_by=username,
    )


@router.get("/automation-executions", response_model=list[AutomationExecutionOut])
def list_automation_executions(
    request: Request,
    db: Session = Depends(get_db),
    limit: int = Query(default=50, ge=1, le=200),
    scene_id: int | None = Query(default=None),
    rule_id: int | None = Query(default=None),
):
    return _service(request, db).list_automation_executions(
        limit=limit,
        scene_id=scene_id,
        rule_id=rule_id,
    )
