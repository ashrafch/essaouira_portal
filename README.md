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
- `AUTH_ENABLED`
- `AUTH_SECRET_KEY`
- `AUTH_ALGORITHM`
- `AUTH_ACCESS_TOKEN_MINUTES`
- `ADMIN_USERNAME`
- `ADMIN_PASSWORD`
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

Frontend:
```bash
cd apps/web
npm run lint
npm run build
```

## Workflow branch

- Aprire sempre un branch feature da `dev`
- Eseguire test/lint/build
- Merge su `dev` solo dopo test passati
