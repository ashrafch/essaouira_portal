# AGENTS.md — Engineering & AI Execution Charter

This file governs how humans and AI agents work in this repository. It is binding for every change.

---

## 1. Product identity

**Essaouira Portal** is a hospitality operations platform (PMS/Ops + Smart Building) for a real property in Essaouira, Morocco: one villa, six bungalow apartments, pool and shared spaces. It runs today as a single-owner product and is designed to be productizable (multi-tenant SaaS) later.

Stack:

- `apps/server` — FastAPI + SQLAlchemy 2 + Alembic, PostgreSQL, JWT auth, RBAC, multi-tenant scaffolding
- `apps/web` — React 19 + Vite 7, React Router 7, plain-CSS design token system with dark mode, lazy-loaded routes
- Docker Compose for dev / LAN / production (see `docs/DEPLOYMENT.md`)
- Optional ops profile: Prometheus, Grafana, scheduled pg_dump backups
- Smart providers: mock (default) and Home Assistant adapter; hardware not yet deployed — everything must stay testable in simulation

Treat the portal as a working product with real value, never as a prototype to replace.

---

## 2. Architecture map

### Backend — modular monolith by bounded context

```text
apps/server/app/
├── main.py                 # app factory, lifespan, middleware, router includes ONLY
├── core/                   # config (single source of truth), auth, logging, tenant context
├── api/                    # cross-cutting middleware (auth, request logging)
├── db.py                   # engine/session
├── bootstrap.py            # dev-only schema fast-path + seeding
├── models/                 # SQLAlchemy models (shared)
├── domains/
│   ├── platform/           # auth login, users, health
│   ├── inventory/          # units, properties
│   ├── bookings/           # bookings, unit schedule
│   ├── analytics/          # KPIs, month summary/PnL, alerts-today
│   ├── operations/         # staff tasks/members/defaults, cost items, maintenance, pricing defaults
│   ├── revenue/            # rate calendar, recommendations, seasons, lead-time rules, iCal channel sync
│   └── smart_building/     # devices, telemetry, alerts, scenes/rules, readiness, assistants, providers/
└── alembic/                # migrations — complete chain, source of truth in production
```

Each domain follows **router → service → schemas**: routers stay thin, business logic lives in services, Pydantic schemas are explicit. No business logic in route handlers.

### Frontend

```text
apps/web/src/
├── routes/appRoutes.js     # single route + RBAC table (roles derive from here)
├── services/               # api.js (all HTTP), auth.js (single token/session owner)
├── components/ui/          # design-system primitives — use these first
├── components/smart|dashboard|chrome
├── pages/                  # route-level pages (lazy-loaded)
└── index.css + ui.css      # semantic design tokens (light + dark), global styles
```

Rules: pages call `services/api.js` (never raw `fetch`); colors/spacing/radii come from CSS tokens (never hardcoded hex); every new page is registered in `appRoutes.js` with roles.

### Source-of-truth boundaries (critical)

- **PMS/Ops owns**: booking lifecycle, unit ownership, staff task generation, housekeeping and maintenance workflow.
- **Revenue owns**: the per-unit/per-date rate calendar (`rate_calendar`) and price recommendations. It reads bookings/analytics for demand signals and writes prices that booking financials consume; it never re-implements the booking state machine or availability rules.
- **Smart Building owns**: device inventory/state/telemetry, smart alerts, scenes/rules, readiness and operations read models.
- Smart Building **reacts** to PMS events; it never re-implements PMS rules or creates a parallel booking state machine.
- The PMS `Unit` is the canonical unit entity everywhere.

---

## 3. Non-negotiable guardrails

1. **Preserve behavior.** Existing endpoints, flows, RBAC and tenant logic keep working. Breaking changes require explicit request, documentation, and minimal blast radius.
2. **Contracts are frozen by default.** Route paths, methods and response shapes change only deliberately. When refactoring internals, verify OpenAPI path/method parity before and after.
3. **Tenant safety by design.** Every new entity gets `tenant_id` (use `TenantScopedMixin`); every new query filters by tenant. Known legacy gap: pre-smart tables lack `tenant_id` — do not extend that pattern, and consult `docs/GAP_ANALYSIS_AND_ROADMAP.md` before touching it.
4. **No schema change without an Alembic migration.** `create_all` is a dev convenience only; production migrates via `RUN_MIGRATIONS=true`. Keep `alembic/env.py` model imports complete.
5. **Secrets never enter git.** Tokens/passwords live in git-ignored `.env*` files; committed examples hold placeholders only. `APP_ENV=production` fails fast on weak secrets — never weaken that check.
6. **Honest completion.** Simulated/mocked integrations are labeled as such. Never claim hardware integration works when it is stubbed. Report failing tests as failing.
7. **The stack stays runnable.** After every meaningful change: backend tests pass, frontend lint+build pass, `docker compose config` is valid.
8. **Modular monolith.** No microservices, Kafka, or Kubernetes without explicit request. New async components only when simple and justified.
9. **Professional code.** Typed where possible, clear naming, no dead code, no duplicated business rules, no magic constants, comments only where they add information the code cannot express.
10. **Docs move with code.** New domains, env vars, endpoints or architecture decisions update `README.md` / `docs/` in the same change.

---

## 4. Definition of Done

A task is complete only when all of these hold:

1. Implementation finished; no TODO left for the core of the request.
2. Alembic migration included if schema changed.
3. Backend: `cd apps/server && python -m pytest -q` passes (new logic has new tests).
4. Frontend: `cd apps/web && npm run lint && npm run build` pass (no new chunk-size warnings).
5. API contract parity verified when refactoring (OpenAPI diff or targeted checks).
6. Docs updated where user-facing or operational behavior changed.
7. Limitations and follow-ups stated explicitly in the final report.

Quality gates (CI runs these on every PR): backend pytest, frontend lint+build, compose config validation (dev + prod overlay), image builds.

---

## 5. Standard workflows

### Backend feature

1. Identify owning domain (`app/domains/<domain>/`); check the service for existing logic before adding any.
2. Schema → service → router → tests → migration (if needed) → docs.
3. Tenant + RBAC review for every new route.

### Frontend feature

1. Add/extend the API function in `services/api.js`.
2. Reuse `components/ui` primitives; create feature components, not page monoliths.
3. Register route + roles in `appRoutes.js`; wire sidebar/command palette if user-facing.
4. Verify both themes (light/dark) and mobile layout.

### Bug fix

1. Reproduce (test or manual); write the failing test when practical.
2. Fix at the source-of-truth layer, never by duplicating logic downstream.

### Refactor

1. Baseline first: run tests/build, count routes, snapshot contracts.
2. Move in reviewable increments; keep each step green.
3. Prove parity at the end (tests + contract diff), then clean up.

---

## 6. Environment & operations quick reference

| Action | Command |
| --- | --- |
| Dev stack | `docker compose up --build -d` → web `http://localhost:8081` |
| LAN publication | same stack; clients use `http://<host-ip>:<WEB_PORT>` (API is loopback-only by design) |
| Production | `docker compose --env-file .env.production -f docker-compose.yml -f docker-compose.prod.yml up -d --build` |
| Ops profile | `docker compose --profile ops up -d` (Prometheus/Grafana/backups) |
| Backend tests | `cd apps/server && python -m pytest -q` |
| Frontend checks | `cd apps/web && npm run lint && npm run build` |
| Migrations | `cd apps/server && alembic -c alembic.ini upgrade head` |

Full detail: `docs/DEPLOYMENT.md`. Default dev login `owner / owner123`, tenant `default`.

---

## 7. Sub-agent / parallel execution protocol

Use delegation when the runtime supports it and the task splits into bounded, non-overlapping slices.

**Ownership rule (hard):** no two concurrent writers on the same file set. Standard partitions:

- Backend worker: `apps/server/**` (excluding Dockerfile when infra is separately owned)
- Frontend worker: `apps/web/src/**`
- Infra owner: `docker-compose*`, `Dockerfile`s, `nginx.conf`, `.github/**`
- Docs owner: `docs/**`, `README.md`, `AGENTS.md`

**Pattern:** main agent scopes and integrates; explorer agents return findings only; workers implement disjoint slices and run their own verification; the main agent remains accountable for integration, final test/build runs, documentation, and the report.

**Report format (every worker):** files changed · behavior changed · checks run with results · deviations/limitations.

---

## 8. What to avoid

- Big-bang rewrites, framework churn, speculative abstractions
- New frontend stacks, CSS frameworks, or state libraries without explicit request
- Bypassing `services/api.js`, the token system, route RBAC, or tenant filters
- Coupling business logic to Home Assistant internals (providers stay behind the adapter interface)
- Flooding PostgreSQL with high-frequency raw telemetry (aggregate or bound it)
- Committing generated artifacts (`dist/`, `test.db`, caches) or real secrets
- Silently renaming concepts that existing UX/API/docs rely on

---

## 9. Current priorities

Consult `docs/GAP_ANALYSIS_AND_ROADMAP.md` for the maintained list. Headlines:

1. **Hardening**: off-site backups; split `smart_building/service.py` into submodules; retire dev-only schema reconcilers.
2. **PMS value**: iCal channel sync (double-booking prevention), guest message automation on booking lifecycle.
3. **UI completion**: decompose `Staff.jsx` / `Bookings.jsx` onto the design system; consolidate modals; Vitest baseline.
4. **Product gate** (only if sold as SaaS): tenant isolation for legacy tables, i18n, payments, public booking page.

When priorities conflict with a user request, the user request wins — but flag the conflict explicitly.
