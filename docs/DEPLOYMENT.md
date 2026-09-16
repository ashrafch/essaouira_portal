# Deployment Guide

How to run Essaouira Portal in each supported mode:

1. **Local development** — on your machine, demo data, weak dev credentials allowed.
2. **LAN publication** — reachable by phones/tablets/PCs on the same network (villa/property local server). No internet exposure required.
3. **Production / product** — hardened stack for a real deployment (VPS, on-prem server, or the property's local server acting as production).

All modes use the same images and the same `docker-compose.yml`; overlays and env files change the behavior.

Requires Docker Compose **2.24.4+** (`!reset` / `!override` support). Verify
`docker version` and `docker compose version` with Docker Desktop running.
Production currently supports **one owner installation, tenant `default`**.
Legacy PMS tables are not tenant-isolated: do not host independent customers in
one database. Route visibility does not imply field-level financial privacy.
See [RELEASE_VERIFICATION.md](RELEASE_VERIFICATION.md) for evidence and remaining gates.

---

## 1. Local development

```bash
copy .env.example .env        # only if absent; never overwrite existing secrets
docker compose up --build -d --wait
docker compose ps
```

- Frontend: http://localhost:8081
- API through the proxy: http://localhost:8081/api/health
- API direct (loopback only): http://localhost:8000/health
- Default login: `owner / owner123`, tenant `default`

Dev behavior: schema auto-created (`AUTO_CREATE_SCHEMA=true`), demo data seeded (`AUTO_SEED_DATA=true`), DB and API ports bound to `127.0.0.1` only.

Stop with `docker compose down`; this preserves the database. Never use `down -v`
on data you need: it deletes volumes. Keep the same project name/env/overlays.

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
- For a long-running property server, use the production overlay (section 3),
  including on LAN. Set `WEB_BIND_ADDRESS` to the server's management-LAN IP;
  production defaults to loopback, unlike development. Use HTTPS with a trusted
  certificate for real guest data and credentials. Do not use the guest Wi-Fi or
  forward ports on the Internet router.

---

## 3. Production / product deployment

```bash
copy .env.production.example .env.production
# fill POSTGRES_PASSWORD, AUTH_SECRET_KEY, ADMIN_PASSWORD (long random values)

docker compose --env-file .env.production -f docker-compose.yml -f docker-compose.prod.yml up -d --build --wait
```

What the production overlay enforces:

| Aspect | Dev | Production |
|---|---|---|
| Weak secrets | allowed | **startup fails** (`APP_ENV=production` check) |
| Schema | `create_all` at startup | **Alembic migrations** (`RUN_MIGRATIONS=true`) |
| Demo data | seeded | never seeded |
| DB/API host ports | loopback | **none** (web proxy is the only entry point) |
| Restart policy | none | `unless-stopped` |
| Web binding | all interfaces | `WEB_BIND_ADDRESS=127.0.0.1` by default |
| Database backups | optional ops profile | automatically enabled |

The first owner account is created even with demo seeding disabled. Existing
users/passwords/disabled accounts are never overwritten from env. Keep
`ADMIN_TENANT_ID=default`. Changing `ADMIN_PASSWORD` does not reset an existing user.

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

Before updating, record the commit and Alembic revision, take a backup and verify
a restore into a separate database. Migrations run at backend startup. Migration
0016 rejects orphan `property_id` references: repair data deliberately, never
disable the constraint. Code rollback alone may not undo a schema migration.

---

## 4. Backups and monitoring (ops profile)

```bash
docker compose --profile ops up -d
```

- **db-backup**: custom PostgreSQL `portal_<UTC>_<pid>.dump` archives every
  `BACKUP_INTERVAL_HOURS` (default 24h), local retention `BACKUP_RETENTION_DAYS`
  (default 7). Automatically active in production, optional in dev. Writes to
  `.partial`, validates the archive catalog, then renames atomically. A failed
  dump fails the container and never prunes prior backups. Legacy `.sql.gz`
  files are retained until a deliberate migration/retention decision.
- **Prometheus**: http://localhost:9090 (scrapes backend `/metrics`).
- **Grafana**: http://localhost:3001 (`GRAFANA_PORT`, `GRAFANA_ADMIN_USER`/`GRAFANA_ADMIN_PASSWORD`). Defaults to 3001 because VillaCore's own Grafana owns 3000 on a shared host.

Restore a backup into a **separate empty database** first. Export the completed
dump from the backup volume using a temporary read-only mount and copy it into
the database container with `docker cp`. The DB does not mount backups by default.
Run inside that container (substitute actual username/database/archive):

```bash
pg_restore --exit-on-error --no-owner --no-privileges -U <user> -d <empty-database> /tmp/backup.dump
```

### Off-site copies

The `db_backups` volume lives on the same disk as the database — a disk failure loses both. Sync it off-site with the provided host-side script (uses [rclone](https://rclone.org)):

```bash
# one-time: install rclone, then `rclone config` a remote named "offsite"
REMOTE=offsite:essaouira-portal-backups ./scripts/offsite-sync.sh
```

Run the POSIX script on Linux/WSL with access to the same Docker Engine. Set
`BACKUP_VOLUME` to the actual volume name from `docker volume ls`. Schedule via
cron or Task Scheduler with WSL and monitor exit codes. The script uses
`rclone copy`, **never remote deletion**, and rejects missing/failed exports.
Configure encryption (for example rclone crypt), remote retention/versioning
and an immutable copy separately. Local dumps are not encrypted. Archive catalog
validation is not a full restore; regularly rehearse recovery including keys.

---

## 5. Database migrations

- The Alembic chain is complete and is the source of truth in production (`RUN_MIGRATIONS=true` runs `alembic upgrade head` in the container entrypoint before uvicorn starts).
- In dev, `AUTO_CREATE_SCHEMA=true` remains the fast path; you can switch dev to migrations by setting `RUN_MIGRATIONS=true, AUTO_CREATE_SCHEMA=false` in `.env`.
- Manual run: `cd apps/server && alembic -c alembic.ini upgrade head`.

---

## 6. Home Assistant connection

### 6a. VillaCore (recommended): shared Docker network

The VillaCore building platform runs its own stack. The portal joins it on a
shared network and reaches Home Assistant by service name — no host IP, no
published HA port, identical in dev and on Proxmox.

```bash
scripts/link-villacore.ps1            # Windows  (add -Token "<token>" to validate auth)
scripts/link-villacore.sh             # Linux/WSL
```

The script creates the `villacore_link` network, attaches the VillaCore Home
Assistant container with the alias `home-assistant`, and verifies reachability
from inside the network. It is idempotent and never restarts a container.

Create the Home Assistant token without leaving the terminal (the password is
read interactively, never stored or echoed; only the token is written):

```bash
python scripts/get_villacore_token.py                    # writes HOME_ASSISTANT_TOKEN into .env
python scripts/get_villacore_token.py --also-server-env  # also apps/server/.env
```

Then in `.env` / `.env.production`:

```ini
SMART_PROVIDER_MODE=villacore
HOME_ASSISTANT_URL=http://home-assistant:8123
HOME_ASSISTANT_TOKEN=<long-lived token, never committed>
SMART_INGEST_TOKEN=<shared secret, must match VillaCore's secrets.yaml>
SMART_POLL_INTERVAL_SECONDS=300
```

Start with the link overlay:

```bash
docker compose -f docker-compose.yml -f docker-compose.villacore.yml up -d --build
```

For production, keep **both** overlays:

```powershell
docker compose --env-file .env.production -f docker-compose.yml -f docker-compose.prod.yml -f docker-compose.villacore.yml up -d --build --wait
```

An accepted `script.turn_on` request is asynchronous, not proof of physical
completion. Confirm events/state with the correlation ID. Refusals remain errors.
The two repositories, databases and backups stay independent.

Read-only verification from the workstation (use the actual published HA port):

```powershell
.\apps\server\venv\Scripts\python.exe scripts/check-villacore-readonly.py --ha-url http://127.0.0.1:18123 --ha-secrets ../VillaCore/home-assistant/secrets.yaml
```

This authenticates and inspects the catalog without actuation or printing secrets.
It does not prove event delivery, token rotation, or physical commissioning.

Verify on the **Link VillaCore** page (owner only) or via
`GET /smart/link/status`. Full contract: [VILLACORE_LINK.md](VILLACORE_LINK.md).

This shared-network setup assumes Home Assistant runs as a container. On
VillaCore's Proxmox target Home Assistant is an OS VM, so there is no network to
share: the portal points at the HAOS address and HAOS posts events through the
portal's nginx proxy. Both topologies are laid out in
[VILLACORE_LINK.md](VILLACORE_LINK.md) section 7.

Note: the runtime network attachment is lost if the VillaCore container is
recreated — prompt **P1** in [VILLACORE_PROMPTS.md](VILLACORE_PROMPTS.md) makes it
permanent on the VillaCore side.

Port collisions on a host running both stacks: VillaCore's `mock-api` must move
off `8000` (P1) and the portal's ops Grafana now defaults to `3001` since
VillaCore's owns `3000`.

### 6b. Generic Home Assistant

For an instance that is not VillaCore:

```ini
SMART_PROVIDER_MODE=home_assistant
HOME_ASSISTANT_URL=http://host.docker.internal:8123   # or the HA LAN IP
HOME_ASSISTANT_TOKEN=<long-lived token, never committed>
```

Then rebuild the backend: `docker compose up -d --build backend`.

Security: tokens live only in git-ignored `.env*` files. Rotate the HA token and
`SMART_INGEST_TOKEN` if a machine is compromised or disposed.

---

## 7. Troubleshooting

| Symptom | Check |
|---|---|
| Web loads, login fails | `docker compose ps` (backend healthy?), `http://localhost:8081/api/health` |
| Backend exits at startup in production | secrets check failed — read `docker compose logs backend`, set strong `AUTH_SECRET_KEY`/`ADMIN_PASSWORD` |
| Migration errors | `docker compose logs backend` for the alembic output; verify `alembic_version` table vs. `alembic/versions` |
| LAN device can't reach the portal | host firewall rule for `WEB_PORT`; confirm you're using the web URL, not `:8000` |
| HA devices not imported | `HOME_ASSISTANT_INCLUDE_DOMAINS`, `HOME_ASSISTANT_UNIT_HINTS`, token validity |
