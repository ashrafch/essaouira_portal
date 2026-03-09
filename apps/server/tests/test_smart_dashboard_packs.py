import uuid

from fastapi.testclient import TestClient

from app.core.auth import create_access_token
from app.main import app


def _headers(username: str = "owner", role: str = "owner", tenant_id: str = "default"):
    token = create_access_token(username, role=role, tenant_id=tenant_id)
    return {"Authorization": f"Bearer {token}"}


def _new_property(client: TestClient, name_prefix: str = "Property"):
    res = client.post(
        "/properties",
        headers=_headers(),
        json={"name": f"{name_prefix} {uuid.uuid4().hex[:6]}", "timezone": "Africa/Casablanca"},
    )
    assert res.status_code == 200
    return res.json()


def _bind_unit_to_property(client: TestClient, unit_id: int, property_id: int):
    updated = client.put(f"/units/{unit_id}", headers=_headers(), json={"property_id": property_id})
    assert updated.status_code == 200


def test_smart_dashboard_property_filter_and_cards():
    with TestClient(app) as client:
        prop = _new_property(client, "Dash")
        units = client.get("/units", headers=_headers()).json()
        assert units
        unit_id = units[0]["id"]
        _bind_unit_to_property(client, unit_id, prop["id"])

        device_res = client.post(
            "/smart/devices",
            headers=_headers(),
            json={
                "provider": "mock",
                "external_id": f"dash-{uuid.uuid4().hex[:8]}",
                "name": "Dashboard Sensor",
                "category": "leak_sensor",
                "unit_id": unit_id,
            },
        )
        assert device_res.status_code == 200
        device_id = device_res.json()["id"]

        state_res = client.put(
            f"/smart/devices/{device_id}/state",
            headers=_headers(),
            json={"online": False, "signal_rssi": -92, "raw_payload_json": "{\"battery_level\": 8}"},
        )
        assert state_res.status_code == 200

        alert_res = client.post(
            "/smart/alerts",
            headers=_headers(),
            json={
                "unit_id": unit_id,
                "device_id": device_id,
                "alert_type": "leak_detected",
                "severity": "critical",
                "title": "Leak test",
                "description": "testing dashboard cards",
            },
        )
        assert alert_res.status_code == 200

        dash = client.get(f"/smart/dashboard?property_id={prop['id']}", headers=_headers())
        assert dash.status_code == 200
        data = dash.json()
        assert data["kpis"]["total_properties"] >= 1
        assert data["kpis"]["total_units"] >= 1
        assert data["kpis"]["total_devices"] >= 1
        assert data["kpis"]["offline_devices"] >= 1
        assert data["kpis"]["open_alerts"] >= 1
        assert isinstance(data["problematic_units"], list)
        assert isinstance(data["top_device_issues"], list)


def test_scenario_pack_enable_is_idempotent_per_property():
    with TestClient(app) as client:
        prop = _new_property(client, "Pack")
        units = client.get("/units", headers=_headers()).json()
        assert units
        unit_id = units[0]["id"]
        _bind_unit_to_property(client, unit_id, prop["id"])

        first = client.post(
            "/smart/scenario-packs/enable",
            headers=_headers(),
            json={"property_id": prop["id"], "pack_key": "energy_saver_pack"},
        )
        assert first.status_code == 200
        second = client.post(
            "/smart/scenario-packs/enable",
            headers=_headers(),
            json={"property_id": prop["id"], "pack_key": "energy_saver_pack"},
        )
        assert second.status_code == 200
        assert first.json()["id"] == second.json()["id"]

        enabled = client.get(f"/smart/scenario-packs/enabled?property_id={prop['id']}", headers=_headers())
        assert enabled.status_code == 200
        pack_rows = [r for r in enabled.json() if r["pack_key"] == "energy_saver_pack"]
        assert len(pack_rows) == 1

        rules = client.get("/smart/automation-rules", headers=_headers())
        assert rules.status_code == 200
        expected_name = f"[Pack:{prop['code']}] Trigger checkout energy saver"
        matches = [r for r in rules.json() if r["name"] == expected_name]
        assert len(matches) == 1


def test_scenario_pack_routes_security_and_tenant_isolation():
    with TestClient(app) as client:
        defs = client.get("/smart/scenario-packs", headers=_headers())
        assert defs.status_code == 200
        keys = {item["key"] for item in defs.json()}
        assert {"basic_hospitality_pack", "energy_saver_pack", "leak_protection_pack"}.issubset(keys)

        prop = _new_property(client, "Isolation")

        forbidden = client.post(
            "/smart/scenario-packs/enable",
            headers=_headers(role="operator"),
            json={"property_id": prop["id"], "pack_key": "basic_hospitality_pack"},
        )
        assert forbidden.status_code == 403

        ok = client.post(
            "/smart/scenario-packs/enable",
            headers=_headers(role="manager"),
            json={"property_id": prop["id"], "pack_key": "basic_hospitality_pack"},
        )
        assert ok.status_code == 200

        other = client.get("/smart/scenario-packs/enabled", headers=_headers(tenant_id="other"))
        assert other.status_code == 200
        assert other.json() == []
