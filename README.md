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
- `COMPLIANCE_COMPANY_NAME`
- `COMPLIANCE_PRIVACY_EMAIL`
- `COMPLIANCE_TERMS_URL`
- `COMPLIANCE_PRIVACY_URL`
- `PASSWORD_MIN_LENGTH`
- `AUTO_CREATE_SCHEMA`
- `AUTO_SEED_DATA`

Gestione utenti:
- endpoint `GET/POST/PUT /users` (owner del tenant)
- endpoint `POST /users/{id}/reset-password` (owner del tenant)
- login supporta `tenant_id` nel payload
- endpoint `POST /auth/change-password` (utente autenticato)

Sales core (Fase 1):
- guest CRM: `GET /guests`, `GET /guests/{id}`, `GET /guests/{id}/bookings`
- pagamenti prenotazione: `GET/POST /bookings/{id}/payments`
- fatture: `GET /invoices`, `POST /bookings/{id}/invoice`

Ops automation (Fase 2):
- template messaggi: `GET/POST/PUT /message-templates`
- coda invii: `GET /message-jobs`, `PUT /message-jobs/{id}/status`
- checklist housekeeping per task: `GET/POST/PUT /staff-tasks/{id}/checklist...`

Distribution & Revenue (Fase 3):
- connessioni canali OTA/direct: `GET/POST/PUT /channel-connections`
- regole revenue management: `GET/POST/PUT /revenue-rules`
- suggerimenti tariffari: `GET /revenue/rate-recommendations`
- performance canali: `GET /analytics/channel-performance`

Audit trail:
- endpoint `GET /audit-logs` (owner del tenant)
- registrazione automatica write operations su risorse core

Tenant onboarding (piattaforma):
- endpoint `GET/POST /platform/tenants` (solo platform owner `owner@default`)
- crea tenant + owner iniziale per nuovo cliente

Admin frontend:
- pagina `/admin-control` con:
  - audit logs live
  - export CSV audit
  - compliance links
  - onboarding tenant (owner)

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

Restore manuale da backup:
```bash
POSTGRES_HOST=localhost POSTGRES_PORT=5432 POSTGRES_USER=essa POSTGRES_PASSWORD=essa POSTGRES_DB=essa sh scripts/db-restore.sh <file.sql.gz>
```

Backup/restore drill locale:
```bash
sh scripts/backup-restore-drill.sh
```

Staging compose:
```bash
docker compose -f docker-compose.yml -f docker-compose.staging.yml up -d
```

CI/CD:
- pipeline CI: `.github/workflows/ci.yml`
- pipeline staging (manual trigger): `.github/workflows/staging.yml`
- pipeline release readiness (manual trigger): `.github/workflows/release-readiness.yml`

## Workflow branch

- Aprire sempre un branch feature da `dev`
- Eseguire test/lint/build
- Merge su `dev` solo dopo test passati

Roadmap prodotto: `ROADMAP_PRODUCT.md`

## Schema Tenant & Ruoli

### Modello tenant
- Un `tenant` = un cliente/account separato (es. una property management company).
- Ogni tenant ha dati isolati: prenotazioni, costi, staff, manutenzioni, utenti, audit.
- Il backend applica isolamento dati via `tenant_id` su query e scritture.

### Ruoli
- `platform owner`:
  - Identita: `owner@default` (tenant piattaforma)
  - Può creare nuovi tenant (`/platform/tenants`)
  - Può vedere/gestire tutto nel tenant `default`
- `owner` (tenant):
  - Controllo completo del proprio tenant
  - Gestione utenti del tenant (`/users`, reset password, audit)
- `manager` (tenant):
  - Operatività completa sui dati business del tenant
  - Non gestisce tenant piattaforma
- `operator` (tenant):
  - Read-only su risorse core (nessuna scrittura)
- `viewer` (tenant):
  - Read-only su risorse core (profilo consultazione)

### Matrice accessi sintetica
- `Platform/Tenant onboarding`:
  - `platform owner`: sì
  - `owner/manager/operator/viewer`: no
- `User management tenant`:
  - `owner`: sì
  - altri: no
- `Write su risorse core (bookings, costs, staff, maintenance, ...)`:
  - `owner`, `manager`: sì
  - `operator`, `viewer`: no
- `Read risorse core`:
  - tutti i ruoli tenant: sì

### Flusso operativo consigliato
1. Platform owner crea un nuovo tenant con owner iniziale.
2. Owner tenant fa login con `tenant_id` dedicato.
3. Owner tenant crea manager/operator/viewer interni.
4. Ogni utente lavora solo nel proprio tenant.
