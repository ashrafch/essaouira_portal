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
- Frontend: `http://localhost:8081`
- API health: `http://localhost:8081/api/health`
- API diretta: `http://localhost:8000/health`
- Login default: `owner` / `owner123`
- Tenant default login: `default`

Porta frontend configurabile:
```bash
set WEB_PORT=8081
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
- `ADMIN_PASSWORD_HASH` (opzionale, preferibile in produzione)
- `ADMIN_ROLE` (`owner|manager|operator|viewer`)
- `ADMIN_TENANT_ID`
- `PASSWORD_MIN_LENGTH`
- `AUTO_CREATE_SCHEMA`
- `AUTO_SEED_DATA`
- `SMART_PROVIDER_MODE` (`mock|home_assistant`)
- `HOME_ASSISTANT_URL` (es. `http://homeassistant.local:8123`)
- `HOME_ASSISTANT_TOKEN` (Long-Lived Access Token HA)
- `HOME_ASSISTANT_TIMEOUT_SECONDS`
- `HOME_ASSISTANT_INCLUDE_DOMAINS` (csv, es. `switch,light,climate,lock,sensor,binary_sensor`)
- `HOME_ASSISTANT_UNIT_HINTS` (json map `entity_id -> unit hint`, es. `{\"switch.unita_luce\":\"unit a\"}`)
- `DEVICE_OFFLINE_TIMEOUT_SECONDS` (default `1800`)
- `DEVICE_BATTERY_WARNING_LEVEL` (default `20`)
- `DEVICE_BATTERY_CRITICAL_LEVEL` (default `10`)
- `DEVICE_SIGNAL_WARNING_RSSI` (default `-85`)
- `TELEMETRY_MIN_INTERVAL_SECONDS` (default `60`, filtro anti-duplicazione campioni ravvicinati)
- `TELEMETRY_TEMPERATURE_HIGH_C` (default `30`)
- `TELEMETRY_TEMPERATURE_LOW_C` (default `5`)
- `TELEMETRY_HUMIDITY_HIGH_PCT` (default `85`)
- `TELEMETRY_ENERGY_SPIKE_FACTOR` (default `1.8`)
- `TELEMETRY_NOT_REPORTING_SECONDS` (default `7200`)
- `DATA_FRESH_SECONDS` (default `120`)
- `DATA_STALE_SECONDS` (default `600`)

Smart provider endpoints:
- catalog sync: `POST /smart/providers/sync?provider=mock|home_assistant`
- state poll fallback: `POST /smart/providers/poll?provider=mock|home_assistant`
- webhook ingest: `POST /smart/providers/{provider}/webhook`
- provider connections: `GET/POST /smart/provider-connections`, `GET/PUT /smart/provider-connections/{id}`
- health overview: `GET /smart/device-health`
- health by unit: `GET /smart/units/{id}/device-health`
- health by device: `GET /smart/devices/{id}/health`
- devices with freshness metadata: `GET /smart/devices?include_freshness=true`
- telemetry by device: `GET /smart/telemetry/device/{device_id}?metric_type=&from=&to=&interval=`
- telemetry by unit: `GET /smart/telemetry/unit/{unit_id}?metric_type=&from=&to=&interval=`
- telemetry by property: `GET /smart/telemetry/property/{property_id}?metric_type=&from=&to=&interval=`
- telemetry insights:
  - `GET /smart/telemetry-insights?metric_type=&insight_type=&severity=&status=&property_id=&unit_id=`
  - `GET /smart/telemetry-insights/property/{property_id}?metric_type=&insight_type=&severity=&status=`
  - `GET /smart/telemetry-insights/unit/{unit_id}?metric_type=&insight_type=&severity=&status=`
- alerts with freshness metadata: `GET /smart/alerts?status=&include_freshness=true`
- smart dashboard: `GET /smart/dashboard?property_id=&unit_id=`
- smart operations mode:
  - `GET /smart/operations?property_id=&unit_id=&severity=&issue_type=&status=`
  - `GET /smart/operations/units-needing-attention?property_id=&unit_id=&severity=`
  - `GET /smart/operations/issues?property_id=&unit_id=&severity=&issue_type=&status=`
  - `GET /smart/operations/activity?property_id=&unit_id=&severity=`
- scenario packs:
  - `GET /smart/scenario-packs`
  - `GET /smart/scenario-packs/enabled?property_id=`
  - `POST /smart/scenario-packs/enable`

Property management endpoints:
- `GET /properties`
- `POST /properties`
- `GET /properties/{id}`
- `PUT /properties/{id}`

Note:
- `Unit.property_id` collega le unità PMS a una property reale.
- per retrocompatibilita, migrazione/backfill crea una property di default per tenant e assegna le unità senza property.

Setup wizard endpoints:
- `POST /setup/start`
- `GET /setup/session`
- `POST /setup/property`
- `POST /setup/units`
- `POST /setup/connect-provider`
- `POST /setup/import-devices`
- `POST /setup/assign-devices`
- `POST /setup/enable-automations`
- `POST /setup/complete`

Setup wizard (Milestone 12):
- step `property` persiste una `Property` reale (`metadata.property_id`)
- step `connect-provider` persiste una `SmartProviderConnection` (`metadata.provider_connection_id`)
- step `units` assegna `property_id` alle unità create/esistenti
- step `import-devices` usa provider connection se disponibile

Telemetry (Milestone 14):
- metriche supportate: `temperature`, `humidity`, `power`, `energy`, `battery`, `signal`, `motion`, `contact`
- query `interval` supporta bucket `15m`, `1h`, `6h`, `12h`, `1d`
- aggregazioni per bucket: `min`, `max`, `avg`, `sum` (`value` espone `sum` per `energy`, `avg` per le altre metriche)

User management:
- endpoint owner-only: `GET/POST/PUT/DELETE /users`
- reset password: `POST /users/{id}/reset-password`
- login payload supporta `tenant_id`

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
