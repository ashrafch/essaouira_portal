import uuid

from fastapi.testclient import TestClient

from app.core.auth import create_access_token
from app.main import app


def _headers(username: str = "owner", role: str = "owner", tenant_id: str = "default"):
    token = create_access_token(username, role=role, tenant_id=tenant_id)
    return {"Authorization": f"Bearer {token}"}


def _create_property(client: TestClient, prefix: str = "Readiness"):
    response = client.post(
        "/properties",
        headers=_headers(),
        json={"name": f"{prefix} {uuid.uuid4().hex[:6]}", "timezone": "Africa/Casablanca"},
    )
    assert response.status_code == 200
    return response.json()


def _bind_unit_to_property(client: TestClient, unit_id: int, property_id: int):
    response = client.put(f"/units/{unit_id}", headers=_headers(), json={"property_id": property_id})
    assert response.status_code == 200


def _create_device(client: TestClient, unit_id: int, category: str = "leak_sensor"):
    response = client.post(
        "/smart/devices",
        headers=_headers(),
        json={
            "provider": "mock",
            "external_id": f"readiness-{uuid.uuid4().hex[:8]}",
            "name": f"Readiness {category}",
            "category": category,
            "unit_id": unit_id,
        },
    )
    assert response.status_code == 200
    return response.json()


def test_readiness_blocked_with_leak_alert_and_critical_device():
    with TestClient(app) as client:
        prop = _create_property(client, "Readiness Blocked")
        unit_id = client.get("/units", headers=_headers()).json()[0]["id"]
        _bind_unit_to_property(client, unit_id, prop["id"])

        device = _create_device(client, unit_id, "leak_sensor")
        updated_state = client.put(
            f"/smart/devices/{device['id']}/state",
            headers=_headers(),
            json={"online": False, "signal_rssi": -91, "raw_payload_json": "{\"battery_level\": 8}"},
        )
        assert updated_state.status_code == 200

        created_alert = client.post(
            "/smart/alerts",
            headers=_headers(),
            json={
                "unit_id": unit_id,
                "device_id": device["id"],
                "alert_type": "leak.detected",
                "severity": "critical",
                "title": "Leak open",
                "description": "Readiness blocked test",
            },
        )
        assert created_alert.status_code == 200

        readiness = client.get(f"/smart/readiness/unit/{unit_id}", headers=_headers())
        assert readiness.status_code == 200
        payload = readiness.json()
        assert payload["readiness_status"] == "BLOCKED"
        assert payload["readiness_score"] <= 40
        assert payload["blocking_reasons"]


def test_readiness_filters_and_dashboard_exposure():
    with TestClient(app) as client:
        prop = _create_property(client, "Readiness Filters")
        units = client.get("/units", headers=_headers()).json()
        unit_ids = [units[0]["id"], units[1]["id"]]
        for unit_id in unit_ids:
            _bind_unit_to_property(client, unit_id, prop["id"])

        device = _create_device(client, unit_ids[0], "motion_sensor")
        online_state = client.put(
            f"/smart/devices/{device['id']}/state",
            headers=_headers(),
            json={"online": True, "motion_detected": False},
        )
        assert online_state.status_code == 200
        create_alert = client.post(
            "/smart/alerts",
            headers=_headers(),
            json={
                "unit_id": unit_ids[0],
                "device_id": device["id"],
                "alert_type": "custom.alert",
                "severity": "warning",
                "title": "Warning alert",
                "description": "Readiness warning test",
            },
        )
        assert create_alert.status_code == 200

        filtered = client.get(
            f"/smart/readiness/property/{prop['id']}",
            headers=_headers(),
        )
        assert filtered.status_code == 200
        rows = filtered.json()
        assert rows
        assert any(row["unit_id"] == unit_ids[0] for row in rows)
        assert all(row["property_id"] == prop["id"] for row in rows)

        dashboard = client.get("/smart/dashboard", headers=_headers(), params={"property_id": prop["id"]})
        assert dashboard.status_code == 200
        dash_payload = dashboard.json()
        assert "readiness_overview" in dash_payload
        assert dash_payload["readiness_overview"]["total_units"] >= 1
        if dash_payload["units_not_ready"]:
            assert any(row["unit_id"] == unit_ids[0] for row in dash_payload["units_not_ready"])


def test_readiness_in_operations_and_unit_detail_and_tenant_isolation():
    with TestClient(app) as client:
        prop = _create_property(client, "Readiness Ops")
        unit_id = client.get("/units", headers=_headers()).json()[0]["id"]
        _bind_unit_to_property(client, unit_id, prop["id"])

        device = _create_device(client, unit_id, "climate_controller")
        alert = client.post(
            "/smart/alerts",
            headers=_headers(),
            json={
                "unit_id": unit_id,
                "device_id": device["id"],
                "alert_type": "custom.alert",
                "severity": "warning",
                "title": "Ops readiness warning",
                "description": "operations integration",
            },
        )
        assert alert.status_code == 200

        operations = client.get("/smart/operations", headers=_headers(), params={"property_id": prop["id"]})
        assert operations.status_code == 200
        ops_payload = operations.json()
        assert ops_payload["units_needing_attention"]
        assert "readiness_status" in ops_payload["units_needing_attention"][0]
        assert "readiness_score" in ops_payload["units_needing_attention"][0]

        unit_detail = client.get(f"/smart/units/{unit_id}", headers=_headers())
        assert unit_detail.status_code == 200
        detail_payload = unit_detail.json()
        assert detail_payload["guest_readiness"]["unit_id"] == unit_id
        assert detail_payload["guest_readiness"]["readiness_status"] in {
            "READY",
            "NEEDS_ATTENTION",
            "BLOCKED",
            "UNKNOWN",
        }

        isolated = client.get("/smart/readiness", headers=_headers(tenant_id="other"))
        assert isolated.status_code == 200
        assert isolated.json() == []
