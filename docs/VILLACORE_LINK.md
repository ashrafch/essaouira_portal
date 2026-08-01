# VillaCore Link v1

How the Hostara portal and the VillaCore building platform work together as two
complete systems instead of one blurred one.

- **VillaCore is the building OS.** It owns physical truth and execution: device
  state, plant state machines, interlocks, timers, safety automations, manual
  override. It decides what is safe to switch on.
- **The portal is the business OS.** It owns bookings, staff, revenue, costs and
  the operator's decisions. It states intentions and records consequences.

Neither re-implements the other. Where they meet, this contract applies.

---

## 1. Transport

The portal reaches Home Assistant by service name over a shared Docker network,
so nothing depends on a host IP or a published port and dev behaves like
production.

```bash
scripts/link-villacore.ps1            # Windows
scripts/link-villacore.sh             # Linux/WSL
docker compose -f docker-compose.yml -f docker-compose.villacore.yml up -d --build
```

The script is idempotent: it creates the `villacore_link` network, attaches the
running VillaCore Home Assistant container with the alias `home-assistant`,
verifies reachability from inside the network, and validates a token when given
one (`-Token` / `--token`).

VillaCore's optional `docker-compose.portal.yml` now declares the same external
network, so the attachment survives container recreation whenever that overlay
is used. The base VillaCore stack remains independent of the network and portal.

### Environment

| Variable | Meaning |
| --- | --- |
| `SMART_PROVIDER_MODE=villacore` | Enables the VillaCore provider (`mock` and `home_assistant` still work) |
| `HOME_ASSISTANT_URL=http://home-assistant:8123` | Service name on the shared network |
| `HOME_ASSISTANT_TOKEN` | Long-lived token. Create it with `python scripts/get_villacore_token.py` (runs HA's own auth flow and writes it straight into `.env`), or by hand in HA profile → Security |
| `SMART_INGEST_TOKEN` | Shared secret VillaCore sends on the event webhook. Empty = inbound push disabled |
| `SMART_POLL_INTERVAL_SECONDS` | Reconciliation period. `0` (default) = off, drive it from cron instead |
| `VILLACORE_SITE_ID` | Site id used by VillaCore's simulator and topics |

Known port collisions on a host running both stacks, already handled: VillaCore's
`mock-api` and the portal API both wanted `8000` (P1 moves the mock to `8010`),
and both Grafanas wanted `3000` (the portal's ops profile now defaults to `3001`).

---

## 2. Classification: why new milestones need no portal code

VillaCore names entities `<domain>.<zone>_<function>` (its ADR 0007) and repeats
the *same vocabulary* for every plant. Pool (M5), irrigation (M6), gate (M7),
metering (M8) and the PLC layer (M9) all expose a state sensor, a mode selector, a
supervision state, an availability sensor, an alarm flag, a safe-off script and an
alarm-reset script.

So the portal implements **one** abstraction, not one per plant. An entity is
resolved in three steps, most authoritative first:

1. **Manifest** — `sensor.portal_link_manifest`, published by VillaCore (prompt
   **P3**), declares `contract_version`, zones and explicit capability bindings.
2. **Profile** — `apps/server/app/domains/smart_building/providers/villacore_profile.yaml`,
   versioned data in this repo: zone list plus ordered capability rules.
3. **Naming inference** — an unknown zone prefix becomes a *generic facility*
   rather than disappearing.

Anything that still has no capability is reported by `GET /smart/link/drift`
(surfaced on the **Link VillaCore** page), never silently dropped.

Measured live after VillaCore Milestone 13 P9 (Home Assistant 2026.5.2): **694
entities → 445 imported, 243 excluded, 0 unclassified.** The exclusions are
automations, simulation helpers, link infrastructure, Home Assistant's own
integrations and five explicitly named legacy aliases that remain unavailable;
their canonical energy/runtime entities are imported normally.

### Zones

| Zone kind | Meaning | Where it appears |
| --- | --- | --- |
| `unit` | A rentable unit (`villa`, `a1`…`a6`) | Bookings, readiness, assistants, unit detail |
| `facility` | Shared plant (`pool`, `garden`, `outdoor`, `energy`, `plc`) | `/smart-facilities` |
| `common` | Site-wide helpers (`villa_core`) | Property scope only |

Zone → PMS unit binding lives in the provider connection's `zone_map`, editable
from the Link page and set during onboarding by the wizard's **mapping** step
(`POST /setup/map-zones`). Binding a zone attaches all of its devices at once and
re-syncs immediately, which is why per-device assignment is no longer part of the
guided flow: one careless click there used to attach an entire building to a
single apartment. `POST /setup/assign-devices` remains for manual corrections.
No migration is needed to rebind a zone.

Site metering is a special case worth knowing: `sensor.energy_a1_daily` *lives* in
zone `energy` but *measures* unit `a1`, so the classifier extracts that subject
zone and the reading is attributed to the unit — a unit's consumption must not be
filed under the meter.

### Capabilities

Callers ask for a capability, never for an entity id.

| Group | Examples |
| --- | --- |
| Unit workflows | `workflow.checkin`, `workflow.checkout`, `workflow.mark_ready`, `workflow.safe_off`, `workflow.climate_safe_off`, `workflow.climate_eco/comfort`, `workflow.housekeeping_set`, `workflow.lock_entry/unlock_entry`, `workflow.guest_mode_on/off` |
| Unit status | `status.stay`, `status.housekeeping`, `status.guest_count`, `flag.guest_mode`, `flag.guest_available`, `flag.maintenance_lock`, `sensor.occupancy` |
| Comfort & openings | `climate.main`, `light.main`, `cover.main`, `lock.entry`, `contact.entry_door`, `contact.window` |
| Facility | `facility.state`, `facility.mode`, `facility.supervision`, `facility.alarm`, `facility.safe_off`, `facility.alarm_reset`, `facility.zone` |
| Interlocks (read-only) | `interlock.flow`, `interlock.thermal_trip`, `interlock.local_consent`, `interlock.obstacle`, `interlock.rain` |
| Metrics → telemetry | `metric.temperature`, `metric.energy_daily`, `metric.pressure`, `metric.runtime`, `metric.flow_rate`, `metric.soil_moisture` |
| Diagnostics | `diagnostic.watchdog`, `diagnostic.heartbeat`, `diagnostic.contract_version` |
| Settings | `setting.energy_price` (the tariff, read from VillaCore) |

Stored on `devices.zone_key` / `capability_key` / `facility_key`
(migration `0015_smart_capability_mapping`, all nullable — mock and generic HA
devices carry none and keep working).

---

## 3. Portal → VillaCore: commands and workflows

A workflow is a business intention. The portal resolves it to a capability, finds
the device implementing it and dispatches a normal device command — so a workflow
gets the same audit trail, correlation id, TTL and failure reporting as any other
command.

```http
POST /smart/units/{unit_id}/workflow/checkin
{ "booking_id": 42, "variables": { "target_temp_c": 22 } }
```

becomes, on the Home Assistant side:

```yaml
service: script.turn_on
target: { entity_id: script.a1_check_in }
data:
  variables:
    booking_ref: BK-42
    guest_name: Mario Rossi
    guests: 3
    target_temp_c: 22
    correlation_id: <generated by the portal>
    source: hostara.portal
```

Workflows include `checkin`, `checkout`, `mark_ready`, `safe_off`,
`climate_safe_off`, `climate_eco`, `climate_comfort`, `housekeeping_set`,
`lock_entry`, `unlock_entry`, `lights_off`, `guest_mode_on` and `guest_mode_off`.
When VillaCore defines a
dedicated script *and* a bare helper for the same thing, the script wins — it
carries the safety conditions that flipping the helper would bypass. That is why
`unlock_entry` drives `script.a1_unlock_entry` rather than `lock.a1_entry`, and
`housekeeping_set` prefers the script over the bare `input_select`.

`housekeeping_set` takes a target state (`Da fare` | `In corso` | `Fatto`) in
`variables.status`; the others take no argument. Opening a door and closing a
stay ask for confirmation in the UI.

**Checkout vacancy.** With `sensor.occupancy` (or, failing that, `sensor.motion`)
reporting presence, the checkout assistant marks the booking `BLOCKED` rather than
merely warning: ending a stay while somebody is still inside is worth stopping
for. A site that exposes no presence at all reports *unknown* and is never told
the unit is empty.

Command types added for scripted objects: `device.script.run`,
`device.scene.apply`, `device.select.set_option`, `device.number.set_value`,
`device.text.set_value`, `device.boolean.set_state`, `device.cover.set_state`,
`device.climate.set_power`.

**A refusal is a valid answer.** If Home Assistant rejects a command because a
local interlock is active, the command ends `failed` and the message reaches the
operator unchanged. The portal never retries around a safety refusal and never
bypasses an interlock.

### Shared facilities are deliberately read-heavy

`/smart-facilities` shows state, mode, supervision, alarms, interlocks, telemetry
and cost. It exposes exactly **two** actions — `safe_off` and `alarm_reset` —
because those are operational decisions that need accountability. Mode changes,
manual pump or zone starts, timers and setpoints stay in Home Assistant, which
owns the interlocks; asking for one of them returns `400` with an explanation
rather than doing it.

---

## 4. VillaCore → portal: events

```http
POST /smart/link/events
X-Smart-Ingest-Token: <SMART_INGEST_TOKEN>

{
  "schema": "villacore.event.v1",
  "event_id": "<stable-delivery-id>",
  "site": "dev",
  "zone": "a1",
  "kind": "unit",
  "entity_id": "script.a1_check_in",
  "event": "unit.checkin.completed",
  "severity": "info",
  "reason": null,
  "correlation_id": "<echo of the portal's command, when there was one>",
  "booking_ref": "BK-42",
  "state": { "state": "Occupato", "attributes": {} },
  "occurred_at": "2026-07-31T10:00:00+00:00"
}
```

The endpoint accepts either the shared secret (Home Assistant cannot hold a
portal JWT) or a normal portal login. A wrong secret is `401`; a valid envelope
the portal cannot place answers `200` with `accepted: false` and a reason. A
repeated `event_id` answers `accepted: true`, `duplicate: true` with the original
persisted event ID, without updating state or creating another alert.

| Event | Portal effect |
| --- | --- |
| `unit.checkin.completed`, `unit.checkout.completed`, `unit.ready`, `unit.housekeeping.changed` | Timeline entry on the unit |
| `unit.climate.safety_stop` | `warning` alert, reason included |
| `unit.devices.unavailable` / `.recovered` | `critical` alert / resolves it |
| `facility.state.changed`, `facility.cycle.completed` | Timeline entry |
| `facility.alarm.raised` / `.cleared` | `critical` alert / resolves it |
| `facility.safety_stop` | `critical` alert with the cause (`no_flow`, `thermal`, `timeout`, `consent_lost`, `rain`, `leak`, `obstacle`, `max_runtime`) |
| `facility.devices.unavailable` / `.recovered` | `critical` alert / resolves it |
| `water.leak.detected` | `critical` leak alert |
| `state.changed` | State update only (allowlist + throttle) |

### Loop prevention

Every portal command carries a `correlation_id`; VillaCore echoes it back. An
echoed event is recorded for the timeline but does **not** re-trigger automation
rules — otherwise the portal would react to its own action, forever.

Every VillaCore delivery also carries an `event_id`. This is distinct from the
portal's numeric event row ID and remains stable if the same envelope is sent
again. It is the idempotency key for state, timeline, alerts and rules.

### Reconciliation

Push is the fast path; reconciliation is the one that guarantees convergence,
because a missed POST is invisible. `POST /smart/link/reconcile` re-imports the
catalog (picking up new VillaCore entities) and re-reads every state. Enable the
in-process loop with `SMART_POLL_INTERVAL_SECONDS`, or call the endpoint from
cron. It is off by default and never runs in `mock` mode.

### Token rotation and restore

Use placeholders in commands and keep both credentials in ignored environment
or secrets files.

- Rotate `HOME_ASSISTANT_TOKEN` by creating the replacement first, updating the
  portal backend, validating with `scripts/link-villacore.ps1 -Token
  "<NEW_HA_TOKEN>"`, reconciling, then revoking the old token.
- Rotate `SMART_INGEST_TOKEN` by disabling VillaCore's outbound kill switch,
  updating the portal secret, running VillaCore's
  `configure-portal-link.ps1`, restarting the two secret consumers, sending a
  duplicate-safe test event and confirming the old token returns `401`.
- Back up and restore the two products separately. After either restore, keep
  outbound push disabled, validate the contract and zone map, synchronize the
  catalog, run `POST /smart/link/reconcile`, then re-enable automation packs.

The detailed VillaCore-side procedure is
`docs/operations/management-portal-link-runbook.md` in the sibling repository.

---

## 5. Source-of-truth boundaries

- **The PMS owns the booking.** It pushes stay state into the building. HA events
  are physical confirmations used for timeline, readiness and alerts — they never
  mutate a booking's lifecycle.
- **VillaCore owns plant state machines and interlocks.** The portal renders them
  read-only and sends requests.
- **Costs are the portal's.** Consumption becomes money only here.
- **Software is never the only safety layer.** Physical protection, thermal
  protection, end switches, dry-run protection, emergency stops and manual
  override stay independent of both systems.

---

## 6. Costs from telemetry

`GET /smart/utility-costs?year=&month=` reports consumption and cost per unit and
per plant; `POST /smart/utility-costs/post` writes it as `utilities` cost items
that flow into the monthly P&L next to cleaning and channel fees. Posting is
idempotent: each scope gets one line per month, recognised by a `[smart-utility]`
marker and updated in place.

Daily counters (`sensor.energy_<zone>_daily`) reset at midnight, so the month is
the sum of each day's peak, not of every sample.

The tariff comes from VillaCore's `input_number.energy_price_per_kwh` when
published (`energy_price_source: "villacore"`), so there is a single place to
change the price. Otherwise the portal falls back to its own default and says so.

**Estimates are labelled.** A plant with runtime but no kWh meter is priced from
the profile's `rated_power_w` and flagged `estimated: true` with its basis shown
in the UI and in the cost description. It is never presented as a measurement.

---

## 7. Starting over

`scripts/reset_smart_layer.py` clears what the portal derived from the building —
devices and everything hanging off them, provider connections, scenario packs,
setup sessions, and optionally scenes and rules — and never touches bookings,
staff tasks, maintenance tickets or cost items. Units and properties are only
removed when named explicitly with `--drop-unit` / `--drop-property`, and the
script refuses when the business still references them.

```bash
python scripts/reset_smart_layer.py                       # dry run, prints the plan
python scripts/reset_smart_layer.py --yes                 # apply
python scripts/reset_smart_layer.py --yes --drop-unit 7 --drop-property 2
```

To redo the onboarding without deleting anything, use **Riavvia procedura** in the
wizard (`POST /setup/restart`): it abandons the session in progress and starts
from step one, leaving properties, units, devices and mappings intact.

## 8. Verification

```bash
# static
cd apps/server && python -m pytest -q
cd apps/web && npm run lint && npm run test:run && npm run build
docker compose config
docker compose -f docker-compose.yml -f docker-compose.villacore.yml config

# live, with the VillaCore stack running
scripts/link-villacore.ps1 -Token "<token>"
curl -s localhost:8000/smart/link/status  -H "Authorization: Bearer <jwt>"
curl -s -X POST localhost:8000/smart/providers/sync?provider=villacore -H "Authorization: Bearer <jwt>"
curl -s -X POST localhost:8000/smart/units/1/workflow/checkin -H "Authorization: Bearer <jwt>" -d '{}'
```

End-to-end checks worth running after any VillaCore milestone:

1. `GET /smart/link/status` — reachable, authenticated, `unclassified: []`.
2. Sync, then confirm the new zone appears under `/smart-facilities` or on a unit.
3. Trigger a simulation scenario in VillaCore (`script.villa_core_simulation_pool_no_flow`)
   and confirm the alert, the reason and the resolving event.
4. Stop the simulator: availability sensors go off, alerts open, readiness drops;
   restart it and confirm the alerts close.

---

## 9. Current limitations

- **Facility actions stay at two.** Shared plants expose only `safe_off` and
  `alarm_reset` by design; modes, manual starts, timers and setpoints remain in
  Home Assistant, which owns the interlocks.
- **`SMART_INGEST_TOKEN` is single-tenant.** The ingest identity maps to the
  configured admin tenant; a multi-tenant deployment needs per-tenant secrets.
- **No hardware.** Villa, A1–A6, facilities, PLC contract and all 159 MQTT
  devices are simulated. Real wiring, protections, Proxmox, NAS and commissioning
  are not validated by this integration gate.
- **Release remains a candidate.** The completed P1–P10 simulation work does not
  promote VillaCore `1.0.0-rc.1` to `1.0.0`.
