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
        assert session["current_step"] == "property"

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
        assert step_import.json()["current_step"] == "assign_devices"

        units = client.get("/units", headers=_headers()).json()
        unit_id = next(u["id"] for u in units if u["name"] == unit_name)
        imported_ids = step_import.json()["metadata"]["imported_device_ids"]
        assert len(imported_ids) >= 1
        step_assign = client.post(
            "/setup/assign-devices",
            headers=_headers(),
            json={"assignments": [{"device_id": imported_ids[0], "unit_id": unit_id}]},
        )
        assert step_assign.status_code == 200
        assert step_assign.json()["current_step"] == "enable_automations"

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
        client.post("/setup/assign-devices", headers=_headers(), json={"assignments": []})
        auto = client.post(
            "/setup/enable-automations",
            headers=_headers(),
            json={"templates": ["energy_saver_pack", "leak_protection_pack"]},
        )
        assert auto.status_code == 200

        rules = client.get("/smart/automation-rules", headers=_headers())
        assert rules.status_code == 200
        names = {r["name"] for r in rules.json()}
        assert "[Setup] Trigger checkout energy saver" in names
        assert "[Setup] Trigger leak maintenance" in names


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
