"""Classifies VillaCore Home Assistant entities into portal concepts.

One entity id carries everything the portal needs, because VillaCore follows a
stable naming convention (its ADR 0007): ``<domain>.<zone>_<function>``. This
module turns that into three answers:

* **zone** — ``a1``, ``villa``, ``pool``, ``garden``… and what kind of scope it
  is (a PMS unit, a shared facility, or site-wide common plumbing);
* **capability** — what role the entity plays (``workflow.checkin``,
  ``facility.alarm``, ``metric.energy``…), so callers ask for a capability
  instead of hardcoding an entity id;
* **whether to import it at all** — HA plumbing and VillaCore's simulation
  helpers must never become portal devices.

Everything is driven by ``villacore_profile.yaml``. A VillaCore milestone that
adds another plant of the usual shape is classified with no code change; when a
manifest is published by VillaCore it wins over the profile. Whatever cannot be
classified is returned as *unclassified* so the portal can report it rather
than dropping it silently.
"""

from __future__ import annotations

import fnmatch
from dataclasses import dataclass, field
from functools import lru_cache
from pathlib import Path
from typing import Any

import yaml

PROFILE_PATH = Path(__file__).with_name("villacore_profile.yaml")

# Scope kinds a zone can have.
ZONE_KIND_UNIT = "unit"
ZONE_KIND_FACILITY = "facility"
ZONE_KIND_COMMON = "common"
ZONE_KINDS = frozenset({ZONE_KIND_UNIT, ZONE_KIND_FACILITY, ZONE_KIND_COMMON})


@dataclass(frozen=True)
class CapabilityRule:
    capability: str
    domain: str
    suffix: str
    singleton: bool = False
    metric: str | None = None

    def matches(self, domain: str, suffix: str) -> bool:
        if self.domain != domain:
            return False
        if self.suffix in {"*", ""}:
            return True
        return fnmatch.fnmatchcase(suffix, self.suffix)


@dataclass(frozen=True)
class ZoneSpec:
    key: str
    kind: str
    display_name: str
    machine: str | None = None
    rated_power_w: int | None = None
    known: bool = True
    # True for metering zones whose entities describe *other* zones, e.g.
    # `sensor.energy_a1_daily` lives in zone `energy` but measures unit `a1`.
    subject_zones: bool = False


@dataclass(frozen=True)
class EntityClassification:
    """What the portal decided about a single Home Assistant entity."""

    entity_id: str
    domain: str
    zone: ZoneSpec | None = None
    capability: str | None = None
    metric: str | None = None
    singleton: bool = False
    excluded: bool = False
    exclude_reason: str | None = None
    # Set when the zone prefix was not in the profile: still usable, but worth
    # showing to the operator.
    inferred_zone: bool = False
    # Zone the entity *measures*, when different from the one it lives in
    # (site metering). Drives cost attribution to the right unit or plant.
    subject_zone: ZoneSpec | None = None

    @property
    def classified(self) -> bool:
        return not self.excluded and self.zone is not None and self.capability is not None

    @property
    def zone_key(self) -> str | None:
        return self.zone.key if self.zone else None

    @property
    def effective_zone(self) -> ZoneSpec | None:
        """Zone the reading belongs to for attribution purposes."""
        return self.subject_zone or self.zone

    @property
    def facility_key(self) -> str | None:
        zone = self.effective_zone
        if zone is None or zone.kind != ZONE_KIND_FACILITY:
            return None
        return zone.key


@dataclass
class VillaCoreProfile:
    contract_version: str
    include_domains: set[str]
    exclude_domains: set[str]
    exclude_patterns: list[str]
    zones: dict[str, ZoneSpec]
    rules: list[CapabilityRule] = field(default_factory=list)

    # --- construction ----------------------------------------------------
    @classmethod
    def from_mapping(cls, raw: dict[str, Any]) -> "VillaCoreProfile":
        exclude = raw.get("exclude") or {}
        zones: dict[str, ZoneSpec] = {}
        for key, spec in (raw.get("zones") or {}).items():
            spec = spec or {}
            kind = str(spec.get("kind", ZONE_KIND_FACILITY)).strip().lower()
            if kind not in ZONE_KINDS:
                kind = ZONE_KIND_FACILITY
            rated = spec.get("rated_power_w")
            zones[str(key)] = ZoneSpec(
                key=str(key),
                kind=kind,
                display_name=str(spec.get("display_name") or key),
                machine=(str(spec["machine"]).strip() if spec.get("machine") else None),
                rated_power_w=int(rated) if isinstance(rated, (int, float)) else None,
                subject_zones=bool(spec.get("subject_zones", False)),
            )

        rules: list[CapabilityRule] = []
        for entry in raw.get("capabilities") or []:
            if not entry.get("capability") or not entry.get("domain"):
                continue
            rules.append(
                CapabilityRule(
                    capability=str(entry["capability"]).strip(),
                    domain=str(entry["domain"]).strip().lower(),
                    suffix=str(entry.get("suffix", "*")).strip(),
                    singleton=bool(entry.get("singleton", False)),
                    metric=(str(entry["metric"]).strip() if entry.get("metric") else None),
                )
            )

        return cls(
            contract_version=str(raw.get("contract_version") or "villacore.link.v1"),
            include_domains={str(d).strip().lower() for d in raw.get("include_domains") or []},
            exclude_domains={str(d).strip().lower() for d in exclude.get("domains") or []},
            exclude_patterns=[str(p) for p in exclude.get("entity_patterns") or []],
            zones=zones,
            rules=rules,
        )

    # --- zone / capability resolution ------------------------------------
    def zone_for(self, object_id: str) -> tuple[ZoneSpec | None, str]:
        """Longest matching zone prefix wins, so `a1` never shadows `a10`."""
        best: ZoneSpec | None = None
        best_len = -1
        for key, spec in self.zones.items():
            if object_id == key or object_id.startswith(f"{key}_"):
                if len(key) > best_len:
                    best, best_len = spec, len(key)
        if best is not None:
            suffix = object_id[best_len:].lstrip("_")
            return best, suffix

        # Unknown prefix: treat the first segment as a facility so a brand-new
        # VillaCore plant still shows up instead of vanishing.
        head, _, tail = object_id.partition("_")
        if not head:
            return None, object_id
        inferred = ZoneSpec(
            key=head,
            kind=ZONE_KIND_FACILITY,
            display_name=head.replace("_", " ").title(),
            known=False,
        )
        return inferred, tail

    def rule_for(self, domain: str, suffix: str) -> CapabilityRule | None:
        for rule in self.rules:
            if rule.matches(domain, suffix):
                return rule
        return None

    # --- the single entry point used by the provider ---------------------
    def classify(self, entity_id: str) -> EntityClassification:
        entity_id = (entity_id or "").strip()
        domain, _, object_id = entity_id.partition(".")
        domain = domain.strip().lower()

        if not domain or not object_id:
            return EntityClassification(
                entity_id=entity_id,
                domain=domain,
                excluded=True,
                exclude_reason="malformed entity id",
            )
        for pattern in self.exclude_patterns:
            if fnmatch.fnmatchcase(entity_id, pattern):
                return EntityClassification(
                    entity_id=entity_id,
                    domain=domain,
                    excluded=True,
                    exclude_reason=f"excluded by pattern '{pattern}'",
                )
        if domain in self.exclude_domains:
            return EntityClassification(
                entity_id=entity_id,
                domain=domain,
                excluded=True,
                exclude_reason=f"excluded domain '{domain}'",
            )
        if self.include_domains and domain not in self.include_domains:
            return EntityClassification(
                entity_id=entity_id,
                domain=domain,
                excluded=True,
                exclude_reason=f"domain '{domain}' not in include_domains",
            )

        zone, suffix = self.zone_for(object_id)
        rule = self.rule_for(domain, suffix)
        subject_zone = None
        if zone is not None and zone.subject_zones:
            subject_zone = self.subject_zone_for(suffix, own_zone=zone)
        return EntityClassification(
            entity_id=entity_id,
            domain=domain,
            zone=zone,
            capability=rule.capability if rule else None,
            metric=rule.metric if rule else None,
            singleton=rule.singleton if rule else False,
            inferred_zone=bool(zone and not zone.known),
            subject_zone=subject_zone,
        )

    def subject_zone_for(self, suffix: str, *, own_zone: ZoneSpec) -> ZoneSpec | None:
        """Zone named inside a metering entity's suffix, if any.

        ``energy_a1_daily`` -> suffix ``a1_daily`` -> subject zone ``a1``.
        A suffix like ``site_daily`` names no zone, so the reading stays on the
        metering zone itself.
        """
        head = suffix.split("_", 1)[0] if suffix else ""
        if not head or head == own_zone.key:
            return None
        candidate = self.zones.get(head)
        if candidate is None or candidate.key == own_zone.key:
            return None
        return candidate

    # --- manifest overlay -------------------------------------------------
    def with_manifest(self, manifest: dict[str, Any] | None) -> "VillaCoreProfile":
        """Return a profile enriched with what VillaCore itself declares.

        The manifest is authoritative for zones (a new plant announces its own
        kind and display name) but only *adds* capability rules, so a malformed
        manifest can never make the portal blind to entities it already knew.
        """
        if not isinstance(manifest, dict) or not manifest:
            return self

        # The manifest is data from another system, edited by hand at times.
        # Every branch below tolerates the wrong shape: a broken manifest must
        # degrade to "profile only", never break classification.
        zones = dict(self.zones)
        raw_zones = manifest.get("zones")
        for key, spec in (raw_zones if isinstance(raw_zones, dict) else {}).items():
            if not isinstance(spec, dict):
                continue
            kind = str(spec.get("kind", ZONE_KIND_FACILITY)).strip().lower()
            if kind not in ZONE_KINDS:
                continue
            rated = spec.get("rated_power_w")
            existing = self.zones.get(str(key))
            zones[str(key)] = ZoneSpec(
                key=str(key),
                kind=kind,
                display_name=str(spec.get("display_name") or (existing.display_name if existing else key)),
                machine=(
                    str(spec["machine"]).strip()
                    if spec.get("machine")
                    else (existing.machine if existing else None)
                ),
                rated_power_w=(
                    int(rated)
                    if isinstance(rated, (int, float))
                    else (existing.rated_power_w if existing else None)
                ),
            )

        # Explicit capability -> entity_id declarations become highest-priority
        # exact-match rules.
        extra_rules: list[CapabilityRule] = []
        raw_capabilities = manifest.get("capabilities")
        for capability, entity_ids in (
            raw_capabilities if isinstance(raw_capabilities, dict) else {}
        ).items():
            capability_name = str(capability).strip()
            if not capability_name:
                continue
            values = entity_ids if isinstance(entity_ids, list) else [entity_ids]
            for raw_entity_id in values:
                if not isinstance(raw_entity_id, str):
                    continue
                entity_id = raw_entity_id.strip()
                domain, _, object_id = entity_id.partition(".")
                if not domain or not object_id:
                    continue
                suffix = object_id
                for key in sorted(zones, key=len, reverse=True):
                    if object_id == key or object_id.startswith(f"{key}_"):
                        suffix = object_id[len(key):].lstrip("_")
                        break
                extra_rules.append(
                    CapabilityRule(
                        capability=capability_name,
                        domain=domain.strip().lower(),
                        suffix=suffix or "*",
                        singleton=True,
                    )
                )

        return VillaCoreProfile(
            contract_version=str(manifest.get("contract_version") or self.contract_version),
            include_domains=set(self.include_domains),
            exclude_domains=set(self.exclude_domains),
            exclude_patterns=list(self.exclude_patterns),
            zones=zones,
            rules=extra_rules + self.rules,
        )


@lru_cache(maxsize=1)
def load_profile() -> VillaCoreProfile:
    """Parse the bundled profile once per process."""
    raw = yaml.safe_load(PROFILE_PATH.read_text(encoding="utf-8")) or {}
    return VillaCoreProfile.from_mapping(raw)
