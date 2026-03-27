# Technical Operator Manual

## Goal

This manual is for a developer, DevOps operator, or technical maintainer who needs to:
- start the platform
- run migrations
- connect Home Assistant lab
- test safely
- troubleshoot common issues

## 1. Local startup

### Docker startup

```bash
docker compose up --build -d
```

Default services:
- frontend: `http://localhost:8081`
- backend direct: `http://localhost:8000`
- db: `localhost:5432`

### Stop

```bash
docker compose down
```

### Full reset

```bash
docker compose down -v
```

Use full reset only when you intentionally want to drop local database state.

## 2. Migrations

Run from:
- `apps/server`

Command:

```bash
alembic -c alembic.ini upgrade head
```

Use before testing new backend features after pulling branch changes.

## 3. Main checks before merge

### Backend

```bash
cd apps/server
python -m pytest -q
```

### Frontend

```bash
cd apps/web
npm run lint
npm run build
```

## 4. Home Assistant lab connection

Use local `.env`, not `.env.example`, for real secrets.

Main variables:
- `SMART_PROVIDER_MODE=home_assistant`
- `HOME_ASSISTANT_URL=http://host.docker.internal:8123`
- `HOME_ASSISTANT_TOKEN=<local_token>`
- `HOME_ASSISTANT_TIMEOUT_SECONDS=10`
- `HOME_ASSISTANT_INCLUDE_DOMAINS=binary_sensor,sensor,switch,climate,input_boolean,input_number`
- `HOME_ASSISTANT_UNIT_HINTS={...}`

After changing env:

```bash
docker compose up -d --build backend
```

## 5. Smart sync flow

Recommended sequence:
1. ensure provider connection is configured
2. import or sync devices
3. verify unit mapping
4. run provider poll/sync
5. verify devices, alerts, telemetry and operations pages

## 6. Troubleshooting map

### Frontend loads but login fails
Check:
- backend container running
- `/health` responds
- token not stale in browser
- compose ports match `8081` and `8000`

### API 401 after login
Check:
- browser local storage/session state
- backend auth env
- tenant sent during login

### Alembic revision errors
Check:
- current branch migration chain
- whether local DB has stale `alembic_version`
- whether migration file exists locally but branch is outdated

### Home Assistant provider imports wrong devices
Check:
- `HOME_ASSISTANT_INCLUDE_DOMAINS`
- `HOME_ASSISTANT_UNIT_HINTS`
- entity names and device classes in HA

### Smart pages show no data
Check:
- device imported and bound to unit
- provider poll/sync executed
- unit/property mapping exists
- tenant used in login is correct

## 7. Recommended technical workflow

1. checkout target branch
2. pull latest changes
3. run migrations
4. run backend tests
5. run frontend build
6. open portal and validate changed flow manually
7. only then merge or continue development

## 8. High-risk areas

- `apps/server/app/main.py`
  - legacy PMS/Ops routes and behavior
- `apps/server/app/domains/smart_building/service.py`
  - central smart business logic
- route permission changes
- tenant filtering changes
- Alembic migrations
- env changes touching auth/provider config

## 9. Useful reference docs

- [PROJECT_STRUCTURE_GUIDE.md](/c:/Users/chouikha/essaouira_portal/docs/PROJECT_STRUCTURE_GUIDE.md)
- [PROJECT_FLOW_OVERVIEW.md](/c:/Users/chouikha/essaouira_portal/docs/PROJECT_FLOW_OVERVIEW.md)
- [AI_CHANGE_GUIDE.md](/c:/Users/chouikha/essaouira_portal/docs/AI_CHANGE_GUIDE.md)
