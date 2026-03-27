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
- deeper Home Assistant command coverage and validation
- optional MQTT ingestion layer (future)
- migration from deprecated FastAPI startup hooks to lifespan
- Pydantic v2 cleanup (`ConfigDict`, serializer migration)
- chunk size optimization for large frontend bundles
- final go-live QA checklist for all mobile breakpoints

Current architecture rule remains:
- PMS/Ops owns operational workflow automation
- Smart Building reacts via smart scenes/rules/alerts
- Unit from PMS remains source of truth at unit level
