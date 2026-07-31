# SMART_BUILDING_REFACTOR_SPEC

## Objective

Evolve Essaouira Portal from a hospitality management portal into a unified platform that combines:

- PMS / booking / guest / revenue operations
- staff / maintenance / housekeeping operations
- future smart building / domotics / device intelligence

The refactor must preserve the current production-ready value of the portal and extend it safely.

---

## Why this exists

The physical property will include:
- 1 villa
- 6 bungalow apartments
- shared pool and outdoor areas
- local server/network infrastructure
- future Home Assistant-based device layer

The hardware side is not deployed yet.
The software must therefore be ready for:
- simulation
- mocked device states
- future integration with real providers
- real operational workflows once property installation is complete

---

## Product vision

The platform should become a **Smart Property OS** for small hospitality properties.

Not generic home automation.
Not a simple Home Assistant dashboard.
A real business platform where property operations and smart building data work together.

---

## Core product pillars

### 1. Operations
- bookings
- arrivals/departures
- guests
- invoices/payments
- staff planning
- maintenance

### 2. Smart property
- device inventory
- smart unit status
- alerts
- scenes
- automation rules
- future real-time telemetry

### 3. Governance
- multi-tenant
- RBAC
- auditability
- compliance

---

## Initial Smart Building MVP

### Backend MVP
- Device model
- DeviceState model
- DeviceEvent model
- Alert model
- provider abstraction
- mock provider
- Home Assistant connector contract placeholder
- REST endpoints for device inventory and current smart state

### Frontend MVP
- devices list
- smart overview page
- smart unit detail
- alerts list
- unit status widgets inside existing operations flows where useful

### Simulation MVP
- seed or mock devices
- simulate online/offline
- simulate state changes
- simulate alerts

---

## Initial domain model

### Device
Represents a logical device bound to a tenant and usually associated to a unit or zone.

Fields (indicative):
- id
- tenant_id
- unit_id (nullable)
- zone_id (nullable)
- provider
- external_id
- name
- category
- model
- manufacturer
- is_active
- health_status
- battery_level
- last_seen_at
- created_at
- updated_at

### DeviceState
Represents current state snapshot.

Fields (indicative):
- id
- tenant_id
- device_id
- online
- power_state
- motion_detected
- contact_open
- leak_detected
- temperature_c
- humidity_pct
- energy_w
- signal_rssi
- raw_payload_json
- updated_at

### DeviceEvent
Append-only event history.

Fields (indicative):
- id
- tenant_id
- device_id
- unit_id
- event_type
- severity
- payload_json
- source
- occurred_at

### Alert
Operational alert derived from device state/event/rule.

Fields (indicative):
- id
- tenant_id
- unit_id
- device_id
- alert_type
- severity
- status
- title
- description
- first_seen_at
- last_seen_at
- acknowledged_by
- resolved_at

---

## Future integrations

Planned, not fully implemented now:
- Home Assistant API/webhooks
- MQTT event ingestion
- Shelly
- ESPHome
- Zigbee / Matter through HA
- energy dashboards
- scenes triggered by booking lifecycle

---

## Explicit boundaries

### In scope now
- clean smart-building-ready backend structure
- inventory and current state
- simulated provider integration
- UI foundation
- alerting foundation

### Out of scope now
- full hardware provisioning
- production-grade real-time telemetry ingestion at scale
- vendor-specific deep automation workflows
- native mobile app rewrite
- full microservice decomposition

---

## Success criteria

The refactor is successful if:
1. existing portal flows still work
2. smart building domain exists cleanly
3. device inventory is usable
4. simulated states and alerts can be tested now
5. future hardware integration can be plugged in without redesigning the system

---

## Implementation status (as of March 27, 2026)

Implemented:
- Smart domain foundation (devices, states, events, alerts)
- Provider abstraction with mock + Home Assistant adapter baseline
- Smart pages (`/smart-dashboard`, `/smart-overview`, `/smart-devices`, `/smart-unit/:id`, `/smart-alerts`, `/smart-automation`)
- Command lifecycle for supported device categories
- Unit timeline with smart + selected operational events
- Scenes and automation rules foundation
- Taxonomy normalization + alias compatibility
- Correlation and dedup safeguards for automation execution
- Bridge from PMS/Ops events to smart automation reactions
- Device health monitoring and freshness model
- Setup wizard with resumable session lifecycle
- Property model and persistent provider registry
- Scenario packs with idempotent enable flow
- Telemetry storage + historical query endpoints
- Telemetry insights (rule-based anomaly detection)
- Smart Operations Mode (action-first operational read model)
- Guest Readiness Engine for hospitality readiness scoring
- Check-in / Checkout Smart Assistant with booking-scoped guided actions
- UX refresh baseline (cards, timeline, command palette, responsive improvements)

Open areas:
- optional MQTT ingestion layer (future; today VillaCore pushes over HTTP)
- structural decomposition of `UnitTimeline.jsx` and `SmartDashboard.jsx`
- final go-live QA checklist for all mobile breakpoints

Current architecture rule remains:
- PMS/Ops owns operational workflow automation
- Smart Building reacts via smart scenes/rules/alerts
- Unit from PMS remains source of truth at unit level

---

## Update — July 31, 2026: VillaCore Link v1

The "future Home Assistant-based device layer" this spec anticipated now exists as
a separate project, **VillaCore** (villa, apartment A1, pool, irrigation, gate and
outdoor, metering, PLC contract). The integration is specified in
[`VILLACORE_LINK.md`](VILLACORE_LINK.md); the prompts to complete it on the
building side are in [`VILLACORE_PROMPTS.md`](VILLACORE_PROMPTS.md).

What changed relative to the plan above:

- **The service layer is decomposed.** `SmartBuildingService` is an 86-line facade
  over `smart_building/services/*` mixins (devices, commands, alerts, telemetry,
  automation, readiness, assistants, operations, read models, scenario packs,
  provider link, setup, capabilities, facilities, workflows, ingest, utility
  costs).
- **Integration is data-driven, not code-driven.** Entities are classified through
  `providers/villacore_profile.yaml` plus a manifest published by VillaCore, so a
  new building milestone is absorbed without portal code. Verified against the real
  registry at milestone 9: 290 entities, 0 unclassified.
- **Devices are addressed by capability.** `workflow.checkin`, `facility.alarm`,
  `metric.energy_daily`… never by Home Assistant entity id.
- **Two new first-class concepts**: *unit workflows* (the portal states an
  intention, VillaCore executes it with its own safety conditions) and *shared
  facilities* (pool, irrigation, gate, metering — an asset and cost view, not a
  second remote control).
- **Costs**: telemetry becomes `utilities` cost items in the monthly P&L, measured
  where a meter exists and explicitly labelled as estimated where it does not.
- **Boundary sharpened**: VillaCore owns plant state machines and interlocks. The
  portal sends requests and renders refusals verbatim. Only `safe_off` and
  `alarm_reset` are exposed for plants; mode changes and manual starts stay in Home
  Assistant on purpose.
