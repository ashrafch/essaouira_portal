# Gap Analysis & Roadmap

Date: July 13, 2026 — updated after the platform regeneration (design system, app shell, unified mission-control home, IA cross-linking) on branch `refactor/platform-pro-hardening`. Original professionalization refactor: July 8, 2026.

Legend: ✅ done · 🔶 partially addressed · ⛔ open gap (roadmap).

## What the regeneration added (July 13)

- **Design system elevated**: Manrope web font, warm terracotta accent tokens alongside teal, layered shadows, tabular numerals, refined focus rings — light + dark.
- **Component library**: single accessible `Modal`, `ToastProvider`/`useToast`, `Tabs`, `Button`, `Card`, `PageHeader`, `StatCard` with trend + sparkline (documented in `apps/web/src/components/ui/README.md`).
- **App shell**: sidebar with per-section/per-link icons + brand mark; topbar with notifications bell (open smart alerts) + command palette + theme toggle.
- **Unified mission-control home**: clickable operational KPI band bridging PMS/Ops and Smart (arrivals/departures/in-house/tasks/maintenance/smart alerts/units needing attention/devices online) + monthly report download.
- **IA cross-linking**: the two unit views (`/units/:id/timeline` PMS and `/smart-units/:id` Smart) now cross-navigate like one tabbed page; units list and arrivals link to smart status.
- **Backend**: `GET /dashboard/summary` (one lightweight call replacing the sidebar's fetch-everything-on-every-navigation), `GET /analytics/report/monthly(.csv)` owner report. 87 backend tests green.
- **Sidebar performance**: badge counts now come from the single summary endpoint instead of fetching all bookings + tasks + tickets on every navigation.
- **Off-site backups**: `scripts/offsite-sync.sh` + docs.

---

## 1. Architecture & backend

| Gap | Status | Notes |
|---|---|---|
| `app/main.py` god-file (~2,600 lines: routes + schemas + business logic) | ✅ | Split into domain routers/schemas/services (`app/domains/*`); `main.py` reduced to bootstrap. |
| FastAPI `on_event` deprecation | ✅ | Migrated to lifespan handler. |
| Pydantic v1 patterns (`class Config`, `json_encoders`) | ✅ | Migrated to `ConfigDict` / serializers; deprecation warnings eliminated. |
| Config fragmented across 4 modules | ✅ | Single source of truth in `app/core/config.py`. |
| Incomplete Alembic chain (9 smart tables only via `create_all`) | ✅ | Migration `0009_smart_core_tables` + complete `env.py` model imports; production uses migrations only. |
| Weak secrets accepted silently | ✅ | `APP_ENV=production` fails fast on default/weak `AUTH_SECRET_KEY` / `ADMIN_PASSWORD`. |
| `SmartBuildingService` god-class (~5,700 lines) | ⛔ | Works and is well tested; split into submodules (inventory / telemetry / readiness / automation / operations) in a dedicated refactor. |
| **Tenant isolation broken for legacy tables** (`units`, `bookings`, `staff_*`, `cost_items`, `maintenance_tickets`, `pricing_defaults` have no `tenant_id`) | ⛔ | **Highest-priority open gap** if the product is ever sold multi-tenant. For single-owner operation it is not blocking. Requires: column + backfill migration, filter on every legacy query, test coverage. |
| RBAC enforced by path-prefix matching in middleware, duplicated by service checks | ⛔ | Replace with dependency-based permissions per router; unify the two enforcement points. |
| Runtime schema "reconcilers" in `bootstrap.py` (raw `ALTER TABLE`) | 🔶 | Still present for dev fast-path; production no longer depends on them. Remove after one release cycle. |

## 2. Infrastructure & delivery

| Gap | Status | Notes |
|---|---|---|
| No production deployment path | ✅ | `docker-compose.prod.yml` + `.env.production.example` + `docs/DEPLOYMENT.md` (dev / LAN / production). |
| DB and API exposed on all interfaces | ✅ | Loopback-only bindings; the web proxy is the single LAN/production entry point. |
| Hardcoded credentials in `docker-compose.yml` | ✅ | Parametrized via env with dev-only defaults; production requires real values. |
| Backend image without migrations, root user, no healthcheck | ✅ | Alembic shipped in image, non-root user, `HEALTHCHECK`, entrypoint with optional `RUN_MIGRATIONS`. |
| nginx without compression/caching/security headers | ✅ | gzip, immutable asset caching, `nosniff`/`X-Frame-Options`/`Referrer-Policy`. |
| TLS / internet exposure | 🔶 | Documented (Caddy/Traefik in front); not automated. Fine until the product goes on the public internet. |
| Backups stay on the same disk | ✅ | `scripts/offsite-sync.sh` (rclone) + docs; schedule via host cron/Task Scheduler. |
| Staging pipeline is validation-only | ⛔ | No automated deploy; acceptable until there is a staging host. |

## 3. Frontend & UX

| Gap | Status | Notes |
|---|---|---|
| Two-tier UI (tokenized smart pages vs. inline-styled legacy pages) | 🔶 | Full semantic token system introduced; legacy pages swept from hardcoded hex to tokens. Structural rewrite of giant pages still pending (below). |
| No dark mode | ✅ | Token-based dark theme, system-preference default, persisted toggle. |
| Mojibake / missing Italian accents in labels | ✅ | Fixed across the UI (Proprietà, Operatività, chevron icons…). |
| Oversized bundles (598 kB BookingDocument chunk) | ✅ | Manual vendor chunking + dynamic import of pdf libs. |
| Dead starter code (App.css, unused Dexie offline DB, starter assets, title "web") | ✅ | Removed; proper title/lang/manifest/favicon. |
| Duplicated auth constants and RBAC sources | ✅ | Single token helper; RBAC derived from one route table. |
| Accessibility near-zero | 🔶 | Chrome + forms + dialogs covered (labels, aria-expanded, aria-label, focus rings). Page-by-page audit still open. |
| PWA claims vs. reality | ✅ | Honest state: installable (manifest) without offline service worker; docs corrected. |
| Giant page components (`Staff.jsx` ~2,000 lines, `Bookings.jsx` ~1,300) | ⛔ | Decompose into feature components; adopt the `ui/` primitives. |
| Three overlapping modal systems (`Modal`, `MessageModal`, `FeedbackMessage`) | 🔶 | Unified `ui/Modal` + `ToastProvider`/`useToast` shipped; page-by-page migration off the three legacy components still pending. |
| No i18n framework (hardcoded Italian/English mix) | ⛔ | If the product is sold: introduce i18next with `it` + `en` catalogs. For internal use: at least normalize labels to one language. |
| No frontend test runner | ⛔ | Add Vitest + Testing Library; start with auth, RBAC gating, api layer. |
| No data-fetching layer (per-page `useEffect`) | ⛔ | Adopt TanStack Query for caching/retry/dedup when pages get reworked. |
| Overlapping smart landing pages (`SmartOverview` vs `SmartDashboard` vs `SmartOperations`) | 🔶 | Sidebar now marks the primary vs. secondary landings; full merge still a product decision. |

## 4. Product / BnB management gaps (feature roadmap)

Missing capabilities for a professional BnB operation, in suggested order of value:

1. **Channel manager sync** — real iCal import/export (Airbnb/Booking.com) to prevent double bookings; currently channel connections are only registry entries.
2. **Guest communication automation** — the message templates/jobs domain exists; wire it to booking lifecycle events (confirmation, pre-arrival with check-in instructions, post-stay).
3. **Direct booking / availability page** — public read-only availability + inquiry form (product mode).
4. **Payments** — deposit tracking exists; online payment links (Stripe) for the product scenario.
5. **Housekeeping mobile flow** — task checklists with photos, tied to checkout→cleaning→ready pipeline (readiness engine already models "ready").
6. **Reporting pack** — 🔶 monthly owner report (occupancy, ADR, RevPAR, revenue/costs/profit, per-unit, per-source) now available as JSON + CSV (`/analytics/report/monthly`) and downloadable from the home. Remaining: a formatted PDF version.
7. **Smart hardening for go-live** — deeper HA command coverage, MQTT ingestion option, alert → notification channel (email/Telegram/WhatsApp).
8. **Tenant onboarding self-service** — only needed if sold as SaaS; wizard exists, needs billing + isolation completion (see §1 tenant gap).

## 5. Suggested sprint sequence

1. **Hardening sprint (short)** — off-site backups, `SmartBuildingService` split, bootstrap reconciler removal.
2. **PMS value sprint** — iCal channel sync + guest message automation (largest real-world risk & time savings).
3. **UI completion sprint** — decompose Staff/Bookings pages onto the design system, modal consolidation, Vitest baseline.
4. **Product decision gate** — single-owner tool vs. sellable product. If product: tenant isolation for legacy tables, i18n, Stripe, public booking page. If internal: freeze multi-tenant work, prioritize smart go-live.
