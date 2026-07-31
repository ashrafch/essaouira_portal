import uuid

from fastapi.testclient import TestClient

from app.core.auth import create_access_token
from app.main import app


def _headers(username: str = "owner", role: str = "owner", tenant_id: str = "default"):
    token = create_access_token(username, role=role, tenant_id=tenant_id)
    return {"Authorization": f"Bearer {token}"}


def _create_unit_name() -> str:
    return f"Wizard Unit {uuid.uuid4().hex[:6]}"


def test_setup_session_lifecycle_and_completion():
    with TestClient(app) as client:
        start = client.post("/setup/start", headers=_headers())
        assert start.status_code == 200
        session = start.json()["session"]
        assert session["status"] == "in_progress"
        assert session["current_step"] in {
            "property",
            "units",
            "connect_provider",
            "import_devices",
            "map_zones",
            "enable_automations",
            "complete",
        }

        step_property = client.post(
            "/setup/property",
            headers=_headers(),
            json={
                "property_name": "Essaouira Villa Smart",
                "timezone": "Africa/Casablanca",
                "currency": "EUR",
            },
        )
        assert step_property.status_code == 200
        assert step_property.json()["current_step"] == "units"

        unit_name = _create_unit_name()
        step_units = client.post("/setup/units", headers=_headers(), json={"units": [unit_name]})
        assert step_units.status_code == 200
        assert step_units.json()["current_step"] == "connect_provider"

        step_provider = client.post(
            "/setup/connect-provider",
            headers=_headers(),
            json={"provider": "mock", "config": {}},
        )
        assert step_provider.status_code == 200
        assert step_provider.json()["current_step"] == "import_devices"

        step_import = client.post("/setup/import-devices", headers=_headers(), json={})
        assert step_import.status_code == 200
        # Zone mapping replaced per-device assignment in the guided flow.
        assert step_import.json()["current_step"] == "map_zones"

        units = client.get("/units", headers=_headers()).json()
        unit_id = next(u["id"] for u in units if u["name"] == unit_name)
        imported_ids = step_import.json()["metadata"]["imported_device_ids"]
        assert len(imported_ids) >= 1

        suggestions = client.get("/setup/zone-suggestions", headers=_headers())
        assert suggestions.status_code == 200, suggestions.text
        payload = suggestions.json()
        assert {u["id"] for u in payload["units"]} >= {unit_id}
        unit_zones = [z for z in payload["zones"] if z["kind"] == "unit"]
        assert unit_zones, payload

        step_map = client.post(
            "/setup/map-zones",
            headers=_headers(),
            json={"zone_map": {unit_zones[0]["zone"]: unit_id}},
        )
        assert step_map.status_code == 200, step_map.text
        assert step_map.json()["current_step"] == "enable_automations"
        result = step_map.json()["metadata"]["zone_map_result"]
        assert result["zones_mapped"] == 1

        step_auto = client.post(
            "/setup/enable-automations",
            headers=_headers(),
            json={"templates": ["basic_hospitality_pack"]},
        )
        assert step_auto.status_code == 200
        assert step_auto.json()["current_step"] == "complete"

        complete = client.post("/setup/complete", headers=_headers())
        assert complete.status_code == 200
        assert complete.json()["status"] == "completed"
        assert complete.json()["completed_at"] is not None


def test_setup_templates_create_automation_rules():
    with TestClient(app) as client:
        client.post("/setup/start", headers=_headers())
        client.post(
            "/setup/property",
            headers=_headers(),
            json={"property_name": "Template Test", "timezone": "Africa/Casablanca", "currency": "EUR"},
        )
        client.post("/setup/units", headers=_headers(), json={"units": [_create_unit_name()]})
        client.post("/setup/connect-provider", headers=_headers(), json={"provider": "mock", "config": {}})
        client.post("/setup/import-devices", headers=_headers(), json={})
        client.post("/setup/map-zones", headers=_headers(), json={"zone_map": {}})
        auto = client.post(
            "/setup/enable-automations",
            headers=_headers(),
            json={"templates": ["energy_saver_pack", "leak_protection_pack"]},
        )
        assert auto.status_code == 200

        rules = client.get("/smart/automation-rules", headers=_headers())
        assert rules.status_code == 200
        names = {r["name"] for r in rules.json()}
        assert any("Trigger checkout energy saver" in name for name in names)
        assert any("Trigger leak maintenance" in name for name in names)


def test_setup_session_tenant_isolation():
    with TestClient(app) as client:
        start_default = client.post("/setup/start", headers=_headers(tenant_id="default"))
        start_other = client.post("/setup/start", headers=_headers(tenant_id="other"))
        assert start_default.status_code == 200
        assert start_other.status_code == 200

        session_default = client.get("/setup/session", headers=_headers(tenant_id="default"))
        session_other = client.get("/setup/session", headers=_headers(tenant_id="other"))
        assert session_default.status_code == 200
        assert session_other.status_code == 200
        assert session_default.json()["tenant_id"] == "default"
        assert session_other.json()["tenant_id"] == "other"


def test_assign_devices_remains_available_as_a_manual_escape_hatch():
    """The guided flow maps zones, but per-device correction must still work."""
    with TestClient(app) as client:
        client.post("/setup/start", headers=_headers())
        client.post(
            "/setup/property",
            headers=_headers(),
            json={"property_name": "Manual Assign", "timezone": "Africa/Casablanca"},
        )
        unit_name = _create_unit_name()
        client.post("/setup/units", headers=_headers(), json={"units": [unit_name]})
        client.post("/setup/connect-provider", headers=_headers(), json={"provider": "mock", "config": {}})
        client.post("/setup/import-devices", headers=_headers(), json={})
        unit_id = next(
            u["id"] for u in client.get("/units", headers=_headers()).json() if u["name"] == unit_name
        )
        # An unbound device: assignment deliberately refuses to steal one that is
        # already attached to another unit.
        free_device_id = next(
            d["id"]
            for d in client.get("/smart/devices", headers=_headers()).json()
            if d["unit_id"] is None
        )

        assigned = client.post(
            "/setup/assign-devices",
            headers=_headers(),
            json={"assignments": [{"device_id": free_device_id, "unit_id": unit_id}]},
        )
        assert assigned.status_code == 200, assigned.text
        assert assigned.json()["current_step"] == "enable_automations"
        assert assigned.json()["metadata"]["assignment_result"]["assigned"] == 1
