"""Persistent six-apartment workspace, separate from disposable production QA.

Uses only the standard library. Secrets live in ignored .env.management.json.
Never deletes data, imports QA fixtures, or connects to Home Assistant.
"""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
import secrets
import subprocess
import urllib.error
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
CONFIG_PATH = ROOT / ".env.management.json"
PROJECT = "hostara-management"
UNIT_NAMES = tuple(f"Appartamento A{i}" for i in range(1, 7))
PROPERTY_CODE = "villa-essaouira"
SECRET_KEYS = ("POSTGRES_PASSWORD", "AUTH_SECRET_KEY", "ADMIN_PASSWORD")


def load_config(path: Path, *, create: bool) -> dict[str, str]:
    if not path.exists():
        if not create:
            raise ValueError("Start the management workspace first.")
        config = {key: secrets.token_urlsafe(36) for key in SECRET_KEYS}
        config.update(WEB_PORT="8081", ADMIN_USERNAME="owner")
        # Exclusive creation: a second launcher must never rotate persisted secrets.
        with path.open("x", encoding="utf-8") as stream:
            os.chmod(path, 0o600)
            json.dump(config, stream, indent=2)
            stream.write("\n")
    config = json.loads(path.read_text(encoding="utf-8"))
    allowed = {*SECRET_KEYS, "WEB_PORT", "ADMIN_USERNAME"}
    if not isinstance(config, dict) or set(config) != allowed:
        raise ValueError("Unexpected management configuration keys; see DEPLOYMENT.md.")
    if not all(isinstance(value, str) and value for value in config.values()):
        raise ValueError("Management configuration values must be nonempty strings.")
    if not config["WEB_PORT"].isdigit() or not 1024 <= int(config["WEB_PORT"]) <= 65535:
        raise ValueError("WEB_PORT must be between 1024 and 65535.")
    if config["ADMIN_USERNAME"] == "verifier":
        raise ValueError("The QA verifier identity cannot be used for management.")
    if any(len(config[key]) < 32 for key in SECRET_KEYS):
        raise ValueError("Management secrets must contain at least 32 characters.")
    return config


def compose_environment(config: dict[str, str]) -> dict[str, str]:
    env = {key: value for key, value in os.environ.items() if not key.startswith("COMPOSE_")}
    env.update(config)
    env.update(
        POSTGRES_DB="management", POSTGRES_USER="management",
        WEB_BIND_ADDRESS="127.0.0.1", APP_ENV="production",
        CORS_ORIGINS=f"http://127.0.0.1:{config['WEB_PORT']},http://localhost:{config['WEB_PORT']}",
        SMART_PROVIDER_MODE="mock", SMART_POLL_INTERVAL_SECONDS="0",
        HOME_ASSISTANT_URL="", HOME_ASSISTANT_TOKEN="", HOME_ASSISTANT_UNIT_HINTS="{}",
        HOME_ASSISTANT_INCLUDE_DOMAINS="", SMART_INGEST_TOKEN="",
        VILLACORE_SITE_ID="management-unlinked",
    )
    return env


def initialize_inventory(api) -> None:
    """Use existing owner APIs; refuse foreign data instead of hiding/deleting it."""
    units = api("/units")
    properties = api("/properties")
    if len(properties) != 1 or properties[0]["code"] not in {"default-property", PROPERTY_CODE}:
        raise ValueError("Unexpected properties: initialization stopped without deleting data.")
    prop = properties[0]
    names = [unit["name"] for unit in units]
    if (len(names) != len(set(names)) or not set(names).issubset(UNIT_NAMES)
            or any(unit["property_id"] != prop["id"] for unit in units)):
        raise ValueError("Existing inventory differs from A1-A6; initialization refused.")
    if prop["code"] == "default-property":
        if units:
            raise ValueError("Default property already has units; initialization refused.")
        api(f"/properties/{prop['id']}", {
            "name": "Villa Essaouira", "code": PROPERTY_CODE, "timezone": "Africa/Casablanca",
        }, method="PUT")
    missing = [name for name in UNIT_NAMES if name not in names]
    if missing:
        api("/setup/start", {})
        api("/setup/units", {"property_id": prop["id"], "units": missing})
    actual = api("/units")
    if (len(actual) != 6 or {unit["name"] for unit in actual} != set(UNIT_NAMES)
            or any(unit["property_id"] != prop["id"] for unit in actual)):
        raise ValueError("Unexpected inventory after initialization; inspect before proceeding.")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=("start", "stop", "status"), nargs="?", default="start")
    parser.add_argument("--initialize", action="store_true", help="Create A1-A6 through owner APIs, idempotently")
    parser.add_argument("--no-build", action="store_true", help="Reuse this project's existing images")
    args = parser.parse_args()
    if args.initialize and args.action != "start":
        parser.error("--initialize requires start")
    config = load_config(CONFIG_PATH, create=args.action == "start")
    env = compose_environment(config)
    compose = ["docker", "compose", "--project-name", PROJECT, "--env-file", ".env.example",
               "-f", "docker-compose.yml", "-f", "docker-compose.prod.yml"]

    def run(*command: str) -> str:
        result = subprocess.run(command, cwd=ROOT, env=env, capture_output=True,
                                text=True, encoding="utf-8", errors="replace")
        if result.returncode:
            detail = (result.stdout + result.stderr)[-5000:]
            for key in SECRET_KEYS:
                detail = detail.replace(config[key], "[redacted]")
            raise RuntimeError(detail)
        return result.stdout

    model = json.loads(run(*compose, "config", "--format", "json"))
    services = model["services"]
    if (model["name"] != PROJECT or services["db"].get("ports") or services["backend"].get("ports")
            or services["web"]["ports"][0]["host_ip"] != "127.0.0.1"
            or services["backend"]["environment"]["AUTO_SEED_DATA"] != "false"
            or services["backend"]["environment"]["SMART_PROVIDER_MODE"] != "mock"):
        raise RuntimeError("Management isolation checks failed; no services changed.")
    if args.action == "stop":
        run(*compose, "stop")
        print("Management stopped. Database and backups preserved.")
        return
    if args.action == "status":
        print(run(*compose, "ps"))
        return

    print(f"Starting {PROJECT}: migrations, private database and scheduled backups...", flush=True)
    build = [] if args.no_build else ["--build"]
    run(*compose, "up", "-d", *build, "--wait", "--wait-timeout", "180", "db", "backend", "web", "db-backup")
    base = f"http://127.0.0.1:{config['WEB_PORT']}"
    token = ""

    def api(path, body=None, *, method=None):
        headers = {"Content-Type": "application/json"}
        if token:
            headers["Authorization"] = "Bearer " + token
        request = urllib.request.Request(base + "/api" + path,
            data=json.dumps(body).encode() if body is not None else None, headers=headers, method=method)
        with urllib.request.urlopen(request, timeout=30) as response:
            return json.load(response)

    if api("/health").get("status") != "ok":
        raise RuntimeError("API health check failed.")
    if args.initialize:
        token = api("/auth/login", {"username": config["ADMIN_USERNAME"],
            "password": config["ADMIN_PASSWORD"], "tenant_id": "default"})["access_token"]
        initialize_inventory(api)
        print("Inventory verified: one property, exactly six apartments A1-A6.")
    print(f"Management: {base}")
    print(f"Login: {config['ADMIN_USERNAME']} / ADMIN_PASSWORD in {CONFIG_PATH.name}; tenant default.")
    print("Home Assistant is NOT connected. QA data has NOT been imported.")
    if not args.initialize:
        print("First use only: run start --initialize to create the six apartments.")


if __name__ == "__main__":
    try:
        main()
    except (ValueError, OSError, RuntimeError, urllib.error.URLError) as error:
        raise SystemExit(str(error)) from None
