"""VillaCore provider: Home Assistant plus the site's own conventions.

Everything protocol-level is inherited from :class:`HomeAssistantProvider`
(REST calls, state mapping, service dispatch). What this class adds is
*meaning*: it runs every entity through the VillaCore classifier so the portal
receives zones, capabilities and metric types instead of a flat list of
entities, and it reads the link manifest VillaCore publishes so new milestones
are picked up without touching portal code.

It never re-implements VillaCore's safety logic. Commands stay requests: when
Home Assistant refuses one because of a local interlock, the failure is
reported as-is.
"""

from __future__ import annotations

from typing import Any
from urllib.parse import urlparse

from app.core.config import settings
from app.domains.smart_building.providers.base import (
    ProviderDeviceSnapshot,
    ProviderLinkStatus,
)
from app.domains.smart_building.providers.home_assistant import HomeAssistantProvider
from app.domains.smart_building.providers.home_assistant_mapping import (
    map_entity_to_device,
    map_entity_to_state,
)
from app.domains.smart_building.providers.villacore_classifier import (
    ZONE_KIND_FACILITY,
    ZONE_KIND_UNIT,
    EntityClassification,
    VillaCoreProfile,
    load_profile,
)

# Entity VillaCore uses to declare the contract it speaks. Optional: without it
# the bundled profile and naming inference still classify the whole site.
MANIFEST_ENTITY_ID = "sensor.portal_link_manifest"

# Categories derived from the capability rather than the HA domain, so the
# portal UI can group a workflow script apart from a plain switch.
CAPABILITY_CATEGORY_OVERRIDES: dict[str, str] = {
    "workflow.checkin": "unit_workflow",
    "workflow.checkout": "unit_workflow",
    "workflow.mark_ready": "unit_workflow",
    "workflow.safe_off": "unit_workflow",
    "workflow.climate_safe_off": "unit_workflow",
    "workflow.lights_off": "unit_workflow",
    "facility.state": "facility_state",
    "facility.mode": "facility_mode",
    "facility.supervision": "facility_state",
    "facility.alarm": "facility_alarm",
    "facility.alarm_reset": "facility_control",
    "facility.safe_off": "facility_control",
    "facility.start": "facility_control",
    "facility.stop": "facility_control",
    "facility.zone_start": "facility_control",
    "facility.run_all": "facility_control",
    "sensor.availability": "availability_sensor",
    "status.stay": "stay_status",
    "status.housekeeping": "housekeeping_status",
    "flag.guest_mode": "guest_mode_flag",
    "flag.maintenance_lock": "maintenance_lock_flag",
}


class VillaCoreProvider(HomeAssistantProvider):
    provider_name = "villacore"
    supports_catalog_sync = True
    supports_webhook_ingest = True
    supports_command_execution = True

    def __init__(self, **kwargs: Any) -> None:
        super().__init__(**kwargs)
        self._profile: VillaCoreProfile = load_profile()
        self._manifest_loaded = False
        # The generic provider filters on its own conservative allowlist; here
        # the profile decides, unless the operator forced HOME_ASSISTANT_INCLUDE_DOMAINS.
        if not (settings.home_assistant_include_domains or "").strip():
            self._include_domains = set(self._profile.include_domains)

    # --- profile / manifest ------------------------------------------------
    @property
    def profile(self) -> VillaCoreProfile:
        return self._profile

    def load_manifest(self) -> dict[str, Any] | None:
        """Fetch VillaCore's link manifest. Absent or malformed = ignored."""
        try:
            payload = self._request_json("GET", f"/api/states/{MANIFEST_ENTITY_ID}")
        except RuntimeError:
            return None
        if not isinstance(payload, dict):
            return None
        attributes = payload.get("attributes")
        if not isinstance(attributes, dict):
            return None
        manifest = {key: value for key, value in attributes.items() if not key.startswith("friendly_")}
        return manifest or None

    def ensure_manifest(self) -> bool:
        """Apply the manifest once per provider instance. Returns True if applied."""
        if self._manifest_loaded:
            return False
        self._manifest_loaded = True
        manifest = self.load_manifest()
        if not manifest:
            return False
        self._profile = self._profile.with_manifest(manifest)
        return True

    def classify(self, entity_id: str) -> EntityClassification:
        return self._profile.classify(entity_id)

    # --- catalog -----------------------------------------------------------
    def _snapshot_for(
        self, raw_entity: dict[str, Any], classification: EntityClassification
    ) -> ProviderDeviceSnapshot:
        snapshot = map_entity_to_device(raw_entity, unit_hint_by_entity=self._unit_hint_map)
        zone = classification.zone
        # Site metering entities describe another zone: attribute them there so
        # a unit's consumption shows up on the unit, not on the meter.
        attribution_zone = classification.effective_zone or zone
        capability = classification.capability

        category = CAPABILITY_CATEGORY_OVERRIDES.get(capability or "", snapshot.category)
        # A unit zone gives the importer a hint even when no explicit
        # HOME_ASSISTANT_UNIT_HINTS mapping exists; the service layer still has
        # the final say through the connection's zone map.
        unit_hint = snapshot.unit_hint
        if unit_hint is None and attribution_zone is not None and attribution_zone.kind == ZONE_KIND_UNIT:
            unit_hint = attribution_zone.key

        return ProviderDeviceSnapshot(
            external_id=snapshot.external_id,
            name=snapshot.name,
            category=category,
            model=snapshot.model,
            manufacturer=snapshot.manufacturer or "VillaCore",
            zone_name=(zone.display_name if zone else snapshot.zone_name),
            unit_hint=unit_hint,
            is_active=snapshot.is_active,
            health_status=snapshot.health_status,
            battery_level=snapshot.battery_level,
            state=snapshot.state,
            zone_key=(attribution_zone.key if attribution_zone else None),
            capability_key=capability,
            facility_key=classification.facility_key,
            metric_type=classification.metric,
        )

    def list_devices(self, tenant_id: str) -> list[ProviderDeviceSnapshot]:
        self.ensure_manifest()
        payload = self._request_json("GET", "/api/states")
        if not isinstance(payload, list):
            raise RuntimeError("Unexpected Home Assistant states payload")

        devices: list[ProviderDeviceSnapshot] = []
        for raw_entity in payload:
            if not isinstance(raw_entity, dict):
                continue
            entity_id = str(raw_entity.get("entity_id", "")).strip()
            classification = self.classify(entity_id)
            if classification.excluded or classification.capability is None:
                continue
            if classification.domain not in self._include_domains:
                continue
            devices.append(self._snapshot_for(raw_entity, classification))
        return devices

    # --- link health -------------------------------------------------------
    def _explain_transport_error(self, message: str) -> str:
        """Turn a transport failure into something an operator can act on.

        The common one in practice: the VillaCore container was recreated (a new
        milestone, a restart) and Docker forgot the runtime attachment to the
        shared network, so the service name stops resolving. The raw errno says
        nothing about the fix.
        """
        lowered = message.lower()
        dns_failure = any(
            marker in lowered
            for marker in (
                "name or service not known",
                "temporary failure in name resolution",
                "nodename nor servname",
                "getaddrinfo failed",
            )
        )
        if dns_failure:
            host = (urlparse(self._base_url).hostname or "").strip()
            # A bare name like `home-assistant` is a Docker service name, so the
            # cause is almost always a lost network attachment rather than DNS.
            looks_like_service_name = bool(host) and "." not in host and host != "localhost"
            if looks_like_service_name:
                return (
                    f"{message}. Il nome '{host}' non si risolve: probabilmente il container "
                    "di VillaCore e stato ricreato e ha perso l'aggancio alla rete condivisa. "
                    "Riesegui scripts/link-villacore.ps1 (o applica il prompt P1 per renderlo "
                    "permanente)."
                )
            return f"{message}. Verifica HOME_ASSISTANT_URL: l'host non e risolvibile."
        if "connection refused" in lowered:
            return (
                f"{message}. L'host risponde ma la porta e chiusa: verifica che lo stack "
                "VillaCore sia avviato e che HOME_ASSISTANT_URL usi la porta giusta."
            )
        return message

    def describe_link(self) -> ProviderLinkStatus:
        configured = self._is_configured()
        if not configured:
            return ProviderLinkStatus(
                provider_name=self.provider_name,
                configured=False,
                reachable=False,
                authenticated=False,
                contract_version=self._profile.contract_version,
                error_message="HOME_ASSISTANT_URL / HOME_ASSISTANT_TOKEN missing",
            )

        try:
            payload = self._request_json("GET", "/api/states")
        except RuntimeError as exc:
            message = str(exc)
            # 401/403 means we reached Home Assistant but the token is wrong:
            # a very different problem from an unreachable host.
            authentication_failure = "401" in message or "403" in message
            return ProviderLinkStatus(
                provider_name=self.provider_name,
                configured=True,
                reachable=authentication_failure,
                authenticated=False,
                contract_version=self._profile.contract_version,
                error_message=self._explain_transport_error(message),
            )

        if not isinstance(payload, list):
            return ProviderLinkStatus(
                provider_name=self.provider_name,
                configured=True,
                reachable=True,
                authenticated=True,
                contract_version=self._profile.contract_version,
                error_message="Unexpected Home Assistant states payload",
            )

        manifest_present = self.ensure_manifest() or any(
            str(entity.get("entity_id", "")) == MANIFEST_ENTITY_ID
            for entity in payload
            if isinstance(entity, dict)
        )

        importable = 0
        excluded = 0
        unclassified: list[dict[str, Any]] = []
        zones_seen: dict[str, dict[str, Any]] = {}

        for raw_entity in payload:
            if not isinstance(raw_entity, dict):
                continue
            entity_id = str(raw_entity.get("entity_id", "")).strip()
            classification = self.classify(entity_id)
            if classification.excluded:
                excluded += 1
                continue
            if classification.capability is None:
                # Reported, never dropped silently: this is how a new VillaCore
                # milestone announces itself to the operator.
                unclassified.append(
                    {
                        "entity_id": entity_id,
                        "domain": classification.domain,
                        "zone": classification.zone_key,
                        "reason": "no capability rule matched",
                    }
                )
                continue
            importable += 1
            zone = classification.zone
            if zone is not None:
                entry = zones_seen.setdefault(
                    zone.key,
                    {
                        "zone": zone.key,
                        "kind": zone.kind,
                        "display_name": zone.display_name,
                        "machine": zone.machine,
                        "known": zone.known,
                        "entity_count": 0,
                    },
                )
                entry["entity_count"] = int(entry["entity_count"]) + 1

        return ProviderLinkStatus(
            provider_name=self.provider_name,
            configured=True,
            reachable=True,
            authenticated=True,
            contract_version=self._profile.contract_version,
            manifest_present=manifest_present,
            entity_count=len(payload),
            importable_count=importable,
            excluded_count=excluded,
            unclassified=unclassified,
            zones=sorted(zones_seen.values(), key=lambda item: (item["kind"], item["zone"])),
        )

    # --- events ------------------------------------------------------------
    def parse_villacore_event(self, payload: dict[str, Any]) -> dict[str, Any] | None:
        """Validate a `villacore.event.v1` envelope pushed by Home Assistant.

        Returns a normalised dict, or ``None`` when the payload is not a
        VillaCore event (the caller then falls back to plain HA webhook
        parsing, so both shapes keep working on the same endpoint).
        """
        if not isinstance(payload, dict):
            return None
        schema = str(payload.get("schema") or "").strip()
        if not schema.startswith("villacore.event."):
            return None
        event = str(payload.get("event") or "").strip()
        if not event:
            return None

        entity_id = str(payload.get("entity_id") or "").strip()
        zone_key = str(payload.get("zone") or "").strip() or None
        kind = str(payload.get("kind") or "").strip().lower()
        if kind not in {ZONE_KIND_UNIT, ZONE_KIND_FACILITY, "common"}:
            zone = self._profile.zones.get(zone_key or "")
            kind = zone.kind if zone else ""

        state = payload.get("state")
        parsed_state = None
        if isinstance(state, dict) and state:
            # Accept both a full HA state object and a bare `{state: ..., attributes: {...}}`.
            candidate = dict(state)
            candidate.setdefault("entity_id", entity_id)
            parsed_state = map_entity_to_state(candidate)

        return {
            "schema": schema,
            "event": event,
            "entity_id": entity_id,
            "zone": zone_key,
            "kind": kind or None,
            "severity": str(payload.get("severity") or "info").strip().lower(),
            "correlation_id": (str(payload.get("correlation_id")).strip() or None)
            if payload.get("correlation_id")
            else None,
            "booking_ref": (str(payload.get("booking_ref")).strip() or None)
            if payload.get("booking_ref")
            else None,
            "reason": (str(payload.get("reason")).strip() or None) if payload.get("reason") else None,
            "site": str(payload.get("site") or "").strip() or None,
            "occurred_at": payload.get("occurred_at"),
            "state": parsed_state,
            "raw": payload,
        }
