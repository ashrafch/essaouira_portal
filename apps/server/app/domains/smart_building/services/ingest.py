"""Inbound events: what the building tells the portal.

VillaCore pushes a ``villacore.event.v1`` envelope whenever something
operationally meaningful happens — a check-in completed, a climate protection
tripped, a plant went into fault, devices dropped off the bus. The portal turns
that into timeline entries and, when it means work for a human, into alerts.

Two rules shape this module:

* **The portal never becomes the source of truth for the building.** An event is
  a report, so it records and alerts; it does not re-run automations.
* **The portal must not react to its own actions.** Every command carries a
  correlation id which VillaCore echoes back; an echoed event is recorded but
  never re-triggers rules, which is what would otherwise create a loop.
"""

from __future__ import annotations

from datetime import datetime, timezone

from app.domains.smart_building.schemas import AlertCreate, DeviceEventCreate
from app.domains.smart_building.taxonomy import CANONICAL_LINK_EVENTS
from app.models.smart_building import Alert, Device, DeviceCommand, DeviceEvent

# event -> (alert type, severity, title template)
ALERT_EVENTS: dict[str, tuple[str, str, str]] = {
    "unit.climate.safety_stop": (
        "unit.climate.safety_stop",
        "warning",
        "Clima arrestato per protezione",
    ),
    "unit.devices.unavailable": ("device.offline", "critical", "Dispositivi non disponibili"),
    "facility.alarm.raised": ("facility.alarm.raised", "critical", "Allarme impianto"),
    "facility.safety_stop": ("facility.safety_stop", "critical", "Arresto di sicurezza impianto"),
    "facility.devices.unavailable": (
        "facility.devices.unavailable",
        "critical",
        "Impianto non raggiungibile",
    ),
    "water.leak.detected": ("sensor.leak_detected", "critical", "Perdita acqua rilevata"),
}

# event -> alert types it closes
RESOLVING_EVENTS: dict[str, tuple[str, ...]] = {
    "unit.devices.recovered": ("device.offline",),
    "facility.devices.recovered": ("facility.devices.unavailable",),
    "facility.alarm.cleared": ("facility.alarm.raised", "facility.safety_stop"),
}

# Reasons VillaCore reports for a protective stop, in Italian for the operator.
REASON_LABELS: dict[str, str] = {
    "no_flow": "assenza di flusso",
    "thermal": "protezione termica",
    "thermal_trip": "protezione termica",
    "timeout": "timeout di avvio",
    "consent_lost": "consenso locale assente",
    "rain": "pioggia",
    "leak": "perdita rilevata",
    "window_open": "finestra aperta",
    "sensor_invalid": "sensore non valido",
    "max_runtime": "runtime massimo superato",
    "obstacle": "ostacolo rilevato",
    "contract_mismatch": "contratto PLC incompatibile",
}


class IngestMixin:
    """Handling of events pushed by the building side."""

    # --- helpers -----------------------------------------------------------
    def _is_own_command_echo(self, correlation_id: str | None) -> bool:
        """True when this event is the building confirming our own command."""
        if not correlation_id:
            return False
        return (
            self._scoped_query(DeviceCommand)
            .filter(DeviceCommand.correlation_id == correlation_id)
            .first()
            is not None
        )

    def _resolve_event_device(self, entity_id: str, zone_key: str | None) -> Device | None:
        device = None
        if entity_id:
            device = (
                self._scoped_query(Device)
                .filter(Device.external_id == entity_id)
                .order_by(Device.id.asc())
                .first()
            )
        if device is not None:
            return device
        # Fall back to the zone's availability sensor: a zone-level event (the
        # whole plant dropped) legitimately has no single owning entity.
        if zone_key:
            return self.find_capability_device("sensor.availability", zone_key=zone_key)
        return None

    def _find_duplicate_link_event(
        self, *, device_id: int, external_event_id: str | None
    ) -> DeviceEvent | None:
        """Find a previously ingested envelope without requiring a schema migration."""
        if not external_event_id:
            return None
        candidates = (
            self._scoped_query(DeviceEvent)
            .filter(
                DeviceEvent.device_id == device_id,
                DeviceEvent.event_type == "provider.webhook.ingested",
                DeviceEvent.source == "villacore",
            )
            .order_by(DeviceEvent.id.desc())
            .limit(500)
            .all()
        )
        for candidate in candidates:
            stored = self._safe_json_loads(candidate.payload_json)
            if stored.get("external_event_id") == external_event_id:
                return candidate
        return None

    def _event_description(self, event: str, parsed: dict) -> str:
        reason = parsed.get("reason")
        pieces: list[str] = []
        if reason:
            pieces.append(f"Causa: {REASON_LABELS.get(str(reason), str(reason))}")
        if parsed.get("booking_ref"):
            pieces.append(f"Prenotazione: {parsed['booking_ref']}")
        if parsed.get("zone"):
            pieces.append(f"Zona: {parsed['zone']}")
        pieces.append(f"Evento VillaCore: {event}")
        return ". ".join(pieces)

    def _resolve_open_alerts(
        self, *, device_id: int, alert_types: tuple[str, ...], unit_id: int | None
    ) -> int:
        query = self._scoped_query(Alert).filter(
            Alert.status == "open",
            Alert.alert_type.in_(alert_types),
        )
        # Device-scoped when we know the device, unit-scoped otherwise, so a
        # recovery closes exactly what the matching failure opened.
        query = query.filter(
            Alert.device_id == device_id if device_id is not None else Alert.unit_id == unit_id
        )
        alerts = query.all()
        now = datetime.now(timezone.utc)
        for alert in alerts:
            alert.status = "resolved"
            alert.resolved_at = now
        if alerts:
            self.db.commit()
        return len(alerts)

    # --- entry point -------------------------------------------------------
    def ingest_link_event(self, payload: dict, *, username: str | None = None) -> dict[str, object]:
        """Record a `villacore.event.v1` envelope. Never raises on bad input."""
        self._require_write_access()
        provider = self._provider_instance_for_connection(
            "villacore", self._resolve_connection_for_provider("villacore")
        )
        parse = getattr(provider, "parse_villacore_event", None)
        parsed = parse(payload) if callable(parse) else None
        if parsed is None:
            return {
                "accepted": False,
                "reason": "payload is not a villacore.event.v1 envelope",
                "event": None,
                "event_id": None,
            }

        event = parsed["event"]
        if event not in CANONICAL_LINK_EVENTS:
            return {
                "accepted": False,
                "reason": f"unsupported event '{event}'",
                "event": event,
                "event_id": None,
            }

        device = self._resolve_event_device(parsed["entity_id"], parsed["zone"])
        if device is None:
            # Honest refusal: the portal has never imported this entity, so
            # attaching the event anywhere would be a guess.
            return {
                "accepted": False,
                "reason": (
                    f"entity '{parsed['entity_id']}' unknown to the portal: "
                    "run a provider sync first"
                ),
                "event": event,
                "event_id": None,
            }

        is_echo = self._is_own_command_echo(parsed["correlation_id"])
        duplicate = self._find_duplicate_link_event(
            device_id=device.id, external_event_id=parsed["event_id"]
        )
        if duplicate is not None:
            return {
                "accepted": True,
                "reason": None,
                "event": event,
                "event_id": duplicate.id,
                "device_id": device.id,
                "unit_id": device.unit_id,
                "zone": parsed["zone"],
                "alert_id": None,
                "resolved_alerts": 0,
                "echo_of_portal_command": is_echo,
                "duplicate": True,
                "correlation_id": parsed["correlation_id"],
            }

        if parsed["state"] is not None:
            state_payload = self._state_payload_from_provider_snapshot(parsed["state"])
            self.upsert_device_state(device.id, state_payload)

        device_event = self.create_device_event(
            device_id=device.id,
            payload=DeviceEventCreate(
                event_type="provider.webhook.ingested",
                severity=parsed["severity"],
                source="villacore",
                payload_json=self._safe_json_dumps(
                    {
                        "link_event": event,
                        "external_event_id": parsed["event_id"],
                        "occurred_at": parsed["occurred_at"],
                        "zone": parsed["zone"],
                        "kind": parsed["kind"],
                        "reason": parsed["reason"],
                        "booking_ref": parsed["booking_ref"],
                        "correlation_id": parsed["correlation_id"],
                        "echo_of_portal_command": is_echo,
                        "ingested_by": username or "system",
                    }
                ),
            ),
        )

        alert_id = None
        resolved_alerts = 0
        if event in ALERT_EVENTS:
            alert_type, severity, title = ALERT_EVENTS[event]
            alert = self.create_alert(
                AlertCreate(
                    unit_id=device.unit_id,
                    device_id=device.id,
                    alert_type=alert_type,
                    severity=severity,
                    title=f"{title} - {device.zone_name or device.name}"[:160],
                    description=self._event_description(event, parsed),
                ),
                correlation_id=parsed["correlation_id"],
                # An echo of our own command must not fan out into rules again.
                trigger_rules=not is_echo,
                trigger_source="auto.villacore.link",
                requested_by=username or "villacore",
            )
            alert_id = alert.id
        elif event in RESOLVING_EVENTS:
            resolved_alerts = self._resolve_open_alerts(
                device_id=device.id,
                alert_types=RESOLVING_EVENTS[event],
                unit_id=device.unit_id,
            )

        return {
            "accepted": True,
            "reason": None,
            "event": event,
            "event_id": device_event.id,
            "device_id": device.id,
            "unit_id": device.unit_id,
            "zone": parsed["zone"],
            "alert_id": alert_id,
            "resolved_alerts": resolved_alerts,
            "echo_of_portal_command": is_echo,
            "duplicate": False,
            "correlation_id": parsed["correlation_id"],
        }
