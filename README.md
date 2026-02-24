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

Frontend (`apps/web/.env`):
- `VITE_API_BASE_URL`

## Workflow branch

- Aprire sempre un branch feature da `dev`
- Eseguire test/lint/build
- Merge su `dev` solo dopo test passati
