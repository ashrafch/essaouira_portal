# Essaouira Portal

Multi-tenant hospitality platform for PMS/Ops + Smart Building.

## Quick Start (Docker)

```bash
docker compose up --build -d
```

Default URLs:
- Frontend: `http://localhost:8081`
- API health via proxy: `http://localhost:8081/api/health`
- API direct: `http://localhost:8000/health`
- Default login: `owner / owner123`
- Default tenant: `default`

Stop:

```bash
docker compose down
```

Full DB reset:

```bash
docker compose down -v
```

## Project Structure

- `apps/web`: React + Vite frontend (PWA-ready)
- `apps/server`: FastAPI + SQLAlchemy backend
- `docker-compose.yml`: local stack (`web + backend + db`)
- `infra/`: Prometheus / Grafana config
- `docs/`: architecture and refactor documentation

## Local Configuration

Root `.env` (optional, used by Docker Compose):
- `WEB_PORT` (default `8081`)
- `API_PORT` (default `8000`)
- smart provider env vars (see below)

Server env (`apps/server/.env`):
- auth / RBAC / tenant config
- smart provider config
- health + telemetry thresholds

Web env (`apps/web/.env`):
- `VITE_API_BASE_URL`

## Home Assistant Lab Setup (Local)

1. Copy root env:

```bash
copy .env.example .env
```

2. Configure:

```bash
SMART_PROVIDER_MODE=home_assistant
HOME_ASSISTANT_URL=http://host.docker.internal:8123
HOME_ASSISTANT_TOKEN=<YOUR_LOCAL_TOKEN_DO_NOT_COMMIT>
HOME_ASSISTANT_TIMEOUT_SECONDS=10
HOME_ASSISTANT_INCLUDE_DOMAINS=binary_sensor,sensor,switch,climate,input_boolean,input_number
HOME_ASSISTANT_UNIT_HINTS={}
```

3. Rebuild backend:

```bash
docker compose up -d --build backend
```

Security notes:
- `.env` is git-ignored: never commit real tokens
- keep placeholders empty in versioned files (`.env.example`, `apps/server/.env.example`)
- readiness essentials can be configured with:
  - `ESSENTIAL_DEVICE_CATEGORIES=door_sensor,leak_sensor,climate_controller,smart_light`

## Migrations

```bash
cd apps/server
alembic -c alembic.ini upgrade head
```

Current Alembic head:
- `0008_telemetry_insights`

## Tests and Build

Backend:

```bash
cd apps/server
python -m pytest -q
```

Frontend:

```bash
cd apps/web
npm run lint
npm run build
```

## Main Backend Endpoints

### Core
- `POST /auth/login`
- `GET/POST/PUT/DELETE /users` (owner scope)
- `POST /users/{id}/reset-password`

### Setup Wizard
- `POST /setup/start`
- `GET /setup/session`
- `POST /setup/property`
- `POST /setup/units`
- `POST /setup/connect-provider`
- `POST /setup/import-devices`
- `POST /setup/assign-devices`
- `POST /setup/enable-automations`
- `POST /setup/complete`

### Property / Provider Registry
- `GET/POST /properties`
- `GET/PUT /properties/{id}`
- `GET/POST /smart/provider-connections`
- `GET/PUT /smart/provider-connections/{id}`

### Smart Inventory / Health
- `GET /smart/devices`
- `GET /smart/device-health`
- `GET /smart/units/{id}/device-health`
- `GET /smart/devices/{id}/health`

### Smart Providers
- `POST /smart/providers/sync?provider=mock|home_assistant`
- `POST /smart/providers/poll?provider=mock|home_assistant`
- `POST /smart/providers/{provider}/webhook`

### Smart Dashboard / Operations
- `GET /smart/dashboard?property_id=&unit_id=`
- `GET /smart/readiness?property_id=&status=&min_score=&max_score=`
- `GET /smart/readiness/property/{property_id}?status=&min_score=&max_score=`
- `GET /smart/readiness/unit/{unit_id}`
- `GET /smart/assistant/checkin?property_id=&unit_id=&status=&date_from=&date_to=`
- `GET /smart/assistant/checkin/{booking_id}`
- `GET /smart/assistant/checkout?property_id=&unit_id=&status=&date_from=&date_to=`
- `GET /smart/assistant/checkout/{booking_id}`
- `GET /smart/operations?property_id=&unit_id=&severity=&issue_type=&status=`
- `GET /smart/operations/units-needing-attention`
- `GET /smart/operations/issues`
- `GET /smart/operations/activity`

### Telemetry / Insights
- `GET /smart/telemetry/device/{device_id}`
- `GET /smart/telemetry/unit/{unit_id}`
- `GET /smart/telemetry/property/{property_id}`
- `GET /smart/telemetry-insights`
- `GET /smart/telemetry-insights/property/{property_id}`
- `GET /smart/telemetry-insights/unit/{unit_id}`

### Scenario Packs
- `GET /smart/scenario-packs`
- `GET /smart/scenario-packs/enabled?property_id=`
- `POST /smart/scenario-packs/enable`

## Frontend Routes (Smart)

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

## Operational Monitoring (Optional)

```bash
docker compose --profile ops up -d
```

- Prometheus: `http://localhost:9090`
- Grafana: `http://localhost:3000` (`admin/admin`)

## Documentation

- Smart refactor spec: [docs/SMART_BUILDING_REFACTOR_SPEC.md](/c:/Users/chouikha/essaouira_portal/docs/SMART_BUILDING_REFACTOR_SPEC.md)
- Full current-state analysis: [docs/PORTAL_CURRENT_STATE_ANALYSIS.md](/c:/Users/chouikha/essaouira_portal/docs/PORTAL_CURRENT_STATE_ANALYSIS.md)

## Branch Workflow

- Start feature/fix branches from `dev`
- Run tests/lint/build before merge
- Merge to `dev` only after checks pass
