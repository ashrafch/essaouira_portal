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
- Frontend: `http://localhost:8081` (default)
- API health (via web proxy): `http://localhost:8081/api/health`
- API diretta: `http://localhost:8000/health`
- Login default: `owner` / `owner123`

Porte configurabili (senza modificare file):

```bash
set WEB_PORT=8081
set API_PORT=8000
docker compose up --build -d
```

Stop:

```bash
docker compose down
```

Reset completo DB:

```bash
docker compose down -v
```

Troubleshooting pull immagini (Docker Hub TLS timeout):

```bash
docker logout
docker login
docker pull nginx:1.27-alpine
docker pull node:22-alpine
docker pull python:3.13-slim
```

Se persiste: riavvia Docker Desktop e rete/hotspot, imposta DNS pubblico (1.1.1.1 / 8.8.8.8), poi rilancia `docker compose up --build -d`.

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
- `SMART_PROVIDER_MODE` (`mock|home_assistant`, default `mock`)

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
- frontend dedicato: pagina `/ops-automation`

Distribution & Revenue (Fase 3):
- connessioni canali OTA/direct: `GET/POST/PUT /channel-connections`
- regole revenue management: `GET/POST/PUT /revenue-rules`
- suggerimenti tariffari: `GET /revenue/rate-recommendations`
- performance canali: `GET /analytics/channel-performance`
- frontend: esteso su `/business` (performance canali, channel manager, revenue rules, suggerimenti tariffari)

Smart Building Foundation (Nuova fase):
- overview smart: `GET /smart/overview`
- inventory device: `GET/POST/PUT /smart/devices...`
- stato device: `GET/PUT /smart/devices/{id}/state`
- eventi device: `GET /smart/events`, `POST /smart/devices/{id}/events`
- alert smart: `GET/POST /smart/alerts`, `PUT /smart/alerts/{id}/acknowledge`
- simulazione provider: `POST /smart/devices/{id}/simulate-sync` (mock, nessuna integrazione hardware reale)
- debug provider contract: `GET /smart/providers/debug?provider=mock`
- import catalogo provider: `POST /smart/providers/sync?provider=mock`
- webhook ingestion placeholder: `POST /smart/providers/{provider}/webhook`

Audit trail:
- endpoint `GET /audit-logs` (owner del tenant)
- registrazione automatica write operations su risorse core

Tenant onboarding (piattaforma):
- endpoint `GET/POST /platform/tenants` (solo platform owner `owner@default`)
- endpoint `PUT /platform/tenants/{tenant_id}` (update nome/stato/branding)
- crea tenant + owner iniziale per nuovo cliente

Admin frontend:
- pagina `/admin-control` con:
  - audit logs live
  - export CSV audit
  - compliance links
  - onboarding tenant guidato a step (owner)
  - branding tenant base (primary color + logo URL)

Frontend (`apps/web/.env`):
- `VITE_API_BASE_URL`

Compose (root `.env` opzionale):
- `WEB_PORT` (default `8081`)
- `API_PORT` (default `8000`)

## Mobile & Web App (iPhone + Android)

- UI responsive desktop/mobile con:
  - sidebar desktop
  - drawer mobile da topbar
  - bottom navigation mobile
  - modali full-screen su smartphone
- PWA installabile (manifest + service worker)

Test locale:
```bash
cd apps/web
npm run build
npm run preview
```

Poi apri `http://localhost:4173` da telefono (stessa rete) oppure via emulatore.

Test su telefono reale via hotspot:
1. collega telefono e PC alla stessa rete/hotspot
2. trova IP PC (`ipconfig`)
3. apri `http://<IP_PC>:8081` dal telefono
4. se non apre: consenti porta TCP `8081` nel firewall Windows

Installazione:
- Android/Chrome: menu browser -> `Installa app`.
- iPhone/Safari: `Condividi` -> `Aggiungi a Home`.

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

## QA Go-Live Mobile

- checklist ufficiale: `docs/GO_LIVE_MOBILE_QA.md`
- eseguire checklist completa prima di merge su `dev` e prima di release cliente

## Workflow branch

- Aprire sempre un branch feature da `dev`
- Eseguire test/lint/build
- Merge su `dev` solo dopo test passati

Roadmap prodotto: `ROADMAP_PRODUCT.md`
Analisi funzionalita attuale (operativa + tecnica): `docs/PORTAL_CURRENT_FUNCTIONALITY_ANALYSIS.md`

## UX Refresh

- design system UI unificato (palette, superfici, ombre, radius, spacing)
- layout generale aggiornato (sidebar + topbar + area contenuti)
- flusso modal-first per azioni operative principali
- refresh stilistico esteso su tutte le pagine operative

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
