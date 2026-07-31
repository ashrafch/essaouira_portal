"""Operational alerts raised from devices, rules and telemetry.

Split out of the former single-file ``service.py``; the method bodies are
unchanged. Every module is a mixin combined by ``SmartBuildingService``,
so cross-module ``self`` calls keep working exactly as before.
"""

from __future__ import annotations

from datetime import datetime, timezone

from fastapi import HTTPException

from app.domains.smart_building.taxonomy import normalize_alert_type
from app.domains.smart_building.schemas import AlertCreate
from app.models.smart_building import Alert


class AlertsMixin:
    """Operational alerts raised from devices, rules and telemetry."""

    def list_alerts(self, status: str | None = None) -> list[Alert]:
        query = self._scoped_query(Alert).order_by(Alert.last_seen_at.desc())
        if status:
            query = query.filter(Alert.status == status)
        return query.all()

    def list_alerts_with_freshness(self, status: str | None = None) -> list[dict[str, object]]:
        rows = self.list_alerts(status=status)
        now = datetime.now(timezone.utc)
        payload: list[dict[str, object]] = []
        for alert in rows:
            last_updated = self._as_utc_datetime(alert.last_seen_at or alert.first_seen_at)
            payload.append(
                {
                    "id": alert.id,
                    "tenant_id": alert.tenant_id,
                    "unit_id": alert.unit_id,
                    "device_id": alert.device_id,
                    "alert_type": alert.alert_type,
                    "severity": alert.severity,
                    "status": alert.status,
                    "title": alert.title,
                    "description": alert.description,
                    "correlation_id": alert.correlation_id,
                    "first_seen_at": alert.first_seen_at,
                    "last_seen_at": alert.last_seen_at,
                    "acknowledged_by": alert.acknowledged_by,
                    "resolved_at": alert.resolved_at,
                    "last_updated_at": last_updated,
                    "data_freshness_status": self._compute_data_freshness(last_updated, now=now),
                }
            )
        return payload

    def create_alert(
        self,
        payload: AlertCreate,
        correlation_id: str | None = None,
        *,
        trigger_rules: bool = True,
        trigger_source: str = "api.smart",
        requested_by: str | None = None,
    ) -> Alert:
        self._require_write_access()
        if payload.device_id is not None:
            self.get_device_or_404(payload.device_id)
        normalized_alert_type = normalize_alert_type(payload.alert_type)
        alert = Alert(
            tenant_id=self.tenant_id,
            unit_id=payload.unit_id,
            device_id=payload.device_id,
            alert_type=normalized_alert_type,
            severity=payload.severity,
            title=payload.title,
            description=payload.description,
            correlation_id=correlation_id,
            status="open",
        )
        self.db.add(alert)
        self.db.commit()
        self.db.refresh(alert)
        if trigger_rules:
            self.trigger_rules_for_business_event(
                trigger_type="alert.raised",
                trigger_source=trigger_source,
                context={
                    "alert_id": alert.id,
                    "unit_id": alert.unit_id,
                    "device_id": alert.device_id,
                    "alert_type": alert.alert_type,
                },
                requested_by=requested_by,
                correlation_id=correlation_id,
            )
        return alert

    def acknowledge_alert(self, alert_id: int, username: str) -> Alert:
        self._require_write_access()
        alert = self._scoped_query(Alert).filter(Alert.id == alert_id).first()
        if alert is None:
            raise HTTPException(status_code=404, detail="Alert non trovato")
        alert.status = "acknowledged"
        alert.acknowledged_by = username
        alert.last_seen_at = datetime.now(timezone.utc)
        self.db.commit()
        self.db.refresh(alert)
        return alert
