from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session

from app.db import get_db
from app.domains.dashboard.schemas import DashboardSummary
from app.domains.dashboard.service import compute_dashboard_summary

router = APIRouter()


@router.get("/dashboard/summary", response_model=DashboardSummary)
def dashboard_summary(request: Request, db: Session = Depends(get_db)):
    """One lightweight call for sidebar badges / home mission-control.

    Read-only summary; readable by every authenticated role (RBAC treats GET
    requests as safe reads for owner/manager/operator/viewer alike).
    """
    tenant_id = getattr(request.state, "tenant_id", None)
    role = getattr(request.state, "role", None)
    return compute_dashboard_summary(db, tenant_id=tenant_id, role=role)
