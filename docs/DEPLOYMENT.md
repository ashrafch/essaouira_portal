# Deployment Guide

How to run Essaouira Portal in each supported mode:

1. **Local development** — on your machine, demo data, weak dev credentials allowed.
2. **LAN publication** — reachable by phones/tablets/PCs on the same network (villa/property local server). No internet exposure required.
3. **Production / product** — hardened stack for a real deployment (VPS, on-prem server, or the property's local server acting as production).

All modes use the same images and the same `docker-compose.yml`; overlays and env files change the behavior.

---

## 1. Local development

```bash
copy .env.example .env        # optional, defaults work out of the box
docker compose up --build -d
```

- Frontend: http://localhost:8081
- API through the proxy: http://localhost:8081/api/health
- API direct (loopback only): http://localhost:8000/health
- Default login: `owner / owner123`, tenant `default`

Dev behavior: schema auto-created (`AUTO_CREATE_SCHEMA=true`), demo data seeded (`AUTO_SEED_DATA=true`), DB and API ports bound to `127.0.0.1` only.

Stop with `docker compose down`; full DB reset with `docker compose down -v`.

### Without Docker (hot reload)

```bash
# backend
cd apps/server
python -m venv venv && venv\Scripts\pip install -r requirements.txt -r requirements-dev.txt
venv\Scripts\uvicorn app.main:app --reload --port 8000

# frontend
cd apps/web
npm install
npm run dev        # http://localhost:5173, VITE_API_BASE_URL from apps/web/.env
```

---

## 2. LAN publication (property local server, no internet)

The web container binds `WEB_PORT` on **all interfaces**, and nginx proxies `/api` to the backend. LAN clients therefore need exactly one port and no CORS configuration:

1. On the host machine, find the LAN IP (e.g. `192.168.1.50`).
2. Start the stack normally (`docker compose up -d`). Optionally set `WEB_PORT=80` in `.env` so clients can omit the port.
3. From any device on the network: `http://192.168.1.50` (or `http://192.168.1.50:8081`).
4. Allow the port through the Windows/host firewall if prompted.

Notes:

- Always use the web URL — the API is intentionally **not** exposed on the LAN (loopback binding). Everything flows through the nginx `/api` proxy, which is same-origin (no CORS issues).
- The database is never reachable from the LAN.
- For a long-running property server, use the production overlay (section 3) even on the LAN: it adds restart policies, migration-managed schema, and secret checks. TLS is optional on a trusted LAN.

---

## 3. Production / product deployment

```bash
copy .env.production.example .env.production
# fill POSTGRES_PASSWORD, AUTH_SECRET_KEY, ADMIN_PASSWORD (long random values)

docker compose --env-file .env.production -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

What the production overlay enforces:

| Aspect | Dev | Production |
|---|---|---|
| Weak secrets | allowed | **startup fails** (`APP_ENV=production` check) |
| Schema | `create_all` at startup | **Alembic migrations** (`RUN_MIGRATIONS=true`) |
| Demo data | seeded | never seeded |
| DB/API host ports | loopback | **none** (web proxy is the only entry point) |
| Restart policy | none | `unless-stopped` |

Generate strong secrets:

```bash
python -c "import secrets; print(secrets.token_urlsafe(48))"
```

### Internet exposure (optional)

Do not expose the stack directly. Put a TLS-terminating reverse proxy in front of the `web` port:

- **Caddy** (simplest): `portal.example.com { reverse_proxy localhost:80 }` — automatic HTTPS.
- **Traefik / nginx proxy manager** also work; the upstream is always the `web` container port.

Checklist before going public: strong `.env.production` secrets, `WEB_PORT` bound only where the proxy reaches it, backups enabled (below), a non-default admin password, and the ops profile secured or disabled.

### Updating a deployment

```bash
git pull
docker compose --env-file .env.production -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

Migrations run automatically at backend startup (`RUN_MIGRATIONS=true`).

---

## 4. Backups and monitoring (ops profile)

```bash
docker compose --profile ops up -d
```

- **db-backup**: `pg_dump | gzip` into the `db_backups` volume every `BACKUP_INTERVAL_HOURS` (default 24h), retention `BACKUP_RETENTION_DAYS` (default 7).
- **Prometheus**: http://localhost:9090 (scrapes backend `/metrics`).
- **Grafana**: http://localhost:3000 (`GRAFANA_ADMIN_USER`/`GRAFANA_ADMIN_PASSWORD`).

Restore a backup:

```bash
docker compose exec db sh -c 'gunzip -c /backups/essa_<timestamp>.sql.gz | psql -U essa -d essa'
# (mount the db_backups volume into the db service, or docker cp the file in)
```

### Off-site copies

The `db_backups` volume lives on the same disk as the database — a disk failure loses both. Sync it off-site with the provided host-side script (uses [rclone](https://rclone.org)):

```bash
# one-time: install rclone, then `rclone config` a remote named "offsite"
REMOTE=offsite:essaouira-portal-backups ./scripts/offsite-sync.sh
```

Schedule it hourly/daily via host cron or Windows Task Scheduler. The script exports the dumps from the Docker volume and `rclone sync`s them to your remote (cloud bucket, NAS, or another host).

---

## 5. Database migrations

- The Alembic chain is complete and is the source of truth in production (`RUN_MIGRATIONS=true` runs `alembic upgrade head` in the container entrypoint before uvicorn starts).
- In dev, `AUTO_CREATE_SCHEMA=true` remains the fast path; you can switch dev to migrations by setting `RUN_MIGRATIONS=true, AUTO_CREATE_SCHEMA=false` in `.env`.
- Manual run: `cd apps/server && alembic -c alembic.ini upgrade head`.

---

## 6. Home Assistant connection

Set in `.env` (dev) or `.env.production`:

```
SMART_PROVIDER_MODE=home_assistant
HOME_ASSISTANT_URL=http://host.docker.internal:8123   # or the HA LAN IP
HOME_ASSISTANT_TOKEN=<long-lived token, never committed>
```

Then rebuild the backend: `docker compose up -d --build backend`.

Security: tokens live only in git-ignored `.env*` files. Rotate the HA token if a machine is compromised or disposed.

---

## 7. Troubleshooting

| Symptom | Check |
|---|---|
| Web loads, login fails | `docker compose ps` (backend healthy?), `http://localhost:8081/api/health` |
| Backend exits at startup in production | secrets check failed — read `docker compose logs backend`, set strong `AUTH_SECRET_KEY`/`ADMIN_PASSWORD` |
| Migration errors | `docker compose logs backend` for the alembic output; verify `alembic_version` table vs. `alembic/versions` |
| LAN device can't reach the portal | host firewall rule for `WEB_PORT`; confirm you're using the web URL, not `:8000` |
| HA devices not imported | `HOME_ASSISTANT_INCLUDE_DOMAINS`, `HOME_ASSISTANT_UNIT_HINTS`, token validity |
