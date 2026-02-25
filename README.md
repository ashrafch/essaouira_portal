# Essaouira Portal

Portale gestionale per appartamenti/BnB a Essaouira.

## Architettura

- `apps/web`: React + Vite (UI)
- `apps/server`: FastAPI + SQLAlchemy (API)
- `docker-compose.yml`: stack completo `web + backend + db`

## Avvio con Docker (consigliato)

```bash
docker compose up --build -d
```

URL:
- Frontend: `http://localhost:8080`
- API health: `http://localhost:8080/api/health`
- API diretta: `http://localhost:8000/health`
- Login default: `owner` / `owner123`

Stop:

```bash
docker compose down
```

Reset completo DB:

```bash
docker compose down -v
```

## Avvio manuale (senza Docker)

1. Database:
```bash
docker compose up -d db
```

2. Backend:
```bash
cd apps/server
python -m venv .venv
. .venv/Scripts/Activate.ps1
pip install -r requirements.txt
copy .env.example .env
uvicorn app.main:app --reload --port 8000
```

3. Frontend:
```bash
cd apps/web
npm install
copy .env.example .env
npm run dev
```

## Variabili ambiente

Backend (`apps/server/.env`):
- `DATABASE_URL`
- `CORS_ORIGINS`
- `ENVIRONMENT` (`development|staging|production`)
- `AUTH_ENABLED`
- `AUTH_SECRET_KEY`
- `AUTH_ALGORITHM`
- `AUTH_ACCESS_TOKEN_MINUTES`
- `ADMIN_USERNAME`
- `ADMIN_PASSWORD`
- `ADMIN_PASSWORD_HASH` (preferito in produzione)
- `ADMIN_ROLE` (`viewer|operator|manager|owner`)
- `ADMIN_TENANT_ID` (tenant/cliente nel token)
- `AUTO_CREATE_SCHEMA`
- `AUTO_SEED_DATA`

Frontend (`apps/web/.env`):
- `VITE_API_BASE_URL`

## Migrazioni

```bash
cd apps/server
set DATABASE_URL=postgresql+psycopg2://essa:essa@localhost:5432/essa
alembic -c alembic.ini upgrade head
```

## Test

Backend:
```bash
cd apps/server
pip install -r requirements-dev.txt
pytest -q
```

Generare password hash admin (consigliato):
```bash
cd apps/server
python -c "from app.core.auth import hash_password; print(hash_password('cambia-questa-password'))"
```

RBAC backend (minimo):
- `viewer` e `operator`: sola lettura sulle risorse core
- `manager` e `owner`: lettura + scrittura

Tenant context:
- il token include `tenant_id`
- opzionalmente puoi inviare header `X-Tenant-Id`; se diverso dal token viene rifiutato (`403`)

Frontend:
```bash
cd apps/web
npm run lint
npm run build
```

## Scalabilita operativa

Monitoraggio (profilo ops):
```bash
docker compose --profile ops up -d
```

Servizi:
- Prometheus: `http://localhost:9090`
- Grafana: `http://localhost:3000` (admin/admin)

Backup automatico DB:
- servizio `db-backup` crea dump gzip ogni 24h
- retention default 7 giorni
- volume: `db_backups`

Staging compose:
```bash
docker compose -f docker-compose.yml -f docker-compose.staging.yml up -d
```

CI/CD:
- pipeline CI: `.github/workflows/ci.yml`
- pipeline staging (manual trigger): `.github/workflows/staging.yml`

## Workflow branch

- Aprire sempre un branch feature da `dev`
- Eseguire test/lint/build
- Merge su `dev` solo dopo test passati
