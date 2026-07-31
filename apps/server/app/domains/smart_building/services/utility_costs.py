"""Consumption into money: what the smart layer adds that Home Assistant cannot.

Home Assistant knows the pool pump ran for 2.4 hours and that unit A1 used
4.2 kWh yesterday. Only the portal can turn that into a cost line that lands in
the monthly P&L next to cleaning and channel fees, split between rental units and
shared areas.

Two honesty rules:

* **Measured, or clearly labelled as estimated.** When a kWh meter exists the
  cost is computed from it. When only runtime exists, the cost is derived from
  the plant's rated power and is flagged ``estimated`` everywhere it appears —
  never silently presented as a reading.
* **Idempotent.** A month can be recomputed any number of times: each scope gets
  one cost item, recognised by a marker in its description and updated in place
  rather than duplicated.
"""

from __future__ import annotations

from calendar import monthrange
from datetime import date, datetime, time, timezone
from decimal import Decimal

from fastapi import HTTPException

from app.models.cost_item import CostItem
from app.models.smart_building import Device, DeviceTelemetry
from app.models.unit import Unit

# Marker that makes generated cost items recognisable and re-updatable.
COST_MARKER = "[smart-utility]"
COST_CATEGORY = "utilities"

# Fallback tariffs, used only when VillaCore does not publish
# `setting.energy_price` (its `input_number.energy_price_per_kwh`).
DEFAULT_ENERGY_PRICE_EUR_KWH = Decimal("0.25")
DEFAULT_WATER_PRICE_EUR_M3 = Decimal("1.50")

ENERGY_CAPABILITIES = ("metric.energy_daily", "metric.energy", "metric.energy_total")
WATER_CAPABILITIES = ("metric.water_volume",)
RUNTIME_CAPABILITIES = ("metric.runtime",)


class UtilityCostsMixin:
    """Monthly utility cost lines derived from building telemetry."""

    # --- tariffs -----------------------------------------------------------
    def _tariff_from_building(self) -> Decimal | None:
        """Energy price published by VillaCore, so there is one source for it."""
        device = self.find_capability_device("setting.energy_price")
        if device is None:
            return None
        raw = self._state_value(device).get("value")
        return self._to_decimal(raw)

    def energy_price_eur_kwh(self) -> tuple[Decimal, str]:
        published = self._tariff_from_building()
        if published is not None and published > 0:
            return published, "villacore"
        return DEFAULT_ENERGY_PRICE_EUR_KWH, "default"

    # --- telemetry aggregation --------------------------------------------
    def _month_bounds(self, year: int, month: int) -> tuple[datetime, datetime, date]:
        if not 1 <= month <= 12:
            raise HTTPException(status_code=400, detail="Mese non valido")
        last_day = monthrange(year, month)[1]
        start = datetime.combine(date(year, month, 1), time.min, tzinfo=timezone.utc)
        end = datetime.combine(date(year, month, last_day), time.max, tzinfo=timezone.utc)
        return start, end, date(year, month, last_day)

    def _daily_counter_total(
        self, device_ids: list[int], metric_type: str, start: datetime, end: datetime
    ) -> Decimal:
        """Sum a daily-reset counter by taking each day's peak.

        VillaCore exposes `sensor.energy_<zone>_daily`, which climbs during the
        day and resets at midnight. The day's maximum is therefore that day's
        consumption; summing the maxima gives the month.
        """
        if not device_ids:
            return Decimal("0")
        samples = (
            self._scoped_query(DeviceTelemetry)
            .filter(
                DeviceTelemetry.device_id.in_(device_ids),
                DeviceTelemetry.metric_type == metric_type,
                DeviceTelemetry.recorded_at >= start,
                DeviceTelemetry.recorded_at <= end,
            )
            .all()
        )
        peak_by_day: dict[tuple[int, date], Decimal] = {}
        for sample in samples:
            recorded_at = self._as_utc_datetime(sample.recorded_at)
            if recorded_at is None:
                continue
            value = self._to_decimal(sample.value)
            if value is None or value < 0:
                continue
            key = (sample.device_id, recorded_at.date())
            current = peak_by_day.get(key)
            if current is None or value > current:
                peak_by_day[key] = value
        return sum(peak_by_day.values(), Decimal("0"))

    def _scope_devices(self, capabilities: tuple[str, ...]) -> dict[tuple[str, int | str], list[int]]:
        """Group metering devices by the scope their cost belongs to."""
        devices = (
            self._scoped_query(Device)
            .filter(Device.capability_key.in_(list(capabilities)))
            .order_by(Device.id.asc())
            .all()
        )
        grouped: dict[tuple[str, int | str], list[int]] = {}
        for device in devices:
            if device.unit_id is not None:
                key = ("unit", device.unit_id)
            elif device.facility_key:
                key = ("facility", device.facility_key)
            else:
                key = ("site", device.zone_key or "site")
            grouped.setdefault(key, []).append(device.id)
        return grouped

    # --- report -----------------------------------------------------------
    def utility_cost_report(self, year: int, month: int) -> dict[str, object]:
        """Consumption and cost per scope for one month. Read-only."""
        start, end, period_end = self._month_bounds(year, month)
        price, price_source = self.energy_price_eur_kwh()

        rows: list[dict[str, object]] = []
        for (scope, scope_ref), device_ids in sorted(
            self._scope_devices(ENERGY_CAPABILITIES).items(), key=lambda item: str(item[0])
        ):
            kwh = self._daily_counter_total(device_ids, "energy", start, end)
            if kwh <= 0:
                continue
            rows.append(
                {
                    "scope": scope,
                    "unit_id": scope_ref if scope == "unit" else None,
                    "facility_key": scope_ref if scope == "facility" else None,
                    "label": self._scope_label(scope, scope_ref),
                    "metric": "energy",
                    "quantity": float(round(kwh, 3)),
                    "unit_of_measure": "kWh",
                    "unit_price": float(price),
                    "amount": float(round(kwh * price, 2)),
                    "estimated": False,
                    "device_count": len(device_ids),
                }
            )

        # Plants with no meter yet: an estimate is better than a blank, as long
        # as it says so. Skipped entirely when the profile declares no rated power.
        metered_facilities = {
            row["facility_key"] for row in rows if row["scope"] == "facility"
        }
        zone_map = self.get_zone_map()
        for (scope, scope_ref), device_ids in self._scope_devices(RUNTIME_CAPABILITIES).items():
            if scope != "facility" or scope_ref in metered_facilities:
                continue
            rated_power_w = (zone_map.get(str(scope_ref)) or {}).get("rated_power_w")
            if not rated_power_w:
                continue
            hours = self._daily_counter_total(device_ids, "runtime", start, end)
            if hours <= 0:
                continue
            kwh = hours * Decimal(str(rated_power_w)) / Decimal("1000")
            rows.append(
                {
                    "scope": scope,
                    "unit_id": None,
                    "facility_key": scope_ref,
                    "label": self._scope_label(scope, scope_ref),
                    "metric": "energy",
                    "quantity": float(round(kwh, 3)),
                    "unit_of_measure": "kWh",
                    "unit_price": float(price),
                    "amount": float(round(kwh * price, 2)),
                    "estimated": True,
                    "estimate_basis": (
                        f"{float(round(hours, 2))} h x {rated_power_w} W (nessun contatore)"
                    ),
                    "device_count": len(device_ids),
                }
            )

        water_rows: list[dict[str, object]] = []
        for (scope, scope_ref), device_ids in self._scope_devices(WATER_CAPABILITIES).items():
            litres = self._daily_counter_total(device_ids, "water_volume", start, end)
            if litres <= 0:
                continue
            cubic_metres = litres / Decimal("1000")
            water_rows.append(
                {
                    "scope": scope,
                    "unit_id": scope_ref if scope == "unit" else None,
                    "facility_key": scope_ref if scope == "facility" else None,
                    "label": self._scope_label(scope, scope_ref),
                    "metric": "water",
                    "quantity": float(round(litres, 1)),
                    "unit_of_measure": "L",
                    "unit_price": float(DEFAULT_WATER_PRICE_EUR_M3),
                    "amount": float(round(cubic_metres * DEFAULT_WATER_PRICE_EUR_M3, 2)),
                    "estimated": False,
                    "device_count": len(device_ids),
                }
            )

        all_rows = rows + water_rows
        return {
            "year": year,
            "month": month,
            "period_end": period_end,
            "energy_price_eur_kwh": float(price),
            "energy_price_source": price_source,
            "rows": all_rows,
            "total_amount": float(round(sum(Decimal(str(r["amount"])) for r in all_rows), 2))
            if all_rows
            else 0.0,
            "has_estimates": any(bool(row.get("estimated")) for row in all_rows),
        }

    def _scope_label(self, scope: str, scope_ref: int | str) -> str:
        if scope == "unit":
            unit = self._unit_by_id(int(scope_ref))
            return unit.name if unit is not None else f"Unita {scope_ref}"
        entry = self.get_zone_map().get(str(scope_ref)) or {}
        return str(entry.get("display_name") or str(scope_ref).title())

    def _unit_by_id(self, unit_id: int) -> Unit | None:
        return self.db.query(Unit).filter(Unit.id == unit_id).first()

    # --- posting ----------------------------------------------------------
    def post_utility_costs(
        self, year: int, month: int, *, requested_by: str | None = None
    ) -> dict[str, object]:
        """Write the month's utility costs as cost items. Safe to re-run."""
        self._require_write_access()
        report = self.utility_cost_report(year, month)
        period_end = report["period_end"]

        created = 0
        updated = 0
        for row in report["rows"]:
            marker = (
                f"{COST_MARKER} {row['metric']}:"
                f"{row['scope']}:{row['facility_key'] or row['unit_id'] or 'site'}"
            )
            description = (
                f"{marker} {row['label']} - {row['quantity']} {row['unit_of_measure']}"
                f" x {row['unit_price']} EUR"
            )
            if row.get("estimated"):
                description += f" (stima: {row.get('estimate_basis', 'nessun contatore')})"

            existing = (
                self.db.query(CostItem)
                .filter(
                    CostItem.date == period_end,
                    CostItem.category == COST_CATEGORY,
                    CostItem.description.like(f"{marker}%"),
                )
                .first()
            )
            if existing is None:
                self.db.add(
                    CostItem(
                        date=period_end,
                        category=COST_CATEGORY,
                        description=description,
                        amount=Decimal(str(row["amount"])),
                        currency="EUR",
                        unit_id=row["unit_id"],
                    )
                )
                created += 1
            else:
                existing.description = description
                existing.amount = Decimal(str(row["amount"]))
                existing.unit_id = row["unit_id"]
                updated += 1

        self.db.commit()
        return {
            "year": year,
            "month": month,
            "period_end": period_end,
            "created": created,
            "updated": updated,
            "total_amount": report["total_amount"],
            "has_estimates": report["has_estimates"],
            "requested_by": requested_by,
        }
