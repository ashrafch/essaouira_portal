# Revenue Management — Integration Analysis & Roadmap (PriceLabs-like)

Status: **Fase 0 shipped** (rate calendar + booking-status + recommendation engine v1).
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
| Min-stay per date | 🔴 `rate_calendar.min_stay` (stored; enforcement pending) | 0/1 |
| Seasonal profiles, lead-time rules | 🔴 rules engine | 2 |
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

## 5. Recommendation model v1 (transparent)

```
price = base_nightly_rate
if weekday in {Fri, Sat}:      price *= 1.15      # weekend
if portfolio_occupancy >= 0.8: price *= 1.25      # high demand
elif >= 0.6:                   price *= 1.12
elif < 0.3:                    price *= 0.90       # stimulate low-demand dates
```
Portfolio occupancy for a date = share of units with a non-cancelled booking
covering that date. No black box; every recommendation carries its `reason`.

## 6. Next phases

1. **Fase 1** — min-stay enforcement at booking time; manual rate-calendar editor
   on the `Tariffe & Canali` (`Pricing.jsx`) page; min/max price guardrails.
2. **Fase 2** — seasonal profiles, lead-time (last-minute/early-bird/orphan-gap).
3. **Fase 3** — iCal export/import per unit; `ChannelConnection` with last-sync
   state; reconcile with the existing overlap check.
4. **Fase 4** — manual comp-set + pricing alerts (out-of-band price, orphan night,
   low forward occupancy); OTA price push behind an adapter.

See also: `docs/GAP_ANALYSIS_AND_ROADMAP.md`, `AGENTS.md` (§2 ownership boundaries).
