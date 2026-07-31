"""Public entry point of the smart-building domain.

``SmartBuildingService`` is a thin facade: every behaviour lives in one of the
modules under ``services/`` and is composed here as a mixin. Routers and other
domains keep using this single class, with identical method names and
signatures, so the split is invisible from the outside.

Constants are re-exported for callers that used to import them from here.
"""

from __future__ import annotations

from app.domains.smart_building.services.constants import (
    SUPPORTED_COMMAND_STATUSES,
    POWER_CATEGORIES,
    CLIMATE_CATEGORIES,
    LOCK_CATEGORIES,
    AUTOMATION_EXECUTION_STATUSES,
    AUTOMATION_DEDUP_WINDOW,
    CONNECTIVITY_STATUSES,
    SUPPORTED_TELEMETRY_METRICS,
    TELEMETRY_METRIC_UNITS,
    TELEMETRY_INTERVAL_SECONDS,
    TELEMETRY_INSIGHT_TYPES,
    SMART_MAINTENANCE_KEYWORDS,
    READINESS_STATUSES,
    BLOCKING_MAINTENANCE_PRIORITIES,
    BLOCKING_MAINTENANCE_KEYWORDS,
    SETUP_STEPS,
    AUTOMATION_TEMPLATE_KEYS,
    SCENARIO_PACK_DEFINITIONS,
)
from app.domains.smart_building.services.alerts import AlertsMixin
from app.domains.smart_building.services.assistants import AssistantsMixin
from app.domains.smart_building.services.automation import AutomationMixin
from app.domains.smart_building.services.capabilities import CapabilitiesMixin
from app.domains.smart_building.services.commands import CommandsMixin
from app.domains.smart_building.services.devices import DevicesMixin
from app.domains.smart_building.services.facilities import FacilitiesMixin
from app.domains.smart_building.services.ingest import IngestMixin
from app.domains.smart_building.services.operations import OperationsMixin
from app.domains.smart_building.services.provider_link import ProviderLinkMixin
from app.domains.smart_building.services.read_models import ReadModelsMixin
from app.domains.smart_building.services.readiness import ReadinessMixin
from app.domains.smart_building.services.scenario_packs import ScenarioPacksMixin
from app.domains.smart_building.services.setup import SetupMixin
from app.domains.smart_building.services.telemetry import TelemetryMixin
from app.domains.smart_building.services.utility_costs import UtilityCostsMixin
from app.domains.smart_building.services.workflows import WorkflowsMixin
from app.domains.smart_building.services.base import SmartServiceBase


class SmartBuildingService(
    AlertsMixin,
    AssistantsMixin,
    AutomationMixin,
    CapabilitiesMixin,
    CommandsMixin,
    DevicesMixin,
    FacilitiesMixin,
    IngestMixin,
    OperationsMixin,
    ProviderLinkMixin,
    ReadModelsMixin,
    ReadinessMixin,
    ScenarioPacksMixin,
    SetupMixin,
    TelemetryMixin,
    UtilityCostsMixin,
    WorkflowsMixin,
    SmartServiceBase,
):
    """Smart-building operations for one tenant, scoped by role."""


__all__ = [
    "SmartBuildingService",
    "AUTOMATION_DEDUP_WINDOW",
    "AUTOMATION_EXECUTION_STATUSES",
    "AUTOMATION_TEMPLATE_KEYS",
    "BLOCKING_MAINTENANCE_KEYWORDS",
    "BLOCKING_MAINTENANCE_PRIORITIES",
    "CLIMATE_CATEGORIES",
    "CONNECTIVITY_STATUSES",
    "LOCK_CATEGORIES",
    "POWER_CATEGORIES",
    "READINESS_STATUSES",
    "SCENARIO_PACK_DEFINITIONS",
    "SETUP_STEPS",
    "SMART_MAINTENANCE_KEYWORDS",
    "SUPPORTED_COMMAND_STATUSES",
    "SUPPORTED_TELEMETRY_METRICS",
    "TELEMETRY_INSIGHT_TYPES",
    "TELEMETRY_INTERVAL_SECONDS",
    "TELEMETRY_METRIC_UNITS",
]
