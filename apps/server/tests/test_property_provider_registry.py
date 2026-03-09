import uuid

from fastapi.testclient import TestClient

from app.core.auth import create_access_token
from app.main import app


def _headers(username: str = "owner", role: str = "owner", tenant_id: str = "default"):
    token = create_access_token(username, role=role, tenant_id=tenant_id)
    return {"Authorization": f"Bearer {token}"}


def _property_name(prefix: str) -> str:
    return f"{prefix} {uuid.uuid4().hex[:6]}"


def test_properties_crud_and_tenant_isolation():
    with TestClient(app) as client:
        created = client.post(
            "/properties",
            headers=_headers(),
            json={"name": _property_name("Riad"), "timezone": "Africa/Casablanca"},
        )
        assert created.status_code == 200
        prop = created.json()
        assert prop["tenant_id"] == "default"

        listed = client.get("/properties", headers=_headers())
        assert listed.status_code == 200
        assert any(item["id"] == prop["id"] for item in listed.json())

        forbidden = client.post(
            "/properties",
            headers=_headers(role="manager"),
            json={"name": _property_name("NoOwner")},
        )
        assert forbidden.status_code == 403

        hidden = client.get(f"/properties/{prop['id']}", headers=_headers(tenant_id="other"))
        assert hidden.status_code == 404


def test_provider_connection_persistence_and_filter():
    with TestClient(app) as client:
        prop_res = client.post(
            "/properties",
            headers=_headers(),
            json={"name": _property_name("Villa"), "timezone": "Africa/Casablanca"},
        )
        assert prop_res.status_code == 200
        prop_id = prop_res.json()["id"]

        created = client.post(
            "/smart/provider-connections",
            headers=_headers(),
            json={
                "property_id": prop_id,
                "provider_name": "mock",
                "status": "connected",
                "config": {"base_url": "http://example.local"},
            },
        )
        assert created.status_code == 200
        connection = created.json()
        assert connection["property_id"] == prop_id
        assert connection["provider_name"] == "mock"

        filtered = client.get(
            f"/smart/provider-connections?property_id={prop_id}",
            headers=_headers(),
        )
        assert filtered.status_code == 200
        assert any(item["id"] == connection["id"] for item in filtered.json())

        other_tenant = client.get("/smart/provider-connections", headers=_headers(tenant_id="other"))
        assert other_tenant.status_code == 200
        assert all(item["tenant_id"] == "other" for item in other_tenant.json())


def test_setup_wizard_persists_property_provider_and_units_binding():
    with TestClient(app) as client:
        started = client.post("/setup/start", headers=_headers())
        assert started.status_code == 200

        prop_name = _property_name("Wizard Property")
        step_property = client.post(
            "/setup/property",
            headers=_headers(),
            json={"property_name": prop_name, "timezone": "Africa/Casablanca", "currency": "EUR"},
        )
        assert step_property.status_code == 200
        property_id = step_property.json()["metadata"]["property_id"]
        assert isinstance(property_id, int)

        unit_name = _property_name("Wizard Unit")
        step_units = client.post(
            "/setup/units",
            headers=_headers(),
            json={"property_id": property_id, "units": [unit_name]},
        )
        assert step_units.status_code == 200

        units = client.get("/units", headers=_headers()).json()
        target_unit = next((u for u in units if u["name"] == unit_name), None)
        assert target_unit is not None
        assert target_unit["property_id"] == property_id

        step_provider = client.post(
            "/setup/connect-provider",
            headers=_headers(),
            json={"property_id": property_id, "provider": "mock", "config": {}},
        )
        assert step_provider.status_code == 200
        connection_id = step_provider.json()["metadata"]["provider_connection_id"]
        assert isinstance(connection_id, int)

        fetched = client.get(f"/smart/provider-connections/{connection_id}", headers=_headers())
        assert fetched.status_code == 200
        assert fetched.json()["property_id"] == property_id


def test_device_health_can_be_filtered_by_property():
    with TestClient(app) as client:
        prop1 = client.post(
            "/properties",
            headers=_headers(),
            json={"name": _property_name("P1"), "timezone": "Africa/Casablanca"},
        ).json()
        prop2 = client.post(
            "/properties",
            headers=_headers(),
            json={"name": _property_name("P2"), "timezone": "Africa/Casablanca"},
        ).json()

        units = client.get("/units", headers=_headers())
        assert units.status_code == 200
        unit_payload = units.json()
        assert len(unit_payload) >= 2
        unit1 = unit_payload[0]
        unit2 = unit_payload[1]

        bind1 = client.put(
            f"/units/{unit1['id']}",
            headers=_headers(),
            json={"property_id": prop1["id"]},
        )
        assert bind1.status_code == 200
        bind2 = client.put(
            f"/units/{unit2['id']}",
            headers=_headers(),
            json={"property_id": prop2["id"]},
        )
        assert bind2.status_code == 200

        d1 = client.post(
            "/smart/devices",
            headers=_headers(),
            json={
                "provider": "mock",
                "external_id": f"p1-{uuid.uuid4().hex[:8]}",
                "name": "P1 Device",
                "category": "smart_relay",
                "unit_id": unit1["id"],
            },
        )
        assert d1.status_code == 200

        d2 = client.post(
            "/smart/devices",
            headers=_headers(),
            json={
                "provider": "mock",
                "external_id": f"p2-{uuid.uuid4().hex[:8]}",
                "name": "P2 Device",
                "category": "smart_relay",
                "unit_id": unit2["id"],
            },
        )
        assert d2.status_code == 200

        filtered = client.get(f"/smart/device-health?property_id={prop1['id']}", headers=_headers())
        assert filtered.status_code == 200
        payload = filtered.json()
        assert payload["devices"]
        assert all(item["property_id"] == prop1["id"] for item in payload["devices"])
