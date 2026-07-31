"""The classifier is what keeps the portal in sync with VillaCore milestones.

The fixture below mirrors the real naming shape of VillaCore's entity registry
(units, pool M5, irrigation M6, gate M7, site metering M8) without depending on
the sibling repository. If VillaCore adds another plant of the same shape these
tests are what prove the portal classifies it with no code change.
"""

from app.domains.smart_building.providers.villacore_classifier import (
    ZONE_KIND_COMMON,
    ZONE_KIND_FACILITY,
    ZONE_KIND_UNIT,
    load_profile,
)


UNIT_ENTITIES = {
    "script.a1_check_in": "workflow.checkin",
    "script.a1_check_out": "workflow.checkout",
    "script.a1_mark_ready": "workflow.mark_ready",
    "script.a1_climate_safe_off": "workflow.climate_safe_off",
    "script.a1_climate_eco": "workflow.climate_eco",
    "script.a1_climate_comfort": "workflow.climate_comfort",
    "script.a1_housekeeping_set": "workflow.housekeeping_set",
    "script.a1_lock_entry": "workflow.lock_entry",
    "script.a1_unlock_entry": "workflow.unlock_entry",
    "script.a1_core_enable_guest_mode": "workflow.guest_mode_on",
    "script.a1_core_disable_guest_mode": "workflow.guest_mode_off",
    "input_select.a1_stay_status": "status.stay",
    "input_select.a1_housekeeping": "status.housekeeping",
    "input_boolean.a1_core_guest_mode": "flag.guest_mode",
    "input_boolean.a1_maintenance_lock": "flag.maintenance_lock",
    "input_number.a1_guest_count": "status.guest_count",
    "input_text.a1_access_code": "setting.access_code",
    "input_datetime.a1_last_check_in": "status.last_check_in",
    "binary_sensor.a1_devices_available": "sensor.availability",
    "binary_sensor.a1_occupancy_detected": "sensor.occupancy",
    "binary_sensor.a1_guest_available": "flag.guest_available",
    "climate.a1_living": "climate.main",
    "light.a1_bedroom_1_main": "light.main",
    "binary_sensor.a1_entry_door": "contact.entry_door",
    "binary_sensor.a1_living_window": "contact.window",
    "binary_sensor.a1_living_motion": "sensor.motion",
    "binary_sensor.a1_bathroom_water_leak": "sensor.leak",
    "lock.a1_entry": "lock.entry",
    "cover.a1_living_shutter": "cover.main",
    "sensor.a1_living_humidity": "metric.humidity",
    "sensor.a1_living_temperature": "metric.temperature",
    "sensor.a1_power": "metric.power",
    "sensor.a1_energy": "metric.energy",
    "cover.villa_living_shutter": "cover.main",
    "binary_sensor.villa_water_leak_detected": "sensor.leak",
    "binary_sensor.villa_presence_detected": "sensor.presence",
}

# Pool (M5), irrigation (M6) and gate (M7) repeat one vocabulary. The gate
# entities interpose the machine name (`outdoor_gate_alarm_active`), which is
# exactly the case a leading-wildcard suffix has to absorb.
FACILITY_ENTITIES = {
    "sensor.pool_filtration_state": ("pool", "facility.state"),
    "input_select.pool_filtration_mode": ("pool", "facility.mode"),
    "input_select.pool_supervision_state": ("pool", "facility.supervision"),
    "binary_sensor.pool_alarm_active": ("pool", "facility.alarm"),
    "binary_sensor.pool_devices_available": ("pool", "sensor.availability"),
    "script.pool_filtration_safe_off": ("pool", "facility.safe_off"),
    "script.pool_alarm_reset": ("pool", "facility.alarm_reset"),
    "binary_sensor.pool_thermal_trip": ("pool", "interlock.thermal_trip"),
    "binary_sensor.pool_local_consent": ("pool", "interlock.local_consent"),
    "sensor.pool_water_temperature": ("pool", "metric.temperature"),
    "sensor.pool_filter_pressure": ("pool", "metric.pressure"),
    "sensor.garden_irrigation_state": ("garden", "facility.state"),
    "switch.garden_irrigation_zone_1": ("garden", "facility.zone"),
    "script.garden_start_zone_2": ("garden", "facility.zone_start"),
    "binary_sensor.garden_rain": ("garden", "interlock.rain"),
    "sensor.garden_soil_moisture_zone_1": ("garden", "metric.soil_moisture"),
    "binary_sensor.outdoor_gate_alarm_active": ("outdoor", "facility.alarm"),
    "input_select.outdoor_gate_supervision_state": ("outdoor", "facility.supervision"),
    "binary_sensor.outdoor_gate_devices_available": ("outdoor", "sensor.availability"),
    "script.outdoor_gate_alarm_reset": ("outdoor", "facility.alarm_reset"),
    "binary_sensor.outdoor_gate_obstacle": ("outdoor", "interlock.obstacle"),
    "binary_sensor.outdoor_gate_open_limit": ("outdoor", "interlock.limit_open"),
    "sensor.outdoor_gate_position": ("outdoor", "metric.position"),
}

EXCLUDED_ENTITIES = [
    "automation.a1_climate_window_open_safety",
    "script.villa_core_simulation_a1_check_in",
    "input_boolean.villa_core_simulation_notifications",
    "switch.villa_technical_simulation_relay",
    "sensor.portal_link_manifest",
    "person.owner",
    "sun.sun",
]


def test_unit_entities_get_their_capability():
    profile = load_profile()
    for entity_id, expected_capability in UNIT_ENTITIES.items():
        result = profile.classify(entity_id)
        assert not result.excluded, entity_id
        assert result.capability == expected_capability, entity_id
        assert result.zone is not None and result.zone.kind == ZONE_KIND_UNIT, entity_id


def test_facility_entities_share_one_vocabulary_across_plants():
    profile = load_profile()
    for entity_id, (expected_zone, expected_capability) in FACILITY_ENTITIES.items():
        result = profile.classify(entity_id)
        assert not result.excluded, entity_id
        assert result.capability == expected_capability, entity_id
        assert result.zone_key == expected_zone, entity_id
        assert result.zone.kind == ZONE_KIND_FACILITY, entity_id
        assert result.facility_key == expected_zone, entity_id


def test_automations_and_simulation_helpers_are_never_imported():
    profile = load_profile()
    for entity_id in EXCLUDED_ENTITIES:
        result = profile.classify(entity_id)
        assert result.excluded, entity_id
        assert result.exclude_reason


def test_site_helpers_land_on_the_common_zone():
    profile = load_profile()
    result = profile.classify("input_select.villa_core_mode")
    assert result.capability == "site.mode"
    assert result.zone.kind == ZONE_KIND_COMMON
    assert result.facility_key is None


def test_metering_entities_are_attributed_to_the_zone_they_measure():
    profile = load_profile()

    per_unit = profile.classify("sensor.energy_a1_daily")
    assert per_unit.capability == "metric.energy_daily"
    assert per_unit.zone_key == "energy"
    assert per_unit.subject_zone is not None
    assert per_unit.effective_zone.key == "a1"
    # A unit's consumption must not be filed under the meter.
    assert per_unit.facility_key is None

    per_facility = profile.classify("sensor.energy_pool_daily")
    assert per_facility.effective_zone.key == "pool"
    assert per_facility.facility_key == "pool"

    site_wide = profile.classify("sensor.energy_site_daily")
    assert site_wide.subject_zone is None
    assert site_wide.facility_key == "energy"

    tariff = profile.classify("input_number.energy_price_per_kwh")
    assert tariff.capability == "setting.energy_price"


def test_unknown_zone_becomes_a_generic_facility_instead_of_disappearing():
    profile = load_profile()
    result = profile.classify("sensor.solar_inverter_state")
    assert not result.excluded
    assert result.zone is not None
    assert result.zone.kind == ZONE_KIND_FACILITY
    assert result.zone.known is False
    assert result.inferred_zone is True
    assert result.capability == "facility.state"


def test_entity_without_capability_rule_is_reported_not_dropped():
    profile = load_profile()
    result = profile.classify("sensor.a1_something_nobody_planned")
    assert not result.excluded
    assert result.capability is None
    assert result.classified is False


def test_longest_zone_prefix_wins():
    profile = load_profile()
    # `a1` must not swallow a hypothetical `a10`; the guard is prefix length.
    assert profile.classify("light.a1_living_kitchen_main").zone_key == "a1"
    assert profile.classify("light.villa_kitchen_main").zone_key == "villa"


def test_manifest_overrides_zones_and_adds_capabilities():
    profile = load_profile()
    enriched = profile.with_manifest(
        {
            "contract_version": "villacore.link.v2",
            "zones": {"solar": {"kind": "facility", "display_name": "Fotovoltaico"}},
            "capabilities": {"facility.state": ["sensor.solar_state"]},
        }
    )
    assert enriched.contract_version == "villacore.link.v2"
    solar = enriched.classify("sensor.solar_state")
    assert solar.zone.display_name == "Fotovoltaico"
    assert solar.zone.known is True
    assert solar.capability == "facility.state"
    # The bundled profile must keep working after a manifest overlay.
    assert enriched.classify("script.a1_check_in").capability == "workflow.checkin"


def test_malformed_manifest_does_not_blind_the_portal():
    profile = load_profile()
    for manifest in (None, {}, {"zones": "nonsense"}, {"capabilities": {"x": [123]}}):
        enriched = profile.with_manifest(manifest)
        assert enriched.classify("script.a1_check_in").capability == "workflow.checkin"
