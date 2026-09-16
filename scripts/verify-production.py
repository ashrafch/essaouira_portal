"""Verify production on disposable Compose resources, never the site's database.

Requires Docker Compose >= 2.24.4. Uses the checked-in example, synthetic secrets,
mock smart provider, private random HTTP port, and a unique project/volume namespace.
"""

from __future__ import annotations

import argparse
from concurrent.futures import ThreadPoolExecutor
import json
import os
from pathlib import Path
import secrets
import socket
import subprocess
from threading import Barrier
import urllib.error
import urllib.request

ROOT = Path(__file__).resolve().parents[1]


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--config-only", action="store_true")
    parser.add_argument("--no-build", action="store_true")
    parser.add_argument("--keep", action="store_true", help="Keep isolated stack for manual QA")
    parser.add_argument("--browser", action="store_true", help="Also run installed Playwright suite")
    args = parser.parse_args()
    project = "portal-verify-" + secrets.token_hex(4)
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        port = sock.getsockname()[1]
    env = os.environ.copy()
    env.update(
        POSTGRES_USER="verifier", POSTGRES_DB="verification",
        POSTGRES_PASSWORD=secrets.token_urlsafe(32),
        AUTH_SECRET_KEY=secrets.token_urlsafe(48), ADMIN_USERNAME="verifier",
        # Synthetic credentials only, bound to loopback on an isolated empty DB.
        ADMIN_PASSWORD="Verification-only-local-password-2026",
        ADMIN_TENANT_ID="default", WEB_BIND_ADDRESS="127.0.0.1", WEB_PORT=str(port),
        SMART_PROVIDER_MODE="mock", SMART_POLL_INTERVAL_SECONDS="0",
        SMART_INGEST_TOKEN="", HOME_ASSISTANT_URL="", HOME_ASSISTANT_TOKEN="",
        VILLACORE_SITE_ID="verification", COMPOSE_PROFILES="",
    )
    compose = ["docker", "compose", "--project-name", project, "--env-file", ".env.example",
               "-f", "docker-compose.yml", "-f", "docker-compose.prod.yml"]

    def run(*command: str, check: bool = True) -> subprocess.CompletedProcess[str]:
        result = subprocess.run(command, cwd=ROOT, env=env, capture_output=True, text=True, encoding="utf-8", errors="replace")
        if check and result.returncode:
            # Logs from our isolated environment only; mask even synthetic secrets.
            detail = (result.stdout + result.stderr)[-7000:]
            for key in ("POSTGRES_PASSWORD", "AUTH_SECRET_KEY", "ADMIN_PASSWORD"):
                detail = detail.replace(env[key], "[redacted]")
            raise RuntimeError(f"Command failed ({result.returncode}): {detail}")
        return result

    config = json.loads(run(*compose, "config", "--format", "json").stdout)
    services = config["services"]
    assert not services["db"].get("ports"), "Database exposed in production"
    assert not services["backend"].get("ports"), "API exposed in production"
    assert len(services["web"]["ports"]) == 1, "Development port inherited"
    assert services["web"]["ports"][0]["host_ip"] == "127.0.0.1"
    assert not services["db-backup"].get("profiles"), "Production backups disabled"
    assert services["backend"]["environment"]["AUTO_CREATE_SCHEMA"] == "false"
    assert services["backend"]["environment"]["AUTO_SEED_DATA"] == "false"
    print("PASS production configuration: no DB/API ports, single private web port, backups enabled", flush=True)
    if args.config_only:
        return

    started = False
    token = ""

    def api(path: str, body: dict | None = None):
        headers = {"Content-Type": "application/json"}
        if token:
            headers["Authorization"] = "Bearer " + token
        request = urllib.request.Request(
            f"http://127.0.0.1:{port}/api{path}",
            data=json.dumps(body).encode() if body is not None else None, headers=headers,
        )
        with urllib.request.urlopen(request, timeout=30) as response:
            return json.load(response)

    try:
        started = True
        build = [] if args.no_build else ["--build"]
        run(*compose, "up", "-d", *build, "--wait", "--wait-timeout", "180", "db", "backend", "web")
        print("PASS empty PostgreSQL migration and application startup", flush=True)
        assert api("/health")["status"] == "ok"
        token = api("/auth/login", {"username": env["ADMIN_USERNAME"],
                    "password": env["ADMIN_PASSWORD"], "tenant_id": "default"})["access_token"]
        for path in ("/units", "/bookings", "/staff-tasks", "/maintenance", "/dashboard/summary",
                     "/smart/devices", "/analytics/report/monthly?year=2026&month=9"):
            api(path)
        assert api("/units") == [], "Demo data seeded in production"
        print("PASS authenticated production API reads and no demo units", flush=True)

        property_row = api("/properties", {"name": "Concurrency QA", "code": project})
        api("/setup/start", {})
        api("/setup/units", {"property_id": property_row["id"], "units": ["Concurrency QA"]})
        unit = next(row for row in api("/units") if row["name"] == "Concurrency QA")
        rendezvous = Barrier(2)

        def competing_booking(number: int) -> int:
            rendezvous.wait(timeout=15)
            try:
                api("/bookings", {"unit_id": unit["id"], "guest_name": f"QA {number}",
                    "checkin_date": "2038-01-01", "checkout_date": "2038-01-03"})
                return 200
            except urllib.error.HTTPError as error:
                return error.code

        with ThreadPoolExecutor(max_workers=2) as pool:
            statuses = sorted(pool.map(competing_booking, (1, 2)))
        assert statuses == [200, 400], f"Concurrent booking conflict not protected: {statuses}"
        assert len(api("/bookings")) == 1
        print("PASS concurrent PostgreSQL booking requests: one accepted, one conflict", flush=True)

        run(*compose, "exec", "-T", "db", "psql", "-U", "verifier", "-d", "verification",
            "-v", "ON_ERROR_STOP=1", "-c", "CREATE TABLE restore_probe (id integer PRIMARY KEY); INSERT INTO restore_probe VALUES (42);")
        run(*compose, "run", "--rm", "-e", "BACKUP_ONCE=true", "db-backup")
        run(*compose, "exec", "-T", "db", "createdb", "-U", "verifier", "restore_verification")
        run(*compose, "run", "--rm", "--entrypoint", "sh", "db-backup", "-ec",
            'export PGPASSWORD="$POSTGRES_PASSWORD"; for f in /backups/portal_*.dump; do pg_restore --exit-on-error --no-owner -h db -U verifier -d restore_verification "$f"; break; done')
        value = run(*compose, "exec", "-T", "db", "psql", "-U", "verifier", "-d", "restore_verification",
                    "-Atc", "SELECT id FROM restore_probe").stdout.strip()
        assert value == "42", "Restored database does not match source"
        print("PASS PostgreSQL backup and restore, including persisted data", flush=True)
        failed = run(*compose, "run", "--rm", "-e", "BACKUP_ONCE=true", "-e", "POSTGRES_DB=missing_database",
                     "db-backup", check=False)
        assert failed.returncode != 0, "Failed dump reported success"
        leftovers = run(*compose, "run", "--rm", "--entrypoint", "sh", "db-backup", "-ec",
                        "find /backups -name '*.partial'").stdout.strip()
        assert not leftovers, "Failed backup left partial archives"
        print("PASS failed dump is rejected and partial output removed", flush=True)
        if args.browser:
            env.update(E2E_DISPOSABLE="true", E2E_BASE_URL=f"http://127.0.0.1:{port}")
            result = run("npm.cmd" if os.name == "nt" else "npm", "--prefix", "apps/web", "run", "test:e2e")
            print(result.stdout, flush=True)
        if args.keep:
            print(f"QA stack retained: http://127.0.0.1:{port} (synthetic verifier account)")
            print(f"Cleanup: docker compose -p {project} down -v")
    finally:
        if started and not args.keep:
            run(*compose, "down", "--volumes", "--remove-orphans")
        elif started:
            print(f"Isolated QA project: {project}; URL http://127.0.0.1:{port}", flush=True)


if __name__ == "__main__":
    main()
