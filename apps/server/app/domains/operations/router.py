from datetime import date
from typing import List

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from app.db import get_db
from app.domains.operations.schemas import (
    CostItemCreate,
    CostItemOut,
    CostItemUpdate,
    MaintenanceCreate,
    MaintenanceOut,
    MaintenanceUpdate,
    PricingDefaultsOut,
    PricingDefaultsUpdate,
    StaffDefaultsOut,
    StaffDefaultsUpdate,
    StaffMemberCreate,
    StaffMemberOut,
    StaffMemberUpdate,
    StaffTaskCreate,
    StaffTaskOut,
    StaffTaskUpdate,
)
from app.domains.operations.service import (
    format_time_value,
    get_or_create_pricing_defaults,
    get_or_create_staff_defaults,
    is_auto_booking_transition_task,
    merge_notes_for_auto_task,
    parse_time_str,
    trigger_smart_reaction_on_staff_task_completion,
)
from app.models.booking import Booking
from app.models.cost_item import CostItem
from app.models.maintenance import MaintenanceTicket
from app.models.staff_member import StaffMember
from app.models.staff_task import StaffTask
from app.models.unit import Unit

router = APIRouter()


# ---------- STAFF TASKS ----------


@router.get("/staff-tasks", response_model=list[StaffTaskOut])
def list_staff_tasks(
    db: Session = Depends(get_db),
    from_date: date | None = None,
    to_date: date | None = None,
    date: date | None = None,
):
    q = db.query(StaffTask).order_by(StaffTask.date)
    if date:
        q = q.filter(StaffTask.date == date)
    else:
        if from_date:
            q = q.filter(StaffTask.date >= from_date)
        if to_date:
            q = q.filter(StaffTask.date <= to_date)

    tasks = q.all()

    # serializziamo noi a dict per controllare bene il campo time
    result: list[dict] = []
    for t in tasks:
        result.append(
            {
                "id": t.id,
                "date": t.date,
                "time": format_time_value(t.time),
                "task_type": t.task_type,
                "assignee_name": t.assignee_name,
                "estimated_hours": t.estimated_hours,
                "status": t.status,
                "notes": t.notes,
                "cost": t.cost,
                "currency": t.currency,
                "booking_id": t.booking_id,
                "unit_id": t.unit_id,
            }
        )
    return result


@router.post("/staff-tasks", response_model=StaffTaskOut)
def create_staff_task(payload: StaffTaskCreate, db: Session = Depends(get_db)):
    # se booking_id è valorizzato, controlla che la prenotazione esista
    if payload.booking_id is not None:
        booking = db.query(Booking).filter(Booking.id == payload.booking_id).first()
        if not booking:
            raise HTTPException(
                status_code=400,
                detail="Prenotazione collegata inesistente (booking_id).",
            )

    # se unit_id è valorizzato, controlla che l'unità esista
    if payload.unit_id is not None:
        unit = db.query(Unit).filter(Unit.id == payload.unit_id).first()
        if not unit:
            raise HTTPException(
                status_code=400,
                detail="Unità collegata inesistente (unit_id).",
            )

    task_time = parse_time_str(payload.time)

    task = StaffTask(
        date=payload.date,
        time=task_time,
        task_type=payload.task_type,
        assignee_name=payload.assignee_name,
        estimated_hours=payload.estimated_hours,
        status=payload.status,
        notes=payload.notes,
        cost=payload.cost,
        currency=payload.currency,
        booking_id=payload.booking_id,
        unit_id=payload.unit_id,
    )
    db.add(task)
    db.commit()
    db.refresh(task)

    return {
        "id": task.id,
        "date": task.date,
        "time": format_time_value(task.time),
        "task_type": task.task_type,
        "assignee_name": task.assignee_name,
        "estimated_hours": task.estimated_hours,
        "status": task.status,
        "notes": task.notes,
        "cost": task.cost,
        "currency": task.currency,
        "booking_id": task.booking_id,
        "unit_id": task.unit_id,
    }


@router.put("/staff-tasks/{task_id}", response_model=StaffTaskOut)
def update_staff_task(
    task_id: int,
    payload: StaffTaskUpdate,
    request: Request,
    db: Session = Depends(get_db),
):
    task = db.query(StaffTask).filter(StaffTask.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task staff non trovato")
    old_status = task.status
    old_notes = task.notes
    was_auto_task = is_auto_booking_transition_task(task)

    if payload.booking_id is not None:
        booking = db.query(Booking).filter(Booking.id == payload.booking_id).first()
        if not booking:
            raise HTTPException(
                status_code=400,
                detail="Prenotazione collegata inesistente (booking_id).",
            )

    if payload.unit_id is not None:
        unit = db.query(Unit).filter(Unit.id == payload.unit_id).first()
        if not unit:
            raise HTTPException(
                status_code=400,
                detail="Unità collegata inesistente (unit_id).",
            )

    task_time = parse_time_str(payload.time)

    task.date = payload.date
    task.time = task_time
    task.task_type = payload.task_type
    task.assignee_name = payload.assignee_name
    task.estimated_hours = payload.estimated_hours
    task.status = payload.status
    if was_auto_task:
        task.notes = merge_notes_for_auto_task(old_notes, payload.notes)
    else:
        task.notes = payload.notes
    task.cost = payload.cost
    task.currency = payload.currency
    task.booking_id = payload.booking_id
    task.unit_id = payload.unit_id

    db.commit()
    db.refresh(task)
    trigger_smart_reaction_on_staff_task_completion(
        request,
        db,
        old_status=old_status,
        was_auto_task=was_auto_task,
        task=task,
    )

    return {
        "id": task.id,
        "date": task.date,
        "time": format_time_value(task.time),
        "task_type": task.task_type,
        "assignee_name": task.assignee_name,
        "estimated_hours": task.estimated_hours,
        "status": task.status,
        "notes": task.notes,
        "cost": task.cost,
        "currency": task.currency,
        "booking_id": task.booking_id,
        "unit_id": task.unit_id,
    }


@router.delete("/staff-tasks/{task_id}", status_code=204)
def delete_staff_task(task_id: int, db: Session = Depends(get_db)):
    task = db.query(StaffTask).filter(StaffTask.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task staff non trovato")

    db.delete(task)
    db.commit()
    return


# ---------- COST ITEMS ----------


@router.get("/cost-items", response_model=list[CostItemOut])
def list_cost_items(
    db: Session = Depends(get_db),
    from_date: date | None = None,
    to_date: date | None = None,
):
    q = db.query(CostItem).order_by(CostItem.date)
    if from_date:
        q = q.filter(CostItem.date >= from_date)
    if to_date:
        q = q.filter(CostItem.date <= to_date)
    return q.all()


@router.post("/cost-items", response_model=CostItemOut)
def create_cost_item(payload: CostItemCreate, db: Session = Depends(get_db)):
    item = CostItem(
        date=payload.date,
        category=payload.category,
        description=payload.description,
        amount=payload.amount,
        currency=payload.currency,
        unit_id=payload.unit_id,
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


@router.put("/cost-items/{item_id}", response_model=CostItemOut)
def update_cost_item(
    item_id: int, payload: CostItemUpdate, db: Session = Depends(get_db)
):
    item = db.query(CostItem).filter(CostItem.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Costo non trovato")

    item.date = payload.date
    item.category = payload.category
    item.description = payload.description
    item.amount = payload.amount
    item.currency = payload.currency
    item.unit_id = payload.unit_id

    db.commit()
    db.refresh(item)
    return item


@router.delete("/cost-items/{item_id}", status_code=204)
def delete_cost_item(item_id: int, db: Session = Depends(get_db)):
    item = db.query(CostItem).filter(CostItem.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Costo non trovato")

    db.delete(item)
    db.commit()
    return item


# ---------- STAFF DEFAULTS (impostazioni automatiche) ----------


@router.get("/staff-defaults", response_model=StaffDefaultsOut)
def get_staff_defaults_endpoint(db: Session = Depends(get_db)):
    defaults = get_or_create_staff_defaults(db)
    return defaults


@router.put("/staff-defaults", response_model=StaffDefaultsOut)
def update_staff_defaults_endpoint(
    payload: StaffDefaultsUpdate, db: Session = Depends(get_db)
):
    defaults = get_or_create_staff_defaults(db)

    if payload.cleaning_default_assignee is not None:
        defaults.cleaning_default_assignee = payload.cleaning_default_assignee
    if payload.cleaning_default_cost is not None:
        defaults.cleaning_default_cost = payload.cleaning_default_cost
    if payload.cleaning_default_hours is not None:
        defaults.cleaning_default_hours = payload.cleaning_default_hours
    if payload.currency is not None:
        defaults.currency = payload.currency

    db.commit()
    db.refresh(defaults)
    return defaults


# ---------- STAFF MEMBERS (ANAGRAFICA) ----------


@router.get("/staff-members", response_model=List[StaffMemberOut])
def list_staff_members(
    db: Session = Depends(get_db),
    active_only: bool = False,
):
    q = db.query(StaffMember)
    if active_only:
        q = q.filter(StaffMember.is_active.is_(True))
    members = q.order_by(StaffMember.name).all()
    return members


@router.post("/staff-members", response_model=StaffMemberOut)
def create_staff_member(
    payload: StaffMemberCreate, db: Session = Depends(get_db)
):
    member = StaffMember(
        name=payload.name,
        role=payload.role.value if payload.role is not None else None,
        color_hex=payload.color_hex,
        hourly_cost=payload.hourly_cost,
        is_active=payload.is_active,
    )
    db.add(member)
    db.commit()
    db.refresh(member)
    return member


@router.put("/staff-members/{member_id}", response_model=StaffMemberOut)
def update_staff_member(
    member_id: int, payload: StaffMemberUpdate, db: Session = Depends(get_db)
):
    member = db.query(StaffMember).filter(StaffMember.id == member_id).first()
    if not member:
        raise HTTPException(status_code=404, detail="Staff member non trovato")

    if payload.name is not None:
        member.name = payload.name
    if payload.role is not None:
        member.role = payload.role.value
    if payload.color_hex is not None:
        member.color_hex = payload.color_hex
    if payload.hourly_cost is not None:
        member.hourly_cost = payload.hourly_cost
    if payload.is_active is not None:
        member.is_active = payload.is_active

    db.commit()
    db.refresh(member)
    return member


@router.delete("/staff-members/{member_id}", status_code=204)
def delete_staff_member(member_id: int, db: Session = Depends(get_db)):
    """Eliminazione definitiva del record staff."""
    member = db.query(StaffMember).filter(StaffMember.id == member_id).first()
    if not member:
        raise HTTPException(status_code=404, detail="Staff member non trovato")

    db.delete(member)
    db.commit()
    return


# ---------- PRICING DEFAULTS ----------


@router.get("/pricing-defaults", response_model=PricingDefaultsOut)
def get_pricing_defaults_endpoint(db: Session = Depends(get_db)):
    pricing = get_or_create_pricing_defaults(db)
    return PricingDefaultsOut(
        default_cleaning_fee=pricing.default_cleaning_fee,
        default_city_tax_per_night=pricing.default_city_tax_per_night,
        default_channel_fee_percent=pricing.default_channel_commission_percent,
        default_currency=pricing.currency,
    )


@router.put("/pricing-defaults", response_model=PricingDefaultsOut)
def update_pricing_defaults_endpoint(
    payload: PricingDefaultsUpdate, db: Session = Depends(get_db)
):
    pricing = get_or_create_pricing_defaults(db)

    if payload.default_cleaning_fee is not None:
        pricing.default_cleaning_fee = payload.default_cleaning_fee
    if payload.default_city_tax_per_night is not None:
        pricing.default_city_tax_per_night = payload.default_city_tax_per_night
    if payload.default_channel_fee_percent is not None:
        pricing.default_channel_commission_percent = (
            payload.default_channel_fee_percent
        )
    if payload.default_currency is not None:
        pricing.currency = payload.default_currency

    db.commit()
    db.refresh(pricing)

    return PricingDefaultsOut(
        default_cleaning_fee=pricing.default_cleaning_fee,
        default_city_tax_per_night=pricing.default_city_tax_per_night,
        default_channel_fee_percent=pricing.default_channel_commission_percent,
        default_currency=pricing.currency,
    )


# ---------- MAINTENANCE (Manutenzioni & Migliorie) ----------


@router.get("/maintenance", response_model=List[MaintenanceOut])
def list_maintenance_tickets(db: Session = Depends(get_db)):
    # Ordina per priorità (o data)
    tickets = db.query(MaintenanceTicket).order_by(MaintenanceTicket.created_at.desc()).all()
    return tickets


@router.post("/maintenance", response_model=MaintenanceOut)
def create_maintenance_ticket(payload: MaintenanceCreate, db: Session = Depends(get_db)):
    # Se unit_id è presente, verifichiamo esista
    if payload.unit_id is not None:
        unit = db.query(Unit).filter(Unit.id == payload.unit_id).first()
        if not unit:
            raise HTTPException(status_code=404, detail="Unit not found")

    ticket = MaintenanceTicket(
        title=payload.title,
        description=payload.description,
        unit_id=payload.unit_id,
        assigned_to_id=payload.assigned_to_id,
        status=payload.status.value,
        priority=payload.priority.value,
        ticket_type=payload.ticket_type.value,
        cost=payload.cost,
        currency=payload.currency
    )
    db.add(ticket)
    db.commit()
    db.refresh(ticket)

    return ticket


@router.put("/maintenance/{ticket_id}", response_model=MaintenanceOut)
def update_maintenance_ticket(ticket_id: int, payload: MaintenanceUpdate, db: Session = Depends(get_db)):
    ticket = db.query(MaintenanceTicket).filter(MaintenanceTicket.id == ticket_id).first()
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")

    if payload.title is not None:
        ticket.title = payload.title
    if payload.description is not None:
        ticket.description = payload.description
    if payload.unit_id is not None:
        ticket.unit_id = payload.unit_id
    if payload.assigned_to_id is not None:
        ticket.assigned_to_id = payload.assigned_to_id
    if payload.status is not None:
        ticket.status = payload.status.value
    if payload.priority is not None:
        ticket.priority = payload.priority.value
    if payload.ticket_type is not None:
        ticket.ticket_type = payload.ticket_type.value
    if payload.cost is not None:
        ticket.cost = payload.cost
    if payload.currency is not None:
        ticket.currency = payload.currency

    db.commit()
    db.refresh(ticket)
    return ticket


@router.delete("/maintenance/{ticket_id}", status_code=204)
def delete_maintenance_ticket(ticket_id: int, db: Session = Depends(get_db)):
    ticket = db.query(MaintenanceTicket).filter(MaintenanceTicket.id == ticket_id).first()
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")
    db.delete(ticket)
    db.commit()
    return
