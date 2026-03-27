# Project Structure Guide

## Goal

This guide explains how the repository is organized and where to work when changing a specific part of the product.

## Top-level structure

- `apps/server`
  - FastAPI backend
  - SQLAlchemy models
  - Alembic migrations
  - backend tests
- `apps/web`
  - React + Vite frontend
  - routes, pages, components, service layer
- `docs`
  - product, architecture, process, and onboarding documentation
- `infra`
  - Prometheus / Grafana support files
- `scripts`
  - local operational scripts
- `docker-compose.yml`
  - main local stack
- `docker-compose.staging.yml`
  - staging overlay
- `AGENTS.md`
  - development guardrails and AI execution rules

## Backend structure

Root path:
- `apps/server/app`

Main folders:
- `api`
  - middleware and request-layer cross-cutting logic
- `core`
  - config, auth, logging, bootstrap
- `domains`
  - newer modular domain logic
- `models`
  - shared and legacy SQLAlchemy models
- `main.py`
  - legacy FastAPI routes plus application bootstrap

### Smart Building backend

Path:
- `apps/server/app/domains/smart_building`

Key files:
- `router.py`
  - all `/smart/...` endpoints
- `service.py`
  - business logic and read models
- `schemas.py`
  - Pydantic request/response models
- `taxonomy.py`
  - canonical normalization helpers
- `providers/`
  - mock provider, Home Assistant adapter, mapping helpers

Work here when you modify:
- smart inventory
- alerts
- scenes/rules
- telemetry
- smart operations
- readiness
- smart assistant

### Legacy backend areas

Important legacy files:
- `apps/server/app/main.py`
  - still contains many PMS/Ops routes and schemas
- `apps/server/app/models/booking.py`
- `apps/server/app/models/staff_task.py`
- `apps/server/app/models/maintenance.py`
- `apps/server/app/models/unit.py`
- `apps/server/app/models/property.py`

Work here when you modify:
- bookings
- staff tasks
- maintenance
- units / properties
- auth / platform core routes still not moved into domain folders

### Database / migrations

Path:
- `apps/server/alembic`
- `apps/server/alembic/versions`

Rule:
- every schema change needs an Alembic migration
- no schema-changing feature is complete without migration coverage

### Backend tests

Path:
- `apps/server/tests`

Typical pattern:
- domain-focused test files
- `TestClient(app)` for API-level validation
- helper functions for auth headers and seed entities

## Frontend structure

Root path:
- `apps/web/src`

Main folders:
- `components`
  - reusable UI and feature components
- `pages`
  - route-level page components
- `services`
  - API client layer
- `routes`
  - route map and RBAC gating
- `hooks`
  - reusable hooks such as polling / refresh
- `config`
  - role/permission helpers

### Frontend component layers

- `components/ui`
  - shared primitives such as cards, badges, section headers, loading and freshness indicators
- `components/dashboard`
  - dashboard-oriented cards and list items
- `components/smart`
  - smart-domain-specific presentation components

### Frontend pages

Key PMS/Ops pages:
- `Dashboard.jsx`
- `Bookings.jsx`
- `Calendar.jsx`
- `Staff.jsx`
- `StaffPlanner.jsx`
- `Maintenance.jsx`
- `Units.jsx`

Key Smart pages:
- `SmartDashboard.jsx`
- `SmartOverview.jsx`
- `SmartOperations.jsx`
- `SmartDevices.jsx`
- `SmartDeviceDetail.jsx`
- `SmartUnitDetail.jsx`
- `SmartAlerts.jsx`
- `SmartAutomation.jsx`
- `SmartCheckinAssistant.jsx`
- `SmartCheckoutAssistant.jsx`
- `SetupWizard.jsx`
- `Properties.jsx`

### Frontend routing and RBAC

Files:
- `apps/web/src/App.jsx`
- `apps/web/src/routes/appRoutes.js`
- `apps/web/src/components/ProtectedRoute.jsx`
- `apps/web/src/config/rbac.js`

Rule:
- every new page must be added to route config
- route permissions must stay coherent with current RBAC model

### Frontend service layer

File:
- `apps/web/src/services/api.js`

Rule:
- pages should call the API service layer, not `fetch` directly
- when you add backend endpoints, add matching functions here

## How to choose the right place for a change

### If the change is about smart business logic
- start in `apps/server/app/domains/smart_building/service.py`

### If the change is about smart API contract
- update `schemas.py`, then `router.py`, then `api.js`

### If the change is about PMS/Ops source-of-truth data
- verify whether the source lives in `main.py` and legacy models
- do not duplicate the same rule in Smart Building

### If the change is only visual
- prefer `apps/web/src/components/ui`
- then update only the affected pages

### If the change adds a new page
- create the page in `pages`
- wire `App.jsx`
- wire `appRoutes.js`
- update sidebar / command palette if relevant

## Common repository traps

- `main.py` still contains important legacy PMS/Ops behavior
- Smart Building is modularized; PMS/Ops is partially legacy
- some operational entities are not tenant-scoped in DB, so smart read models must filter carefully
- frontend uses route-level RBAC and a service layer; bypassing either creates drift
- schema changes without migrations will break Dockerized environments quickly

## Practical onboarding checklist

1. Read [README.md](/c:/Users/chouikha/essaouira_portal/README.md)
2. Read [AGENTS.md](/c:/Users/chouikha/essaouira_portal/AGENTS.md)
3. Read [SMART_BUILDING_REFACTOR_SPEC.md](/c:/Users/chouikha/essaouira_portal/docs/SMART_BUILDING_REFACTOR_SPEC.md)
4. Read [AI_CHANGE_GUIDE.md](/c:/Users/chouikha/essaouira_portal/docs/AI_CHANGE_GUIDE.md)
5. Run backend tests and frontend build once before editing
