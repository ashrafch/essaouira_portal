"""End-to-end coverage of the VillaCore Link over a faked Home Assistant.

The fake below answers like the real VillaCore instance: units with workflow
scripts, a pool with a state machine, site metering. It records every service
call, which is how these tests prove the portal dispatches
``script.turn_on`` with booking variables instead of poking entities directly.
"""

import os
from unittest.mock import patch

from fastapi.testclient import TestClient

from app.core.auth import create_access_token
from app.main import app


def _headers(username: str = "owner", role: str = "owner", tenant_id: str = "default"):
    token = create_access_token(username, role=role, tenant_id=tenant_id)
    return {"Authorization": f"Bearer {token}"}


def _entity(entity_id: str, state: str, **attributes):
    return {
        "entity_id": entity_id,
        "state": state,
        "attributes": {"friendly_name": entity_id, **attributes},
        "last_changed": "2026-07-31T09:00:00+00:00",
    }


def _villacore_states():
    return [
        # --- unit a1 (mapped to "Unit A" through the zone map) ---
        _entity("script.a1_check_in", "off"),
        _entity("script.a1_check_out", "off"),
        _entity("script.a1_mark_ready", "off"),
        _entity("input_select.a1_stay_status", "Libero", options=["Libero", "Occupato", "Pulizia"]),
        _entity("input_boolean.a1_core_guest_mode", "off"),
        _entity("binary_sensor.a1_devices_available", "on", device_class="connectivity"),
        _entity("sensor.a1_living_temperature", "21.5", device_class="temperature", unit_of_measurement="°C"),
        _entity("light.a1_living_kitchen_main", "off"),
        # --- pool plant ---
        _entity("sensor.pool_filtration_state", "idle"),
        _entity("input_select.pool_filtration_mode", "Automatico"),
        _entity("binary_sensor.pool_alarm_active", "off"),
        _entity("binary_sensor.pool_devices_available", "on", device_class="connectivity"),
        _entity("binary_sensor.pool_thermal_trip", "off"),
        _entity("script.pool_filtration_safe_off", "off"),
        _entity("script.pool_alarm_reset", "off"),
        _entity("sensor.pool_water_temperature", "24.0", device_class="temperature", unit_of_measurement="°C"),
        # --- site metering: belongs to a1, not to the meter ---
        _entity("sensor.energy_a1_daily", "4.2", device_class="energy", unit_of_measurement="kWh"),
        _entity("input_number.energy_price_per_kwh", "0.24"),
        # --- must never be imported ---
        _entity("automation.a1_climate_window_open_safety", "on"),
        _entity("script.villa_core_simulation_a1_check_in", "off"),
        _entity("person.owner", "home"),
    ]


class _FakeHomeAssistant:
    """Records service calls so tests can assert on what VillaCore received."""

    def __init__(self, *, manifest: dict | None = None, refuse: set[str] | None = None):
        self.manifest = manifest
        self.refuse = refuse or set()
        self.service_calls: list[tuple[str, dict]] = []

    def __call__(self, provider, method: str, path: str, payload=None):
        if method == "GET" and path == "/api/states":
            return _villacore_states()
        if method == "GET" and path == "/api/states/sensor.portal_link_manifest":
            if self.manifest is None:
                raise RuntimeError("Home Assistant API error 404: not found")
            return {
                "entity_id": "sensor.portal_link_manifest",
                "state": "ok",
                "attributes": self.manifest,
            }
        if method == "GET" and path.startswith("/api/states/"):
            entity_id = path.rsplit("/", 1)[-1]
            match = next((e for e in _villacore_states() if e["entity_id"] == entity_id), None)
            if match is None:
                raise RuntimeError("Home Assistant API error 404: not found")
            return match
        if method == "POST" and path.startswith("/api/services/"):
            service = path[len("/api/services/") :]
            self.service_calls.append((service, payload or {}))
            if service in self.refuse:
                raise RuntimeError(
                    "Home Assistant API error 400: consenso locale assente, riarmo rifiutato"
                )
            return [{"context": {"id": f"ha-{len(self.service_calls)}"}}]
        raise AssertionError(f"Unexpected HA call: {method} {path}")


def _villacore_env():
    return patch.dict(
        os.environ,
        {
            "SMART_PROVIDER_MODE": "villacore",
            "HOME_ASSISTANT_URL": "http://home-assistant:8123",
            "HOME_ASSISTANT_TOKEN": "test-token",
            "HOME_ASSISTANT_INCLUDE_DOMAINS": "",
        },
        clear=False,
    )


def _patch_ha(fake: _FakeHomeAssistant):
    return patch(
        "app.domains.smart_building.providers.home_assistant.HomeAssistantProvider._request_json",
        autospec=True,
        side_effect=fake,
    )


def _unit_id(client, headers, name: str = "Unit A") -> int:
    units = client.get("/units", headers=headers).json()
    return next(unit["id"] for unit in units if unit["name"] == name)


def _bind_zone_map(client, headers, unit_id: int) -> None:
    """Bind zone `a1` to a real PMS unit, as the operator would from the UI."""
    properties = client.get("/properties", headers=headers).json()
    property_id = properties[0]["id"]
    connections = client.get("/smart/provider-connections", headers=headers).json()
    connection = next((c for c in connections if c["provider_name"] == "villacore"), None)
    if connection is None:
        created = client.post(
            "/smart/provider-connections",
            headers=headers,
            json={
                "property_id": property_id,
                "provider_name": "villacore",
                "base_url": "http://home-assistant:8123",
                "config": {},
            },
        )
        assert created.status_code == 200, created.text
        connection = created.json()
    response = client.put(
        f"/smart/provider-connections/{connection['id']}/zone-map",
        headers=headers,
        json={"zone_map": {"a1": {"kind": "unit", "unit_id": unit_id}}},
    )
    assert response.status_code == 200, response.text


def test_sync_classifies_entities_and_skips_automations_and_simulation():
    fake = _FakeHomeAssistant()
    with _villacore_env(), _patch_ha(fake):
        with TestClient(app) as client:
            headers = _headers()
            unit_id = _unit_id(client, headers)
            _bind_zone_map(client, headers, unit_id)

            sync = client.post("/smart/providers/sync?provider=villacore", headers=headers)
            assert sync.status_code == 200, sync.text
            assert sync.json()["provider_name"] == "villacore"

            devices = [
                d
                for d in client.get("/smart/devices", headers=headers).json()
                if d["provider"] == "villacore"
            ]
            by_external = {d["external_id"]: d for d in devices}

            # Automations and simulation helpers are not devices.
            assert "automation.a1_climate_window_open_safety" not in by_external
            assert "script.villa_core_simulation_a1_check_in" not in by_external
            assert "person.owner" not in by_external

            # Classification is persisted, and the unit binding comes from the
            # zone map rather than from name guessing.
            checkin = by_external["script.a1_check_in"]
            assert checkin["capability_key"] == "workflow.checkin"
            assert checkin["zone_key"] == "a1"
            assert checkin["unit_id"] == unit_id
            assert checkin["facility_key"] is None

            pool_state = by_external["sensor.pool_filtration_state"]
            assert pool_state["capability_key"] == "facility.state"
            assert pool_state["facility_key"] == "pool"
            assert pool_state["unit_id"] is None

            # The meter reading is filed under the unit it measures.
            metering = by_external["sensor.energy_a1_daily"]
            assert metering["capability_key"] == "metric.energy_daily"
            assert metering["unit_id"] == unit_id


def test_unit_capabilities_expose_available_workflows():
    fake = _FakeHomeAssistant()
    with _villacore_env(), _patch_ha(fake):
        with TestClient(app) as client:
            headers = _headers()
            unit_id = _unit_id(client, headers)
            _bind_zone_map(client, headers, unit_id)
            client.post("/smart/providers/sync?provider=villacore", headers=headers)

            response = client.get(f"/smart/units/{unit_id}/capabilities", headers=headers)
            assert response.status_code == 200, response.text
            payload = response.json()
            capabilities = {item["capability_key"] for item in payload["capabilities"]}
            assert {"workflow.checkin", "workflow.checkout", "status.stay"} <= capabilities

            workflows = {item["workflow"]: item for item in payload["workflows"]}
            assert workflows["checkin"]["available"] is True
            assert workflows["checkin"]["command_type"] == "device.script.run"
            # Not wired on this site: reported as unavailable, never faked.
            assert workflows["lights_off"]["available"] is False
            assert workflows["checkout"]["needs_confirmation"] is True


def test_checkin_workflow_calls_the_villacore_script_with_booking_context():
    fake = _FakeHomeAssistant()
    with _villacore_env(), _patch_ha(fake):
        with TestClient(app) as client:
            headers = _headers()
            unit_id = _unit_id(client, headers)
            _bind_zone_map(client, headers, unit_id)
            client.post("/smart/providers/sync?provider=villacore", headers=headers)

            booking = client.post(
                "/bookings",
                headers=headers,
                json={
                    "unit_id": unit_id,
                    "guest_name": "Mario Rossi",
                    "num_adults": 2,
                    "num_children": 1,
                    # Far-future window: the suite shares one database, so this
                    # keeps the booking from colliding with other tests' dates.
                    "checkin_date": "2027-03-01",
                    "checkout_date": "2027-03-05",
                },
            )
            assert booking.status_code in {200, 201}, booking.text
            booking_id = booking.json()["id"]

            response = client.post(
                f"/smart/units/{unit_id}/workflow/checkin",
                headers=headers,
                json={"booking_id": booking_id, "variables": {"target_temp_c": 22}},
            )
            assert response.status_code == 200, response.text
            result = response.json()
            assert result["workflow"] == "checkin"
            assert result["capability_key"] == "workflow.checkin"
            assert result["status"] == "executed"
            assert result["accepted"] is True

            service, payload = next(
                call for call in fake.service_calls if call[0] == "script/turn_on"
            )
            assert payload["entity_id"] == "script.a1_check_in"
            variables = payload["variables"]
            assert variables["booking_ref"] == f"BK-{booking_id}"
            assert variables["guest_name"] == "Mario Rossi"
            assert variables["guests"] == 3
            assert variables["target_temp_c"] == 22
            # The correlation id travels with the command so VillaCore can echo
            # it back and the portal can recognise its own action.
            assert variables["correlation_id"] == result["correlation_id"]
            assert variables["source"] == "hostara.portal"


def test_workflow_without_capability_reports_unavailable_instead_of_guessing():
    fake = _FakeHomeAssistant()
    with _villacore_env(), _patch_ha(fake):
        with TestClient(app) as client:
            headers = _headers()
            unit_id = _unit_id(client, headers)
            _bind_zone_map(client, headers, unit_id)
            client.post("/smart/providers/sync?provider=villacore", headers=headers)

            response = client.post(
                f"/smart/units/{unit_id}/workflow/lights_off", headers=headers, json={}
            )
            assert response.status_code == 409
            assert "workflow.lights_off" in response.json()["detail"]


def test_facility_view_is_read_only_apart_from_safe_off_and_alarm_reset():
    fake = _FakeHomeAssistant()
    with _villacore_env(), _patch_ha(fake):
        with TestClient(app) as client:
            headers = _headers()
            client.post("/smart/providers/sync?provider=villacore", headers=headers)

            facilities = client.get("/smart/facilities", headers=headers)
            assert facilities.status_code == 200, facilities.text
            pool = next(f for f in facilities.json() if f["facility_key"] == "pool")
            assert pool["display_name"] == "Piscina"
            assert pool["state"] == "idle"
            assert pool["alarm_active"] is False
            assert pool["devices_available"] is True
            assert {action["action"] for action in pool["actions"]} == {
                "safe_off",
                "alarm_reset",
            }
            assert all(action["available"] for action in pool["actions"])
            # Interlocks are visible so a refusal can be explained.
            assert any(i["name"] == "thermal_trip" for i in pool["interlocks"])

            # Mode changes stay in Home Assistant, and the API says so.
            refused = client.post(
                "/smart/facilities/pool/actions/set_mode", headers=headers, json={}
            )
            assert refused.status_code == 400
            assert "Home Assistant" in refused.json()["detail"]


def test_facility_safe_off_dispatches_the_plant_script():
    fake = _FakeHomeAssistant()
    with _villacore_env(), _patch_ha(fake):
        with TestClient(app) as client:
            headers = _headers()
            client.post("/smart/providers/sync?provider=villacore", headers=headers)

            response = client.post(
                "/smart/facilities/pool/actions/safe_off", headers=headers, json={}
            )
            assert response.status_code == 200, response.text
            assert response.json()["accepted"] is True

            service, payload = next(
                call
                for call in fake.service_calls
                if call[1].get("entity_id") == "script.pool_filtration_safe_off"
            )
            assert service == "script/turn_on"


def test_interlock_refusal_reaches_the_operator_verbatim():
    fake = _FakeHomeAssistant(refuse={"script/turn_on"})
    with _villacore_env(), _patch_ha(fake):
        with TestClient(app) as client:
            headers = _headers()
            client.post("/smart/providers/sync?provider=villacore", headers=headers)

            response = client.post(
                "/smart/facilities/pool/actions/alarm_reset", headers=headers, json={}
            )
            assert response.status_code == 200, response.text
            result = response.json()
            assert result["accepted"] is False
            assert result["status"] == "failed"
            # The portal must not hide or reinterpret a safety refusal.
            assert "riarmo rifiutato" in result["error_message"]


def test_link_status_reports_health_and_unclassified_entities():
    fake = _FakeHomeAssistant()
    with _villacore_env(), _patch_ha(fake):
        with TestClient(app) as client:
            headers = _headers()
            response = client.get("/smart/link/status?provider=villacore", headers=headers)
            assert response.status_code == 200, response.text
            status = response.json()
            assert status["provider_name"] == "villacore"
            assert status["configured"] is True
            assert status["reachable"] is True
            assert status["authenticated"] is True
            assert status["contract_version"] == "villacore.link.v1"
            assert status["manifest_present"] is False
            assert status["importable_count"] >= 15
            assert status["excluded_count"] >= 3
            assert status["unclassified"] == []
            zones = {zone["zone"]: zone for zone in status["zones"]}
            assert zones["a1"]["kind"] == "unit"
            assert zones["pool"]["kind"] == "facility"


def test_link_status_separates_a_bad_token_from_an_unreachable_host():
    def _unauthorized(provider, method: str, path: str, payload=None):
        raise RuntimeError("Home Assistant API error 401: Unauthorized")

    with _villacore_env():
        with patch(
            "app.domains.smart_building.providers.home_assistant.HomeAssistantProvider._request_json",
            autospec=True,
            side_effect=_unauthorized,
        ):
            with TestClient(app) as client:
                status = client.get(
                    "/smart/link/status?provider=villacore", headers=_headers()
                ).json()
                # Reached Home Assistant, token rejected: a different fix from
                # "host unreachable", so the UI must be able to tell them apart.
                assert status["reachable"] is True
                assert status["authenticated"] is False
                assert "401" in status["last_error"]


def test_transport_errors_are_explained_not_just_forwarded():
    from app.domains.smart_building.providers.villacore import VillaCoreProvider

    service_name = VillaCoreProvider(base_url="http://home-assistant:8123", token="x")
    dns_error = "Home Assistant API unreachable: [Errno -2] Name or service not known"
    explained = service_name._explain_transport_error(dns_error)
    # A bare service name that stops resolving means the shared network
    # attachment was lost, which is a different fix from "wrong URL".
    assert "link-villacore" in explained
    assert "P1" in explained

    real_host = VillaCoreProvider(base_url="http://ha.example.com:8123", token="x")
    assert "link-villacore" not in real_host._explain_transport_error(dns_error)

    refused = real_host._explain_transport_error(
        "Home Assistant API unreachable: [Errno 111] Connection refused"
    )
    assert "porta" in refused

    # An authentication error must not be reinterpreted as a transport problem.
    auth_error = "Home Assistant API error 401: Unauthorized"
    assert real_host._explain_transport_error(auth_error) == auth_error


def test_manifest_from_villacore_adds_a_zone_without_touching_portal_code():
    fake = _FakeHomeAssistant(
        manifest={
            "contract_version": "villacore.link.v1",
            "zones": {"pool": {"kind": "facility", "display_name": "Piscina grande"}},
        }
    )
    with _villacore_env(), _patch_ha(fake):
        with TestClient(app) as client:
            headers = _headers()
            status = client.get(
                "/smart/link/status?provider=villacore", headers=headers
            ).json()
            assert status["manifest_present"] is True
            zones = {zone["zone"]: zone for zone in status["zones"]}
            assert zones["pool"]["display_name"] == "Piscina grande"


def test_operator_role_cannot_dispatch_workflows_or_facility_actions():
    fake = _FakeHomeAssistant()
    with _villacore_env(), _patch_ha(fake):
        with TestClient(app) as client:
            owner_headers = _headers()
            unit_id = _unit_id(client, owner_headers)
            _bind_zone_map(client, owner_headers, unit_id)
            client.post("/smart/providers/sync?provider=villacore", headers=owner_headers)

            operator_headers = _headers(username="ops", role="operator")
            workflow = client.post(
                f"/smart/units/{unit_id}/workflow/checkin", headers=operator_headers, json={}
            )
            assert workflow.status_code == 403
            action = client.post(
                "/smart/facilities/pool/actions/safe_off", headers=operator_headers, json={}
            )
            assert action.status_code == 403

            # Reading stays allowed.
            assert client.get("/smart/facilities", headers=operator_headers).status_code == 200
