#!/usr/bin/env python3
"""Reset the smart-building layer, leaving PMS data untouched.

Use this after changing building platform, or to clear the residue of an earlier
integration (a decommissioned Home Assistant, a wizard run that created the wrong
structure). It removes what the portal *derived* from the building and keeps what
the business owns.

Deleted:
    devices and everything hanging off them (states, events, alerts, commands,
    telemetry, telemetry insights), provider connections, scenario pack installs,
    setup sessions, and optionally scenes / automation rules / executions.

Never touched:
    bookings, staff tasks, maintenance tickets, cost items, rate calendar, users.

Units and properties are never guessed at: pass --drop-unit / --drop-property
explicitly, and the script still refuses when a unit carries bookings, staff
tasks, maintenance tickets or cost items, or when a property would keep units.

--wipe-business removes that operational data too (bookings, staff tasks,
maintenance, cost items, rate calendar, channels, market rates, revenue rules).
It exists for one purpose: emptying a demo or simulation database before building
the real structure. On a live property it destroys the business record, so it
always prints exactly what it will remove and needs --yes like everything else.

Dry run by default: it prints the plan and changes nothing until --yes.

    python scripts/reset_smart_layer.py                        # show the plan
    python scripts/reset_smart_layer.py --yes                  # apply
    python scripts/reset_smart_layer.py --yes --provider home_assistant
    python scripts/reset_smart_layer.py --yes --drop-unit 7 --drop-property 2
    python scripts/reset_smart_layer.py --yes --wipe-business --drop-all-units \
        --drop-all-properties          # empty a simulation database completely

Note: with AUTO_SEED_DATA=true the backend recreates the demo units and the
default property at the next start. Set it to false in .env first, or the clean
slate lasts until the next restart.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

# Allow running the script directly from the repository root.
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "apps" / "server"))

from sqlalchemy import func  # noqa: E402
from sqlalchemy.orm import Session  # noqa: E402

import app.models  # noqa: F401,E402  (register every model on Base.metadata)
from app.db import SessionLocal  # noqa: E402
from app.models.booking import Booking  # noqa: E402
from app.models.channel_connection import ChannelConnection  # noqa: E402
from app.models.cost_item import CostItem  # noqa: E402
from app.models.maintenance import MaintenanceTicket  # noqa: E402
from app.models.market_rate import MarketRate  # noqa: E402
from app.models.property import Property  # noqa: E402
from app.models.rate_calendar import RateCalendar  # noqa: E402
from app.models.revenue_rules import LeadTimeRule, PricingSeason  # noqa: E402
from app.models.smart_building import (  # noqa: E402
    Alert,
    AutomationExecution,
    AutomationRule,
    Device,
    DeviceCommand,
    DeviceEvent,
    DeviceState,
    DeviceTelemetry,
    Scene,
    SceneAction,
    SetupSession,
    SmartProviderConnection,
    SmartScenarioPackInstall,
    TelemetryInsight,
)
from app.models.staff_task import StaffTask  # noqa: E402
from app.models.unit import Unit  # noqa: E402


def step(message: str) -> None:
    print(f"==> {message}")


def line(message: str) -> None:
    print(f"    {message}")


# Deleted in this order so a row is never orphaned mid-way.
DEVICE_SCOPED = (
    ("telemetry insights", TelemetryInsight),
    ("telemetry samples", DeviceTelemetry),
    ("device commands", DeviceCommand),
    ("alerts", Alert),
    ("device events", DeviceEvent),
    ("device states", DeviceState),
)
AUTOMATION_SCOPED = (
    ("automation executions", AutomationExecution),
    ("scene actions", SceneAction),
    ("automation rules", AutomationRule),
    ("scenes", Scene),
)
# Business/operational tables, only touched with --wipe-business. Ordered so a
# child row never outlives the parent it points at.
BUSINESS_SCOPED = (
    ("rate calendar entries", RateCalendar),
    ("channel connections", ChannelConnection),
    ("market rates", MarketRate),
    ("lead-time rules", LeadTimeRule),
    ("pricing seasons", PricingSeason),
    ("staff tasks", StaffTask),
    ("cost items", CostItem),
    ("maintenance tickets", MaintenanceTicket),
    ("bookings", Booking),
)


def count(db: Session, model, **filters) -> int:
    query = db.query(func.count()).select_from(model)
    for attribute, value in filters.items():
        query = query.filter(getattr(model, attribute) == value)
    return query.scalar() or 0


def unit_references(db: Session, unit_id: int) -> dict[str, int]:
    return {
        "prenotazioni": count(db, Booking, unit_id=unit_id),
        "task staff": count(db, StaffTask, unit_id=unit_id),
        "manutenzioni": count(db, MaintenanceTicket, unit_id=unit_id),
        "voci di costo": count(db, CostItem, unit_id=unit_id),
    }


def main() -> int:
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    parser.add_argument("--yes", action="store_true", help="actually apply the changes")
    parser.add_argument(
        "--provider",
        default="",
        help="limit device deletion to one provider (default: every provider)",
    )
    parser.add_argument(
        "--keep-automations",
        action="store_true",
        help="keep scenes, automation rules and their executions",
    )
    parser.add_argument(
        "--drop-unit",
        type=int,
        action="append",
        default=[],
        metavar="ID",
        help="delete this unit (repeatable). Refused if the business still references it",
    )
    parser.add_argument(
        "--drop-property",
        type=int,
        action="append",
        default=[],
        metavar="ID",
        help="delete this property (repeatable). Refused if it would keep units",
    )
    parser.add_argument(
        "--drop-all-units",
        action="store_true",
        help="target every unit (still refused unless nothing references them)",
    )
    parser.add_argument(
        "--drop-all-properties",
        action="store_true",
        help="target every property",
    )
    parser.add_argument(
        "--wipe-business",
        action="store_true",
        help=(
            "DESTRUCTIVE: also delete bookings, staff tasks, maintenance, cost items, "
            "rate calendar, channels, market rates and revenue rules. For demo or "
            "simulation databases only"
        ),
    )
    args = parser.parse_args()

    provider = args.provider.strip().lower()
    db: Session = SessionLocal()
    applied = not args.yes

    try:
        step("Current state")
        total_devices = count(db, Device)
        line(f"devices: {total_devices}")
        by_provider: dict[str, int] = {}
        for device in db.query(Device).all():
            key = (device.provider or "?").strip().lower()
            by_provider[key] = by_provider.get(key, 0) + 1
        for name, number in sorted(by_provider.items()):
            marker = "  <- selected" if provider and name == provider else ""
            line(f"  provider {name}: {number}{marker}")
        line(f"provider connections: {count(db, SmartProviderConnection)}")
        line(f"setup sessions: {count(db, SetupSession)}")
        line(f"scenario packs: {count(db, SmartScenarioPackInstall)}")
        line(f"scenes: {count(db, Scene)} | automation rules: {count(db, AutomationRule)}")
        print()

        device_query = db.query(Device)
        if provider:
            device_query = device_query.filter(func.lower(Device.provider) == provider)
        device_ids = [device.id for device in device_query.all()]

        step("Plan")
        line(f"delete {len(device_ids)} devices" + (f" (provider {provider})" if provider else ""))
        for label, model in DEVICE_SCOPED:
            if device_ids:
                affected = (
                    db.query(func.count())
                    .select_from(model)
                    .filter(model.device_id.in_(device_ids))
                    .scalar()
                    or 0
                )
            else:
                affected = 0
            line(f"delete {affected} {label}")
        line(f"delete {count(db, SmartProviderConnection)} provider connections")
        line(f"delete {count(db, SetupSession)} setup sessions")
        line(f"delete {count(db, SmartScenarioPackInstall)} scenario pack installs")
        if args.keep_automations:
            line("keep scenes and automation rules")
        else:
            for label, model in AUTOMATION_SCOPED:
                line(f"delete {count(db, model)} {label}")

        # --- optional business wipe (simulation databases) ---------------------
        if args.wipe_business:
            step("Business data to remove (--wipe-business)")
            for label, model in BUSINESS_SCOPED:
                line(f"delete {count(db, model)} {label}")
            line("this is the operational record: only do it on a demo/simulation database")
            print()

        # --- explicit PMS deletions, validated ---------------------------------
        drop_units: list[Unit] = []
        drop_properties: list[Property] = []
        refusals: list[str] = []

        unit_targets = list(args.drop_unit)
        if args.drop_all_units:
            unit_targets = [unit.id for unit in db.query(Unit).order_by(Unit.id.asc()).all()]
        property_targets = list(args.drop_property)
        if args.drop_all_properties:
            property_targets = [
                prop.id for prop in db.query(Property).order_by(Property.id.asc()).all()
            ]

        for unit_id in dict.fromkeys(unit_targets):
            unit = db.query(Unit).filter(Unit.id == unit_id).first()
            if unit is None:
                refusals.append(f"unit #{unit_id} does not exist")
                continue
            references = {k: v for k, v in unit_references(db, unit.id).items() if v}
            if references and not args.wipe_business:
                detail = ", ".join(f"{v} {k}" for k, v in references.items())
                refusals.append(f"unit #{unit_id} '{unit.name}' is still referenced: {detail}")
                continue
            drop_units.append(unit)

        dropped_unit_ids = {unit.id for unit in drop_units}
        for property_id in dict.fromkeys(property_targets):
            prop = db.query(Property).filter(Property.id == property_id).first()
            if prop is None:
                refusals.append(f"property #{property_id} does not exist")
                continue
            remaining = [
                unit
                for unit in db.query(Unit).filter(Unit.property_id == prop.id).all()
                if unit.id not in dropped_unit_ids
            ]
            if remaining:
                names = ", ".join(f"#{u.id} '{u.name}'" for u in remaining)
                refusals.append(
                    f"property #{property_id} '{prop.name}' would keep units: {names}"
                )
                continue
            drop_properties.append(prop)

        if drop_units:
            line("delete units (explicitly requested):")
            for unit in drop_units:
                line(f"  - #{unit.id} '{unit.name}'")
        if drop_properties:
            line("delete properties (explicitly requested):")
            for prop in drop_properties:
                line(f"  - #{prop.id} '{prop.name}'")

        if refusals:
            print()
            step("Refused")
            for refusal in refusals:
                line(f"  {refusal}")
            print()
            print("    X   nothing was changed: resolve the refusals or drop them from the command",
                  file=sys.stderr)
            return 1

        print()
        if not args.yes:
            step("Dry run: nothing was changed")
            line("re-run with --yes to apply")
            return 0

        step("Applying")
        for label, model in DEVICE_SCOPED:
            if not device_ids:
                continue
            deleted = (
                db.query(model)
                .filter(model.device_id.in_(device_ids))
                .delete(synchronize_session=False)
            )
            line(f"deleted {deleted} {label}")

        if not args.keep_automations:
            # Alerts and events created by automations may reference no device at
            # all, so clear the automation tables wholesale.
            for label, model in AUTOMATION_SCOPED:
                deleted = db.query(model).delete(synchronize_session=False)
                line(f"deleted {deleted} {label}")
            deleted = db.query(Alert).delete(synchronize_session=False)
            line(f"deleted {deleted} remaining alerts")

        if device_ids:
            deleted = (
                db.query(Device).filter(Device.id.in_(device_ids)).delete(synchronize_session=False)
            )
            line(f"deleted {deleted} devices")

        deleted = db.query(SmartScenarioPackInstall).delete(synchronize_session=False)
        line(f"deleted {deleted} scenario pack installs")
        deleted = db.query(SetupSession).delete(synchronize_session=False)
        line(f"deleted {deleted} setup sessions")
        deleted = db.query(SmartProviderConnection).delete(synchronize_session=False)
        line(f"deleted {deleted} provider connections")

        if args.wipe_business:
            for label, model in BUSINESS_SCOPED:
                deleted = db.query(model).delete(synchronize_session=False)
                line(f"deleted {deleted} {label}")
            db.flush()

        for unit in drop_units:
            db.delete(unit)
        if drop_units:
            # There is no ORM relationship between Unit and Property, so
            # SQLAlchemy cannot infer that units must go first. Flush explicitly
            # or the property delete hits units_property_id_fkey.
            db.flush()
            line(f"deleted {len(drop_units)} units")
        for prop in drop_properties:
            db.delete(prop)
        if drop_properties:
            db.flush()
            line(f"deleted {len(drop_properties)} properties")

        db.commit()
        applied = True
        print()
        step("Done")
        line("Next: open the Setup Wizard in the portal and follow the guided steps.")
        return 0
    except Exception as exc:  # noqa: BLE001 - a reset must never half-commit silently
        db.rollback()
        print(f"    X   reset failed, nothing was committed: {exc}", file=sys.stderr)
        return 1
    finally:
        if not applied:
            db.rollback()
        db.close()


if __name__ == "__main__":
    sys.exit(main())
