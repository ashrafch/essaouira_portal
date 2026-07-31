# Essaouira Portal

Hospitality operations platform (PMS/Ops + Smart Building) for a villa + six bungalow apartments in Essaouira — bookings, staff, maintenance, finance, and smart-property intelligence in one portal. Multi-tenant-ready, Home Assistant-integrable, Dockerized.

## Quick start

```bash
docker compose up --build -d
```

- Portal: <http://localhost:8081> (LAN: `http://<host-ip>:8081`)
- API health via proxy: <http://localhost:8081/api/health>
- Default login: `owner / owner123` — tenant `default`

Stop: `docker compose down` · Full DB reset: `docker compose down -v`

Other modes (LAN publication, production/product deployment, ops profile with Prometheus/Grafana/backups): see **[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)**.

## Repository layout

| Path | Contents |
| --- | --- |
| `apps/server` | FastAPI backend — modular domains (`platform`, `inventory`, `bookings`, `analytics`, `operations`, `revenue`, `smart_building`), SQLAlchemy models, Alembic migrations, tests |
| `apps/web` | React 19 + Vite frontend — token-based design system with dark mode (see `apps/web/DESIGN_TOKENS.md`) |
| `docker-compose.yml` | Dev/LAN stack (db + backend + web, ops profile optional) |
| `docker-compose.prod.yml` | Production overlay (migrations, secret enforcement, restart policies) |
| `infra/` | Prometheus configuration |
| `scripts/` | Operational scripts (DB backup loop) |
| `docs/` | Architecture, deployment, manuals, gap analysis |

## Development

Backend:

```bash
cd apps/server
python -m pytest -q                      # tests
alembic -c alembic.ini upgrade head      # migrations
```

Frontend:

```bash
cd apps/web
npm run lint && npm run build
npm run dev                              # http://localhost:5173
```

Engineering rules, guardrails and Definition of Done: **[AGENTS.md](AGENTS.md)**.

## Configuration

All environment variables are documented in `.env.example` (dev) and `.env.production.example` (production). Real secrets live only in git-ignored `.env*` files.

Key toggles:

- `APP_ENV=production` — fail-fast on weak secrets
- `RUN_MIGRATIONS=true` — apply Alembic migrations at container startup (production default)
- `SMART_PROVIDER_MODE=mock|home_assistant|villacore` — smart provider selection
- `HOME_ASSISTANT_URL` / `HOME_ASSISTANT_TOKEN` — Home Assistant connection (see docs/DEPLOYMENT.md §6)
- `SMART_INGEST_TOKEN` / `SMART_POLL_INTERVAL_SECONDS` — VillaCore Link push + reconciliation (see [docs/VILLACORE_LINK.md](docs/VILLACORE_LINK.md))

## API surface

Interactive docs at `/docs` (Swagger) when the backend runs. Main groups: `/auth`, `/users`, `/units`, `/properties`, `/bookings`, `/analytics/*`, `/staff-*`, `/cost-items`, `/maintenance`, `/revenue/*` (rate calendar, recommendations, seasons, lead-time rules, iCal channels, comp-set, pricing alerts), `/setup/*`, `/smart/*` (devices, health, telemetry, readiness, operations, assistants, scenario packs, unit capabilities & workflows, shared facilities, utility costs, `/smart/link/*` for the VillaCore Link).

## Documentation

- [docs/DOCUMENTATION_INDEX.md](docs/DOCUMENTATION_INDEX.md) — index by audience
- [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) — dev / LAN / production deployment
- [docs/VILLACORE_LINK.md](docs/VILLACORE_LINK.md) — contract with the VillaCore building platform (setup: `scripts/link-villacore.ps1` then `python scripts/get_villacore_token.py`)
- [docs/VILLACORE_PROMPTS.md](docs/VILLACORE_PROMPTS.md) — ready-to-paste prompts for the VillaCore repository

Onboarding is guided by the Setup Wizard (`/setup`), which explains every step and
binds building zones to units. `scripts/reset_smart_layer.py` starts the smart
layer over without touching PMS data.
- [docs/GAP_ANALYSIS_AND_ROADMAP.md](docs/GAP_ANALYSIS_AND_ROADMAP.md) — current gaps and roadmap
- [docs/PROJECT_STRUCTURE_GUIDE.md](docs/PROJECT_STRUCTURE_GUIDE.md) — where to change what
- [docs/TECHNICAL_OPERATOR_MANUAL.md](docs/TECHNICAL_OPERATOR_MANUAL.md) — run & troubleshoot
- [docs/END_USER_PORTAL_MANUAL.md](docs/END_USER_PORTAL_MANUAL.md) — daily portal usage

## Branch workflow

- Feature/fix branches start from `dev`; merge back only with tests, lint and build green (CI enforces).
- `main` is the stable line for releases.
