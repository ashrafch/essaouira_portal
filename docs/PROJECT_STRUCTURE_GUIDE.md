# Project Structure Guide

## Goal

This guide explains how the repository is organized and where to work when changing a specific part of the product.

## Top-level structure

| Path | Contents |
| --- | --- |
| `apps/server` | FastAPI backend: modular domains, SQLAlchemy models, Alembic migrations, tests |
| `apps/web` | React + Vite frontend: routes, pages, components, service layer, design tokens |
| `docs` | Product, architecture, deployment, process and onboarding documentation |
| `infra` | Prometheus support files |
| `scripts` | Operational scripts (DB backup loop) |
| `docker-compose.yml` | Dev/LAN stack (plus `ops` profile) |
| `docker-compose.prod.yml` | Production overlay |
| `docker-compose.staging.yml` | Staging overlay |
| `AGENTS.md` | Engineering charter: guardrails, workflows, Definition of Done |

## Backend structure

Root path: `apps/server/app`

```text
app/
├── main.py            # app factory only: lifespan, CORS, middleware, router includes
├── core/              # config.py (single source of truth), auth, logging, tenant context
├── api/               # middlewares (auth/logging), deps.py (shared dependencies)
├── db.py              # engine/session
├── bootstrap.py       # dev-only schema fast-path + demo seeding
├── models/            # SQLAlchemy models (all imported via models/__init__.py)
└── domains/
    ├── platform/      # health, /auth/login, /users
    ├── inventory/     # /units, /properties
    ├── bookings/      # /bookings, /units/{id}/schedule (+ pricing & auto-task service)
    ├── analytics/     # /analytics/*, /alerts/today (computations in service.py)
    ├── operations/    # staff-tasks/members/defaults, cost-items, pricing-defaults, maintenance
    └── smart_building/ # /smart/* + /setup/*: devices, telemetry, alerts, scenes/rules,
                        # readiness, assistants, providers (mock + home_assistant)
```

Every domain follows **router → service → schemas**. Routers stay thin; business logic lives in services; Pydantic schemas are explicit (v2 style, `ConfigDict`).

### Configuration

- `app/core/config.py` is the only module that reads environment variables (smart provider vars are dynamic properties; everything else is frozen at import).
- `APP_ENV=production` triggers `validate_production_safety()` at startup: weak `AUTH_SECRET_KEY` / `ADMIN_PASSWORD` abort the boot.

### Database / migrations

Path: `apps/server/alembic/versions` — linear chain, head `0009_smart_core_tables`.

Rules:

- every schema change needs an Alembic migration; `alembic/env.py` must import all model modules
- dev may use `AUTO_CREATE_SCHEMA=true` (create_all fast path); production applies migrations via `RUN_MIGRATIONS=true` in the container entrypoint

### Backend tests

Path: `apps/server/tests` (pytest.ini at `apps/server/pytest.ini`; deprecation warnings are errors).

Pattern: domain-focused test files, `TestClient(app)`, helpers for auth headers and seed entities. Production-safety checks live in `tests/test_production_safety.py`.

## Frontend structure

Root path: `apps/web/src`

```text
src/
├── routes/appRoutes.js   # single route + RBAC table (rbac.js derives from it)
├── services/             # api.js (all HTTP), auth.js (single token/session owner)
├── components/
│   ├── ui/               # design-system primitives (cards, badges, skeletons…)
│   ├── smart/            # smart-domain presentation components
│   ├── dashboard/        # dashboard cards and tiles
│   └── chrome.css        # Sidebar/Topbar/Layout styles (token-based)
├── hooks/                # useAutoRefresh, useTheme (dark/light, persisted)
├── pages/                # route-level pages (lazy-loaded)
├── offline/dbLocal.js    # Dexie offline cache (used by Calendar and Units)
└── index.css + components/ui/ui.css   # design tokens (light + dark) and global styles
```

### Design system

- Tokens (colors/spacing/radius/shadows, light + dark themes) are defined in `src/index.css` and documented in `apps/web/DESIGN_TOKENS.md`.
- **Never hardcode hex colors** — use `var(--color-*)` tokens (exceptions: chart palettes, the printable BookingDocument sheet).
- Theme: `[data-theme]` on `<html>`, set pre-paint; toggled from the Topbar; persisted in localStorage.

### Routing and RBAC

Files: `src/App.jsx`, `src/routes/appRoutes.js`, `src/components/ProtectedRoute.jsx`, `src/config/rbac.js`.

Rules:

- every new page is registered in `appRoutes.js` with `allowedRoles`; sidebar visibility derives from the same table
- pages call `src/services/api.js`, never raw `fetch`

## How to choose the right place for a change

| Change | Where |
| --- | --- |
| Smart business logic | `app/domains/smart_building/service.py` |
| Smart API contract | `schemas.py` → `router.py` → `apps/web/src/services/api.js` |
| Bookings / pricing / auto tasks | `app/domains/bookings/` |
| Analytics / KPIs / P&L | `app/domains/analytics/service.py` |
| Staff / costs / maintenance | `app/domains/operations/` |
| Units / properties | `app/domains/inventory/` |
| Auth / users | `app/domains/platform/` + `app/core/auth.py` |
| Visual only | `apps/web/src/components/ui` + tokens, then affected pages |
| New page | page in `pages/`, wire `App.jsx` + `appRoutes.js`, sidebar/command palette if relevant |

## Common repository traps

- Some legacy operational tables are not tenant-scoped in DB (see `docs/GAP_ANALYSIS_AND_ROADMAP.md`); smart read models must filter carefully.
- Dev uses `create_all`; production uses migrations — schema changes without a migration break production.
- Frontend uses route-level RBAC and a service layer; bypassing either creates drift.
- `bootstrap.py` schema reconcilers are a dev-only legacy fast-path scheduled for removal.

## Practical onboarding checklist

1. Read [README.md](../README.md)
2. Read [AGENTS.md](../AGENTS.md)
3. Read [DEPLOYMENT.md](DEPLOYMENT.md)
4. Read [AI_CHANGE_GUIDE.md](AI_CHANGE_GUIDE.md)
5. Run backend tests and frontend build once before editing
