# PORTAL_CURRENT_STATE_ANALYSIS

Date: March 27, 2026

## 1. Executive Summary

Essaouira Portal is currently a functional modular monolith with:
- stable PMS/Ops core
- advanced Smart Building domain
- multi-tenant isolation and RBAC
- auditability patterns already in place
- working Docker local stack

The project is in a strong "productization" phase, not prototype phase.

## 2. Technical Audit Results

Checks executed during this audit:
- backend tests: `70 passed`
- frontend lint: `pass` (non-blocking baseline-browser-mapping warning)
- frontend production build: `pass`
- Alembic head: `0008_telemetry_insights`
- migration chain is linear from `0001_baseline` to `0008_telemetry_insights`

Observed non-blocking warnings:
- FastAPI `on_event` deprecation (move to lifespan handlers)
- Pydantic v2 deprecations (class `Config`, `json_encoders`)
- frontend large chunks warning (bundle split optimization pending)

## 3. Current Domain Coverage

### Platform Core
- auth login with tenant context
- RBAC roles (`owner`, `manager`, `operator`, `viewer`)
- tenant isolation in API access patterns
- user management and password reset

### PMS/Ops Core
- bookings and operational flows
- staff planner and staff tasks
- maintenance and business sections
- existing business-critical operational automations preserved

### Smart Building Core
- inventory, state, events, alerts
- command lifecycle with status tracking
- scene/rule engine foundations
- automation execution tracking (correlation/dedup)
- property-aware provider registry
- telemetry storage and historical queries
- telemetry insights with deterministic thresholds
- operations read model for actionable smart issues

## 4. Frontend Product Coverage

Implemented smart routes:
- `/smart-dashboard`
- `/smart-overview`
- `/smart-operations`
- `/smart-devices`
- `/smart-devices/:id`
- `/smart-units/:id`
- `/smart-alerts`
- `/smart-automation`
- `/smart-assistant/checkin`
- `/smart-assistant/checkout`
- `/setup`
- `/properties`

UX status:
- modernized UI baseline is present (cards, status badges, timeline, command palette)
- mobile improvements are in progress; most critical card overflow issues have been fixed
- remaining work is incremental polish and final QA hardening

## 5. Home Assistant Lab Readiness

Current implementation supports local HA lab testing with:
- provider mode switching (`mock` / `home_assistant`)
- REST sync + polling fallback
- webhook contract endpoint
- env-based configuration with Docker Desktop host bridge support (`host.docker.internal`)
- unit hint mapping via `HOME_ASSISTANT_UNIT_HINTS`

Security posture:
- token placeholders are empty in committed `.env.example` files
- runtime token expected only in local `.env` (git-ignored)

## 6. Data and Migration State

Migration sequence:
- `0001_baseline`
- `0002_users`
- `0003_device_health_columns`
- `0004_setup_sessions`
- `0005_property_provider_registry`
- `0006_scenario_pack_installs`
- `0007_device_telemetry`
- `0008_telemetry_insights`

Assessment:
- schema evolution is incremental and coherent
- no active migration branch conflicts detected in current branch

## 7. Main Risks / Technical Debt

Priority 1:
- migrate deprecated FastAPI startup events to lifespan
- migrate deprecated Pydantic patterns to native v2 style

Priority 2:
- frontend code-splitting for large chunks (`BookingDocument` and chart-heavy bundles)
- final comprehensive responsive QA across all operational and smart pages

Priority 3:
- broaden real Home Assistant command/event mapping coverage
- optional future MQTT ingestion path (without architecture rewrite)

## 8. Recommended Next Steps

1. Stabilization sprint
- complete responsive QA sweep page-by-page
- remove remaining visual regressions and edge overflows

2. Tech debt sprint
- FastAPI lifespan migration
- Pydantic v2 cleanup
- bundle chunk optimization

3. Smart integration hardening
- expand HA adapter command/service mapping safely
- improve provider sync diagnostics and operator-facing error messaging

4. Go-live readiness pack
- deterministic end-to-end test scenarios
- concise operator runbook for PMS + Smart workflows
- release checklist for tenant onboarding and HA connection validation

## 9. Conclusion

The portal is already usable as a serious PMS/Ops + Smart Property platform.
Current work should focus on hardening, QA completeness, and operational reliability rather than major architectural changes.
