"""Read-only live link verification: never sends commands or mutates HA/PMS data."""

import argparse
import json
from pathlib import Path
import secrets
import sys

from dotenv import dotenv_values
import yaml

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "apps" / "server"))
from app.domains.smart_building.providers.villacore import VillaCoreProvider  # noqa: E402


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--env-file", type=Path, default=ROOT / ".env")
    parser.add_argument("--ha-url", required=True, help="Reachable URL from this host, not Docker DNS")
    parser.add_argument("--ha-secrets", type=Path, help="Optional local HA secrets.yaml to compare ingest credentials")
    args = parser.parse_args()
    values = dotenv_values(args.env_file)
    token = values.get("HOME_ASSISTANT_TOKEN")
    if not token:
        raise SystemExit("FAIL: HOME_ASSISTANT_TOKEN missing (value not logged)")
    provider = VillaCoreProvider(base_url=args.ha_url, token=token)
    status = provider.describe_link()
    report = {name: getattr(status, name) for name in (
        "reachable", "authenticated", "manifest_present", "contract_version",
        "entity_count", "importable_count", "excluded_count",
    )}
    report["unclassified_count"] = len(status.unclassified)
    report["zones_count"] = len(status.zones)
    ok = status.reachable and status.authenticated and status.manifest_present
    ok = ok and not status.unclassified and status.contract_version == "villacore.link.v1"
    if args.ha_secrets:
        ha_values = yaml.safe_load(args.ha_secrets.read_text(encoding="utf-8"))
        inbound = values.get("SMART_INGEST_TOKEN") or ""
        outbound = str(ha_values.get("portal_ingest_token") or "")
        report["ingest_secrets_match"] = bool(inbound and outbound) and secrets.compare_digest(inbound, outbound)
        ok = ok and report["ingest_secrets_match"]
    print(json.dumps(report, indent=2))
    print("Read-only check; does not certify delivery, execution, rotation or physical commissioning.")
    if not ok:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
