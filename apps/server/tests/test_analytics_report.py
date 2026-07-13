from fastapi.testclient import TestClient

from app.core.auth import create_access_token
from app.main import app

YEAR = 2026
MONTH = 3


def _headers(role: str = "owner", tenant_id: str = "default"):
    token = create_access_token(f"{role}_report_user", role=role, tenant_id=tenant_id)
    return {"Authorization": f"Bearer {token}"}


def test_owner_monthly_report_composes_existing_analytics_endpoints():
    """The report must not recompute business logic: its numbers should be
    identical to what /analytics/month-pnl and /analytics/advanced-kpis
    already return for the same period."""
    with TestClient(app) as client:
        headers = _headers()

        pnl_resp = client.get(
            f"/analytics/month-pnl?year={YEAR}&month={MONTH}", headers=headers
        )
        assert pnl_resp.status_code == 200
        pnl = pnl_resp.json()

        kpi_resp = client.get(
            f"/analytics/advanced-kpis?year={YEAR}&month={MONTH}", headers=headers
        )
        assert kpi_resp.status_code == 200
        kpis = kpi_resp.json()

        report_resp = client.get(
            f"/analytics/report/monthly?year={YEAR}&month={MONTH}", headers=headers
        )
        assert report_resp.status_code == 200
        report = report_resp.json()

        assert report["year"] == YEAR
        assert report["month"] == MONTH
        assert report["nights_total"] == pnl["nights_total"]
        assert report["nights_occupied"] == pnl["nights_occupied"]
        assert report["occupancy_rate"] == pnl["occupancy_rate"]
        assert report["adr"] == pnl["adr"]
        assert report["revenue_total"] == pnl["revenue_total"]
        assert report["revenue_by_source"] == pnl["revenue_by_source"]
        assert report["revenue_by_unit"] == pnl["revenue_by_unit"]
        assert report["costs_total"] == pnl["costs_total"]
        assert report["costs_by_category"] == pnl["costs_by_category"]
        assert report["profit"] == pnl["profit"]
        assert report["revpar"] == kpis["revpar"]


def test_owner_monthly_report_csv_has_header_and_sections():
    with TestClient(app) as client:
        resp = client.get(
            f"/analytics/report/monthly.csv?year={YEAR}&month={MONTH}",
            headers=_headers(),
        )
        assert resp.status_code == 200
        assert "text/csv" in resp.headers.get("content-type", "")
        assert "attachment" in resp.headers.get("content-disposition", "")

        lines = resp.text.splitlines()
        assert lines, "CSV body should not be empty"
        assert lines[0] == "section,metric,value"
        assert any(line.startswith(f"summary,year,{YEAR}") for line in lines)
        assert any(line.startswith(f"summary,month,{MONTH}") for line in lines)
        assert any(line.startswith("summary,revpar,") for line in lines)
        assert any(line.startswith("revenue_by_unit,unit_id,") for line in lines)
        assert any(line.startswith("costs_by_category,category,") for line in lines)
        assert any(line.startswith("revenue_by_source,source,") for line in lines)


def test_owner_monthly_report_readable_by_all_roles():
    with TestClient(app) as client:
        for role in ["owner", "manager", "operator", "viewer"]:
            resp = client.get(
                f"/analytics/report/monthly?year={YEAR}&month={MONTH}",
                headers=_headers(role=role),
            )
            assert resp.status_code == 200, role

            csv_resp = client.get(
                f"/analytics/report/monthly.csv?year={YEAR}&month={MONTH}",
                headers=_headers(role=role),
            )
            assert csv_resp.status_code == 200, role


def test_owner_monthly_report_requires_auth():
    with TestClient(app) as client:
        resp = client.get(f"/analytics/report/monthly?year={YEAR}&month={MONTH}")
        assert resp.status_code == 401
