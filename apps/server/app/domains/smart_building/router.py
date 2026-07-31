from datetime import date, datetime

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
    DeviceHealthOut,
    DeviceHealthOverviewOut,
    DeviceTelemetryQueryOut,
    DeviceEventCreate,
    DeviceEventOut,
    DeviceOut,
    DeviceStateOut,
    DeviceStateUpdate,
    DeviceUpdate,
    FacilityActionIn,
    FacilityActionResultOut,
    FacilityOut,
    LinkEventIn,
    LinkEventOut,
    LinkReconcileOut,
    LinkStatusOut,
    ProviderDebugOut,
    ProviderConnectionCreateIn,
    ProviderConnectionOut,
    ProviderConnectionUpdateIn,
    ProviderPollOut,
    ProviderSyncOut,
    ProviderWebhookIn,
    ProviderWebhookOut,
    RuleTriggerRequest,
    ScenarioPackDefinitionOut,
    ScenarioPackEnableIn,
    ScenarioPackInstallOut,
    SceneActionCreate,
    SceneActionOut,
    SceneActionUpdate,
    SceneCreate,
    SceneOut,
    SceneRunRequest,
    SceneUpdate,
    SmartDashboardOut,
    SmartDashboardItemOut,
    SmartAssistantItemOut,
    SmartOperationsIssueOut,
    SmartOperationsOut,
    SmartOperationsUnitOut,
    TelemetryInsightOut,
    UnitCapabilitiesOut,
    UnitReadinessOut,
    UnitWorkflowRunIn,
    UnitWorkflowRunOut,
    SmartUnitDetailOut,
    SmartUnitTimelineOut,
    SmartOverviewOut,
    UnitDeviceHealthOut,
    UtilityCostPostOut,
    UtilityCostReportOut,
    ZoneMapEntryOut,
    ZoneMapIn,
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


@router.get("/dashboard", response_model=SmartDashboardOut)
def get_smart_dashboard(
    request: Request,
    db: Session = Depends(get_db),
    property_id: int | None = Query(default=None),
    unit_id: int | None = Query(default=None),
):
    return _service(request, db).smart_dashboard(property_id=property_id, unit_id=unit_id)


@router.get("/readiness", response_model=list[UnitReadinessOut])
def get_unit_readiness(
    request: Request,
    db: Session = Depends(get_db),
    property_id: int | None = Query(default=None),
    status: str | None = Query(default=None),
    min_score: int | None = Query(default=None, ge=0, le=100),
    max_score: int | None = Query(default=None, ge=0, le=100),
):
    return _service(request, db).list_unit_readiness(
        property_id=property_id,
        status=status,
        min_score=min_score,
        max_score=max_score,
    )


@router.get("/readiness/property/{property_id}", response_model=list[UnitReadinessOut])
def get_property_readiness(
    property_id: int,
    request: Request,
    db: Session = Depends(get_db),
    status: str | None = Query(default=None),
    min_score: int | None = Query(default=None, ge=0, le=100),
    max_score: int | None = Query(default=None, ge=0, le=100),
):
    return _service(request, db).list_unit_readiness(
        property_id=property_id,
        status=status,
        min_score=min_score,
        max_score=max_score,
    )


@router.get("/readiness/unit/{unit_id}", response_model=UnitReadinessOut)
def get_single_unit_readiness(
    unit_id: int,
    request: Request,
    db: Session = Depends(get_db),
):
    return _service(request, db).get_unit_readiness(unit_id)


@router.get("/assistant/checkin", response_model=list[SmartAssistantItemOut])
def get_checkin_assistant(
    request: Request,
    db: Session = Depends(get_db),
    property_id: int | None = Query(default=None),
    unit_id: int | None = Query(default=None),
    status: str | None = Query(default=None),
    date_from: date | None = Query(default=None),
    date_to: date | None = Query(default=None),
):
    return _service(request, db).list_checkin_assistant(
        property_id=property_id,
        unit_id=unit_id,
        status=status,
        date_from=date_from,
        date_to=date_to,
    )


@router.get("/assistant/checkin/{booking_id}", response_model=SmartAssistantItemOut)
def get_checkin_assistant_booking(
    booking_id: int,
    request: Request,
    db: Session = Depends(get_db),
):
    return _service(request, db).get_checkin_assistant_booking(booking_id)


@router.get("/assistant/checkout", response_model=list[SmartAssistantItemOut])
def get_checkout_assistant(
    request: Request,
    db: Session = Depends(get_db),
    property_id: int | None = Query(default=None),
    unit_id: int | None = Query(default=None),
    status: str | None = Query(default=None),
    date_from: date | None = Query(default=None),
    date_to: date | None = Query(default=None),
):
    return _service(request, db).list_checkout_assistant(
        property_id=property_id,
        unit_id=unit_id,
        status=status,
        date_from=date_from,
        date_to=date_to,
    )


@router.get("/assistant/checkout/{booking_id}", response_model=SmartAssistantItemOut)
def get_checkout_assistant_booking(
    booking_id: int,
    request: Request,
    db: Session = Depends(get_db),
):
    return _service(request, db).get_checkout_assistant_booking(booking_id)


@router.get("/operations", response_model=SmartOperationsOut)
def get_smart_operations(
    request: Request,
    db: Session = Depends(get_db),
    property_id: int | None = Query(default=None),
    unit_id: int | None = Query(default=None),
    severity: str | None = Query(default=None),
    issue_type: str | None = Query(default=None),
    status: str | None = Query(default=None),
):
    return _service(request, db).smart_operations(
        property_id=property_id,
        unit_id=unit_id,
        severity=severity,
        issue_type=issue_type,
        status=status,
    )


@router.get("/operations/units-needing-attention", response_model=list[SmartOperationsUnitOut])
def get_units_needing_attention(
    request: Request,
    db: Session = Depends(get_db),
    property_id: int | None = Query(default=None),
    unit_id: int | None = Query(default=None),
    severity: str | None = Query(default=None),
):
    return _service(request, db).list_smart_operations_units_needing_attention(
        property_id=property_id,
        unit_id=unit_id,
        severity=severity,
    )


@router.get("/operations/issues", response_model=list[SmartOperationsIssueOut])
def get_operations_issues(
    request: Request,
    db: Session = Depends(get_db),
    property_id: int | None = Query(default=None),
    unit_id: int | None = Query(default=None),
    severity: str | None = Query(default=None),
    issue_type: str | None = Query(default=None),
    status: str | None = Query(default=None),
):
    return _service(request, db).list_smart_operations_issues(
        property_id=property_id,
        unit_id=unit_id,
        severity=severity,
        issue_type=issue_type,
        status=status,
    )


@router.get("/operations/activity", response_model=list[SmartDashboardItemOut])
def get_operations_activity(
    request: Request,
    db: Session = Depends(get_db),
    property_id: int | None = Query(default=None),
    unit_id: int | None = Query(default=None),
    severity: str | None = Query(default=None),
):
    return _service(request, db).list_smart_operations_activity(
        property_id=property_id,
        unit_id=unit_id,
        severity=severity,
    )


@router.get("/link/status", response_model=LinkStatusOut)
def get_link_status(
    request: Request,
    db: Session = Depends(get_db),
    provider: str | None = Query(default=None),
):
    """Building-link health, and the entities the portal cannot classify yet."""
    return _service(request, db).link_status(provider)


@router.post("/link/events", response_model=LinkEventOut)
def ingest_link_event(
    body: LinkEventIn,
    request: Request,
    db: Session = Depends(get_db),
):
    """Receive a VillaCore event.

    Authenticated either by portal JWT or by the ``X-Smart-Ingest-Token``
    shared secret, because Home Assistant cannot hold a user session.
    """
    username = getattr(request.state, "user", None)
    payload = body.model_dump(by_alias=True, exclude_none=True)
    return _service(request, db).ingest_link_event(payload, username=username)


@router.post("/link/reconcile", response_model=LinkReconcileOut)
def reconcile_link(
    request: Request,
    db: Session = Depends(get_db),
    provider: str | None = Query(default=None),
):
    """Re-import the catalog and re-read every state (missed-push safety net)."""
    return _service(request, db).reconcile_link(provider)


@router.get("/link/zone-map", response_model=dict[str, ZoneMapEntryOut])
def get_link_zone_map(
    request: Request,
    db: Session = Depends(get_db),
    property_id: int | None = Query(default=None),
):
    return _service(request, db).get_zone_map(property_id=property_id)


@router.put("/provider-connections/{connection_id}/zone-map", response_model=ProviderConnectionOut)
def update_link_zone_map(
    connection_id: int,
    payload: ZoneMapIn,
    request: Request,
    db: Session = Depends(get_db),
):
    username = getattr(request.state, "user", None) or "system"
    zone_map = {
        key: value.model_dump(exclude_none=True) for key, value in payload.zone_map.items()
    }
    return _service(request, db).set_zone_map(
        connection_id=connection_id, zone_map=zone_map, requested_by=username
    )


@router.get("/utility-costs", response_model=UtilityCostReportOut)
def get_utility_cost_report(
    request: Request,
    db: Session = Depends(get_db),
    year: int = Query(..., ge=2000, le=2100),
    month: int = Query(..., ge=1, le=12),
):
    """Consumption and cost per unit and shared plant for one month."""
    return _service(request, db).utility_cost_report(year=year, month=month)


@router.post("/utility-costs/post", response_model=UtilityCostPostOut)
def post_utility_costs(
    request: Request,
    db: Session = Depends(get_db),
    year: int = Query(..., ge=2000, le=2100),
    month: int = Query(..., ge=1, le=12),
):
    """Write the month's utility costs as cost items (idempotent)."""
    username = getattr(request.state, "user", None) or "system"
    return _service(request, db).post_utility_costs(
        year=year, month=month, requested_by=username
    )


@router.get("/facilities", response_model=list[FacilityOut])
def list_facilities(request: Request, db: Session = Depends(get_db)):
    """Shared plants (pool, irrigation, gate...) as an asset view."""
    return _service(request, db).list_facilities()


@router.get("/facilities/{facility_key}", response_model=FacilityOut)
def get_facility(facility_key: str, request: Request, db: Session = Depends(get_db)):
    return _service(request, db).get_facility(facility_key)


@router.post(
    "/facilities/{facility_key}/actions/{action}", response_model=FacilityActionResultOut
)
def run_facility_action(
    facility_key: str,
    action: str,
    payload: FacilityActionIn,
    request: Request,
    db: Session = Depends(get_db),
):
    """Safe-off or alarm rearm. Everything else stays in Home Assistant."""
    username = getattr(request.state, "user", None) or "system"
    return _service(request, db).run_facility_action(
        facility_key=facility_key,
        action=action,
        requested_by=username,
        correlation_id=payload.correlation_id,
    )


@router.get("/units/{unit_id}/capabilities", response_model=UnitCapabilitiesOut)
def get_unit_capabilities(unit_id: int, request: Request, db: Session = Depends(get_db)):
    return _service(request, db).list_unit_capabilities(unit_id)


@router.post("/units/{unit_id}/workflow/{workflow}", response_model=UnitWorkflowRunOut)
def run_unit_workflow(
    unit_id: int,
    workflow: str,
    payload: UnitWorkflowRunIn,
    request: Request,
    db: Session = Depends(get_db),
):
    """Ask the building to execute a unit workflow (check-in, check-out...)."""
    username = getattr(request.state, "user", None) or "system"
    return _service(request, db).run_unit_workflow(
        unit_id=unit_id,
        workflow=workflow,
        booking_id=payload.booking_id,
        variables=payload.variables,
        requested_by=username,
        correlation_id=payload.correlation_id,
    )


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


@router.post("/providers/poll", response_model=ProviderPollOut)
def provider_state_poll(
    request: Request,
    db: Session = Depends(get_db),
    provider: str | None = Query(default=None),
):
    return _service(request, db).poll_provider_states(provider)


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
def list_devices(
    request: Request,
    db: Session = Depends(get_db),
    include_freshness: bool = Query(default=False),
):
    service = _service(request, db)
    if include_freshness:
        return service.list_devices_with_freshness()
    return service.list_devices()


@router.get("/device-health", response_model=DeviceHealthOverviewOut)
def list_device_health(
    request: Request,
    db: Session = Depends(get_db),
    status: str | None = Query(default=None),
    connectivity: str | None = Query(default=None),
    unit_id: int | None = Query(default=None),
    property_id: int | None = Query(default=None),
):
    return _service(request, db).get_device_health_overview(
        status=status,
        connectivity=connectivity,
        unit_id=unit_id,
        property_id=property_id,
    )


@router.post("/devices", response_model=DeviceOut)
def create_device(payload: DeviceCreate, request: Request, db: Session = Depends(get_db)):
    return _service(request, db).create_device(payload)


@router.get("/devices/{device_id}", response_model=DeviceOut)
def get_device(device_id: int, request: Request, db: Session = Depends(get_db)):
    return _service(request, db).get_device_or_404(device_id)


@router.get("/devices/{device_id}/health", response_model=DeviceHealthOut)
def get_device_health(device_id: int, request: Request, db: Session = Depends(get_db)):
    return _service(request, db).get_single_device_health(device_id)


@router.get("/telemetry/device/{device_id}", response_model=DeviceTelemetryQueryOut)
def get_device_telemetry(
    device_id: int,
    request: Request,
    db: Session = Depends(get_db),
    metric_type: str | None = Query(default=None),
    from_ts: datetime | None = Query(default=None, alias="from"),
    to_ts: datetime | None = Query(default=None, alias="to"),
    interval: str | None = Query(default=None),
):
    return _service(request, db).get_device_telemetry(
        device_id=device_id,
        metric_type=metric_type,
        from_ts=from_ts,
        to_ts=to_ts,
        interval=interval,
    )


@router.get("/telemetry/unit/{unit_id}", response_model=DeviceTelemetryQueryOut)
def get_unit_telemetry(
    unit_id: int,
    request: Request,
    db: Session = Depends(get_db),
    metric_type: str | None = Query(default=None),
    from_ts: datetime | None = Query(default=None, alias="from"),
    to_ts: datetime | None = Query(default=None, alias="to"),
    interval: str | None = Query(default=None),
):
    return _service(request, db).get_unit_telemetry(
        unit_id=unit_id,
        metric_type=metric_type,
        from_ts=from_ts,
        to_ts=to_ts,
        interval=interval,
    )


@router.get("/telemetry/property/{property_id}", response_model=DeviceTelemetryQueryOut)
def get_property_telemetry(
    property_id: int,
    request: Request,
    db: Session = Depends(get_db),
    metric_type: str | None = Query(default=None),
    from_ts: datetime | None = Query(default=None, alias="from"),
    to_ts: datetime | None = Query(default=None, alias="to"),
    interval: str | None = Query(default=None),
):
    return _service(request, db).get_property_telemetry(
        property_id=property_id,
        metric_type=metric_type,
        from_ts=from_ts,
        to_ts=to_ts,
        interval=interval,
    )


@router.get("/telemetry-insights", response_model=list[TelemetryInsightOut])
def list_telemetry_insights(
    request: Request,
    db: Session = Depends(get_db),
    metric_type: str | None = Query(default=None),
    insight_type: str | None = Query(default=None),
    severity: str | None = Query(default=None),
    status: str | None = Query(default=None),
    property_id: int | None = Query(default=None),
    unit_id: int | None = Query(default=None),
):
    return _service(request, db).list_telemetry_insights(
        metric_type=metric_type,
        insight_type=insight_type,
        severity=severity,
        status=status,
        property_id=property_id,
        unit_id=unit_id,
    )


@router.get("/telemetry-insights/property/{property_id}", response_model=list[TelemetryInsightOut])
def list_property_telemetry_insights(
    property_id: int,
    request: Request,
    db: Session = Depends(get_db),
    metric_type: str | None = Query(default=None),
    insight_type: str | None = Query(default=None),
    severity: str | None = Query(default=None),
    status: str | None = Query(default=None),
):
    return _service(request, db).list_telemetry_insights(
        property_id=property_id,
        metric_type=metric_type,
        insight_type=insight_type,
        severity=severity,
        status=status,
    )


@router.get("/telemetry-insights/unit/{unit_id}", response_model=list[TelemetryInsightOut])
def list_unit_telemetry_insights(
    unit_id: int,
    request: Request,
    db: Session = Depends(get_db),
    metric_type: str | None = Query(default=None),
    insight_type: str | None = Query(default=None),
    severity: str | None = Query(default=None),
    status: str | None = Query(default=None),
):
    return _service(request, db).list_telemetry_insights(
        unit_id=unit_id,
        metric_type=metric_type,
        insight_type=insight_type,
        severity=severity,
        status=status,
    )


@router.get("/provider-connections", response_model=list[ProviderConnectionOut])
def list_provider_connections(
    request: Request,
    db: Session = Depends(get_db),
    property_id: int | None = Query(default=None),
):
    return _service(request, db).list_provider_connections(property_id=property_id)


@router.post("/provider-connections", response_model=ProviderConnectionOut)
def create_provider_connection(
    payload: ProviderConnectionCreateIn,
    request: Request,
    db: Session = Depends(get_db),
):
    return _service(request, db).create_provider_connection(
        property_id=payload.property_id,
        provider_name=payload.provider_name,
        status=payload.status,
        base_url=payload.base_url,
        config=payload.config,
        is_active=payload.is_active,
    )


@router.get("/provider-connections/{connection_id}", response_model=ProviderConnectionOut)
def get_provider_connection(
    connection_id: int,
    request: Request,
    db: Session = Depends(get_db),
):
    return _service(request, db).get_provider_connection_or_404(connection_id)


@router.put("/provider-connections/{connection_id}", response_model=ProviderConnectionOut)
def update_provider_connection(
    connection_id: int,
    payload: ProviderConnectionUpdateIn,
    request: Request,
    db: Session = Depends(get_db),
):
    return _service(request, db).update_provider_connection(
        connection_id=connection_id,
        status=payload.status,
        base_url=payload.base_url,
        config=payload.config,
        is_active=payload.is_active,
        last_error=payload.last_error,
    )


@router.get("/scenario-packs", response_model=list[ScenarioPackDefinitionOut])
def list_scenario_packs(request: Request, db: Session = Depends(get_db)):
    return _service(request, db).list_scenario_pack_definitions()


@router.get("/scenario-packs/enabled", response_model=list[ScenarioPackInstallOut])
def list_enabled_scenario_packs(
    request: Request,
    db: Session = Depends(get_db),
    property_id: int | None = Query(default=None),
):
    return _service(request, db).list_enabled_scenario_packs(property_id=property_id)


@router.post("/scenario-packs/enable", response_model=ScenarioPackInstallOut)
def enable_scenario_pack(
    payload: ScenarioPackEnableIn,
    request: Request,
    db: Session = Depends(get_db),
):
    username = getattr(request.state, "user", None) or "system"
    return _service(request, db).enable_scenario_pack(
        property_id=payload.property_id,
        pack_key=payload.pack_key,
        requested_by=username,
    )


@router.put("/devices/{device_id}", response_model=DeviceOut)
def update_device(
    device_id: int, payload: DeviceUpdate, request: Request, db: Session = Depends(get_db)
):
    return _service(request, db).update_device(device_id, payload)


@router.delete("/devices/{device_id}", status_code=204)
def delete_device(device_id: int, request: Request, db: Session = Depends(get_db)):
    _service(request, db).delete_device(device_id)
    return None


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


@router.get("/units/{unit_id}/device-health", response_model=UnitDeviceHealthOut)
def get_unit_device_health(
    unit_id: int,
    request: Request,
    db: Session = Depends(get_db),
):
    return _service(request, db).get_unit_device_health(unit_id=unit_id)


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
    request: Request,
    db: Session = Depends(get_db),
    status: str | None = Query(default=None),
    include_freshness: bool = Query(default=False),
):
    service = _service(request, db)
    if include_freshness:
        return service.list_alerts_with_freshness(status=status)
    return service.list_alerts(status=status)


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
