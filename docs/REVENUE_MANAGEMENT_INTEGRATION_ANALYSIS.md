# Revenue Management — Integration Analysis & Roadmap (PriceLabs-like)

Status: **Fase 0 + Fase 1 + Fase 2 shipped** (rate calendar, booking-status,
recommendation engine v2 — seasons/lead-time/orphan-gap, min-stay enforcement,
min/max guardrails, manual rate editor, seasons & lead-time rules editor).
Owner domain: `apps/server/app/domains/revenue/`.

This document maps PriceLabs-style dynamic-pricing capabilities onto the existing
Essaouira Portal: what we reuse, what we build, and what is genuinely hard.

---

## 1. What already existed (reused, not rebuilt)

| Asset | Location | Role in the pricing engine |
| --- | --- | --- |
| `Unit.base_nightly_rate` (flat) | `models/unit.py` | Seed / fallback base price |
| `compute_booking_financials()` | `domains/bookings/service.py` | Integration hook — now reads per-night prices |
| Booking overlap check | `domains/bookings/router.py` | Availability enforcement |
| Occupancy, ADR, RevPAR, pipeline, LOS | `domains/analytics/service.py` | Demand/pace signals for recommendations |
| `Booking.source` | `models/booking.py` | Channel attribution |
| `PricingDefaults` (fees/commission) | `models/pricing_defaults.py` | Commercial defaults |
| Calendar page + per-unit timeline | `apps/web/src/pages/Calendar.jsx` | Price-review surface |

## 2. Feature map (PriceLabs → action)

🟢 reuse · 🟡 extend · 🔴 new

| Capability | Action | Fase |
| --- | --- | --- |
| Base price per listing | 🟢 `base_nightly_rate` (+ min/max later) | — |
| Per-date rate calendar | 🔴 `rate_calendar` table | **0 ✅** |
| Reservation status (pace/cancellations) | 🔴 `Booking.status` | **0 ✅** |
| Booking financials read the calendar | 🟡 `compute_booking_financials` | **0 ✅** |
| Occupancy-based recommendation | 🔴 `recommend_prices()` | **0 ✅** |
| Day-of-week (weekend) premium | 🔴 recommendation rule | **0 ✅** |
| Manual overrides (locked days) | 🔴 `is_override` | **0 ✅** |
| Min-stay per date (stored + enforced at booking) | 🔴 `rate_calendar.min_stay` | **1 ✅** |
| Min/max price guardrails (clamp recommendations) | 🔴 `Unit.min_price/max_price` | **1 ✅** |
| Manual rate-calendar editor (UI) | 🔴 `RateCalendarEditor` on Pricing page | **1 ✅** |
| Seasonal profiles (date-range %) | 🔴 `pricing_seasons` | **2 ✅** |
| Lead-time rules (last-minute/early-bird) | 🔴 `lead_time_rules` | **2 ✅** |
| Orphan-gap fill (single-night gaps) | 🔴 engine detection | **2 ✅** |
| iCal availability sync (anti-overbooking) | 🔴 channel connections + `.ics` | 3 |
| Market/competitor data | 🔴 manual comp-set only | 4 |
| Price push to OTAs | 🔴 adapter (declared future) | 4 |

## 3. Honest limits

- **Market data**: PriceLabs aggregates paid market feeds. We have none. Plan is a
  manual comp-set (owner enters a few reference rates); own-portfolio occupancy +
  pace + seasonality already covers most of the value for a 7-unit property.
- **Price push to OTAs**: iCal carries **availability only, not price**. Pushing
  rates to Airbnb/Booking needs their connectivity APIs (approved accounts / a
  certified channel manager). Kept behind an adapter, labelled future — never
  presented as working when stubbed.

## 4. Fase 0 — what shipped

**Backend**
- `models/rate_calendar.py` — `RateCalendar(unit_id, date, price, min_stay,
  currency, price_source[base|rule|reco|manual], is_override)`, tenant-scoped,
  unique `(unit_id, date)`.
- `models/booking.py` — `status` (pending/confirmed/cancelled/hold, default
  `confirmed`, additive/backward-compatible).
- Alembic `0010_rate_calendar_status` — guarded (idempotent) create + add-column,
  dialect-safe (`sa.func.now()`, `sa.false()`); revision id kept ≤ 32 chars to fit
  `alembic_version.version_num`.
- `domains/revenue/` — service + router:
  - `GET /revenue/rate-calendar?unit_id&from_date&to_date` — full per-date view
    (stored rows + base-rate fallback).
  - `PUT /revenue/rate-calendar` — bulk manual upsert (marks `is_override`).
  - `DELETE /revenue/rate-calendar?unit_id&day` — revert a day to base.
  - `GET /revenue/recommendations` — transparent preview (base × weekend × forward
    occupancy), reason string per day.
  - `POST /revenue/recommendations/apply` — persist as `reco`, skipping overrides.
- `compute_booking_financials` — resolution order: explicit `payload.nightly_rate`
  → per-night `rate_calendar` → `unit.base_nightly_rate`. **Empty calendar ⇒
  identical legacy behaviour.**

**Frontend**
- `services/api.js` — `getRateCalendar`, `upsertRateCalendar`,
  `deleteRateCalendarDay`, `getRevenueRecommendations`, `applyRevenueRecommendations`.
- `Calendar.jsx` — per-unit timeline shows nightly price (color by provenance:
  manual/reco/base), min-stay + provenance in tooltip, and a month rate summary
  (avg/min/max, custom-day count).

**Tests**: `tests/test_revenue_rate_calendar.py` — base fallback, manual override,
booking-uses-calendar, recommendation preview+apply, override-not-overwritten.
Full backend suite green.

## 5. Fase 1 — what shipped

**Backend**
- `Unit.min_price` / `Unit.max_price` (Alembic `0011_unit_price_guardrails`,
  guarded) — recommendations are clamped to this band.
- Min-stay enforcement: `POST`/`PUT /bookings` reject a stay shorter than the
  `rate_calendar.min_stay` of its check-in date (`get_min_stay`).
- Tests: min-stay rejection/acceptance, recommendation clamp.

**Frontend**
- `components/RateCalendarEditor.jsx` — per-unit, per-month editable grid
  (price + min-stay), "Applica consigli" (one-click apply, skips manual
  overrides), "Salva modifiche" (manual upsert). Mounted on `Tariffe & Canali`.
- `Pricing.jsx` — min/max price fields on the unit editor + columns in the table.

## 6. Fase 2 — what shipped

**Backend**
- `pricing_seasons` (name, date range, `adjustment_percent`, optional `unit_id`,
  `priority`) and `lead_time_rules` (label, `min_days`/`max_days`,
  `adjustment_percent`) — Alembic `0012_revenue_rules`, guarded. Full CRUD under
  `/revenue/seasons` and `/revenue/lead-time-rules`.
- Recommendation engine v2: applies matching season → weekend → portfolio
  occupancy → lead-time rule → orphan-gap fill (single free night between two
  occupied ones, −20%), then clamps to `[min_price, max_price]`.
- Tests: season adjustment, lead-time rule, orphan-gap all reflected in `reason`.

**Frontend**
- `components/RevenueRulesEditor.jsx` on the Pricing page — manage seasons and
  lead-time rules (list / add / delete), portfolio-wide or per unit.

## 7. Recommendation model v2 (transparent)

```text
price = base_nightly_rate
price *= 1 + season.adjustment%/100          # Fase 2: highest-priority season
if weekday in {Fri, Sat}:      price *= 1.15       # weekend
if portfolio_occupancy >= 0.8: price *= 1.25       # high demand
elif >= 0.6:                   price *= 1.12
elif < 0.3:                    price *= 0.90        # stimulate low-demand dates
price *= 1 + lead_time_rule.adjustment%/100  # Fase 2: days until the date
if orphan_night:               price *= 0.80       # Fase 2: fill single-night gaps
price = clamp(price, unit.min_price, unit.max_price)   # Fase 1 guardrail
```

Portfolio occupancy for a date = share of units with a non-cancelled booking
covering that date. No black box; every recommendation carries its `reason`.

## 8. Migration chain (fixed)

The Alembic chain was reordered so a fresh database builds from scratch:
`… → 0006 → 0009 (smart core tables) → 0007 → 0008 → 0010 → 0011`. Previously the
telemetry migrations (0007/0008) declared foreign keys to `devices`, which was
only created in 0009 — so `alembic upgrade head` on an empty DB failed. All these
migrations are guarded, so the reorder is a no-op on create_all-bootstrapped
databases. Verified: full chain builds a fresh Postgres end-to-end.

## 9. Next phases

1. **Fase 3** — iCal export/import per unit; `ChannelConnection` with last-sync
   state; reconcile with the existing overlap check.
2. **Fase 4** — manual comp-set + pricing alerts (out-of-band price, orphan night,
   low forward occupancy); OTA price push behind an adapter.

See also: `docs/GAP_ANALYSIS_AND_ROADMAP.md`, `AGENTS.md` (§2 ownership boundaries).
