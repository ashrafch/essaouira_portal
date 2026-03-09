import uuid

from fastapi.testclient import TestClient

from app.core.auth import create_access_token
from app.main import app


def _headers(username: str = "owner", role: str = "owner", tenant_id: str = "default"):
    token = create_access_token(username, role=role, tenant_id=tenant_id)
    return {"Authorization": f"Bearer {token}"}


def _create_property(client: TestClient, name_prefix: str = "Ops"):
    response = client.post(
        "/properties",
        headers=_headers(),
        json={"name": f"{name_prefix} {uuid.uuid4().hex[:6]}", "timezone": "Africa/Casablanca"},
    )
    assert response.status_code == 200
    return response.json()


def _bind_unit_to_property(client: TestClient, unit_id: int, property_id: int):
    response = client.put(f"/units/{unit_id}", headers=_headers(), json={"property_id": property_id})
    assert response.status_code == 200


def _new_device_for_unit(client: TestClient, unit_id: int):
    response = client.post(
        "/smart/devices",
        headers=_headers(),
        json={
            "provider": "mock",
            "external_id": f"ops-{uuid.uuid4().hex[:8]}",
            "name": "Ops Sensor",
            "category": "leak_sensor",
            "unit_id": unit_id,
        },
    )
    assert response.status_code == 200
    return response.json()


def test_operations_units_needing_attention_logic():
    with TestClient(app) as client:
        prop = _create_property(client, "Ops Attention")
        units = client.get("/units", headers=_headers()).json()
        assert units
        unit_id = units[0]["id"]
        _bind_unit_to_property(client, unit_id, prop["id"])

        device = _new_device_for_unit(client, unit_id)
        state_response = client.put(
            f"/smart/devices/{device['id']}/state",
            headers=_headers(),
            json={"online": False, "signal_rssi": -92, "raw_payload_json": "{\"battery_level\": 9}"},
        )
        assert state_response.status_code == 200

        alert_response = client.post(
            "/smart/alerts",
            headers=_headers(),
            json={
                "unit_id": unit_id,
                "device_id": device["id"],
                "alert_type": "device.offline",
                "severity": "critical",
                "title": "Offline critical",
                "description": "ops attention test",
            },
        )
        assert alert_response.status_code == 200

        operations = client.get(
            f"/smart/operations/units-needing-attention?property_id={prop['id']}",
            headers=_headers(),
        )
        assert operations.status_code == 200
        payload = operations.json()
        assert any(item["unit_id"] == unit_id for item in payload)
        unit_item = next(item for item in payload if item["unit_id"] == unit_id)
        assert unit_item["attention_score"] > 0
        assert unit_item["severity"] in {"critical", "warning"}
        assert unit_item["offline_devices"] >= 1
        assert unit_item["open_alerts"] >= 1


def test_operations_issues_filters():
    with TestClient(app) as client:
        prop = _create_property(client, "Ops Filters")
        units = client.get("/units", headers=_headers()).json()
        unit_id = units[0]["id"]
        _bind_unit_to_property(client, unit_id, prop["id"])
        device = _new_device_for_unit(client, unit_id)

        for severity in ["warning", "critical"]:
            created = client.post(
                "/smart/alerts",
                headers=_headers(),
                json={
                    "unit_id": unit_id,
                    "device_id": device["id"],
                    "alert_type": "custom.alert",
                    "severity": severity,
                    "title": f"Alert {severity}",
                    "description": "filter test",
                },
            )
            assert created.status_code == 200

        issues = client.get(
            "/smart/operations/issues",
            headers=_headers(),
            params={"property_id": prop["id"], "issue_type": "alert.open", "severity": "critical"},
        )
        assert issues.status_code == 200
        rows = issues.json()
        assert rows
        assert all(row["issue_type"] == "alert.open" for row in rows)
        assert all(row["severity"] == "critical" for row in rows)


def test_operations_tenant_isolation_and_viewer_access():
    with TestClient(app) as client:
        prop = _create_property(client, "Ops Isolation")
        units = client.get("/units", headers=_headers()).json()
        unit_id = units[0]["id"]
        _bind_unit_to_property(client, unit_id, prop["id"])
        device = _new_device_for_unit(client, unit_id)
        created = client.post(
            "/smart/alerts",
            headers=_headers(),
            json={
                "unit_id": unit_id,
                "device_id": device["id"],
                "alert_type": "custom.alert",
                "severity": "warning",
                "title": "Visible only default tenant",
                "description": "isolation test",
            },
        )
        assert created.status_code == 200

        viewer_read = client.get("/smart/operations", headers=_headers(role="viewer"))
        assert viewer_read.status_code == 200
        assert "summary" in viewer_read.json()

        isolated = client.get("/smart/operations", headers=_headers(tenant_id="other"))
        assert isolated.status_code == 200
        isolated_payload = isolated.json()
        assert isolated_payload["units_needing_attention"] == []
        assert isolated_payload["issues"] == []
        assert isolated_payload["summary"]["open_alerts"] == 0
