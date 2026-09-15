"""Task provenance and missing property foreign keys.

Revision ID: 0016_management_safety
Revises: 0015_smart_capability_mapping

Legacy AUTO tasks are recognized only by the former generator's exact labels,
booking/unit relationship and scheduled date. Unknown or ambiguous tasks stay
manual; they must never acquire authority merely from an AUTO prefix.
"""

from alembic import op
import sqlalchemy as sa

revision = "0016_management_safety"
down_revision = "0015_smart_capability_mapping"
branch_labels = None
depends_on = None


def upgrade():
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    columns = {col["name"] for col in inspector.get_columns("staff_tasks")}
    if "auto_key" not in columns:
        op.add_column("staff_tasks", sa.Column("auto_key", sa.String(64), nullable=True))
        tasks = bind.execute(sa.text(
            "SELECT t.id, t.booking_id, t.task_type, t.date, t.notes, "
            "b.checkin_date, b.checkout_date FROM staff_tasks t "
            "JOIN bookings b ON b.id=t.booking_id AND b.unit_id=t.unit_id "
            "WHERE t.notes LIKE 'AUTO:%' ORDER BY t.id"
        )).mappings()
        seen = set()
        for task in tasks:
            label = task["notes"].split(" | ", 1)[0]
            suffix = f" per prenotazione #{task['booking_id']}"
            key = None
            if label == "AUTO: Check-in" + suffix and task["date"] == task["checkin_date"]:
                key = "checkin"
            elif label in {"AUTO: Check-out" + suffix, "AUTO: Check-out (late)" + suffix} and task["date"] == task["checkout_date"]:
                key = "checkout"
            elif label in {"AUTO: Pulizia" + suffix, "AUTO: Pulizia post late check-out" + suffix} and task["date"] == task["checkout_date"]:
                key = "cleaning"
            elif label == "AUTO: Extra pulizia (late check-out)" + suffix and task["date"] == task["checkout_date"]:
                key = "extra_cleaning"
            elif label == "AUTO: Colazione" + suffix and task["checkin_date"] < task["date"] < task["checkout_date"]:
                key = f"breakfast:{task['date']}"
            expected_type = "cleaning" if key == "extra_cleaning" else "breakfast" if key and key.startswith("breakfast:") else key
            identity = (task["booking_id"], key)
            if key and task["task_type"] == expected_type and identity not in seen:
                bind.execute(sa.text("UPDATE staff_tasks SET auto_key=:key WHERE id=:id"), {"key": key, "id": task["id"]})
                seen.add(identity)
    constraints = {c["name"] for c in sa.inspect(bind).get_unique_constraints("staff_tasks")}
    if "uq_staff_task_booking_auto_key" not in constraints:
        with op.batch_alter_table("staff_tasks") as batch:
            batch.create_unique_constraint("uq_staff_task_booking_auto_key", ["booking_id", "auto_key"])

    for table in ("units", "smart_provider_connections"):
        fks = sa.inspect(bind).get_foreign_keys(table)
        if not any(fk["constrained_columns"] == ["property_id"] and fk["referred_table"] == "properties" for fk in fks):
            # Do not silently drop or repair orphaned production data.
            orphan = bind.execute(sa.text(
                f"SELECT 1 FROM {table} t LEFT JOIN properties p ON p.id=t.property_id "
                "WHERE t.property_id IS NOT NULL AND p.id IS NULL LIMIT 1"
            )).first()
            if orphan:
                raise RuntimeError(f"Orphan property_id in {table}; repair before migrating")
            with op.batch_alter_table(table) as batch:
                batch.create_foreign_key(f"fk_{table}_property_id", "properties", ["property_id"], ["id"])


def downgrade():
    for table in ("smart_provider_connections", "units"):
        name = f"fk_{table}_property_id"
        if any(fk["name"] == name for fk in sa.inspect(op.get_bind()).get_foreign_keys(table)):
            with op.batch_alter_table(table) as batch:
                batch.drop_constraint(name, type_="foreignkey")
    with op.batch_alter_table("staff_tasks") as batch:
        batch.drop_constraint("uq_staff_task_booking_auto_key", type_="unique")
        batch.drop_column("auto_key")
