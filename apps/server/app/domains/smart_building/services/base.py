"""Shared state and helpers every smart-building module relies on.

Split out of the former single-file ``service.py``; the method bodies are
unchanged. Every module is a mixin combined by ``SmartBuildingService``,
so cross-module ``self`` calls keep working exactly as before.
"""

from __future__ import annotations

import json
from datetime import date, datetime, time, timezone
from decimal import Decimal, InvalidOperation

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.domains.smart_building.providers.factory import get_provider
from app.models.property import Property
from app.models.unit import Unit
from app.models.smart_building import (
    Device,
    SmartProviderConnection,
)


class SmartServiceBase:
    """Shared state and helpers every smart-building module relies on."""

    def __init__(self, db: Session, tenant_id: str, role: str = "owner"):
        self.db = db
        self.tenant_id = tenant_id
        self.role = (role or "owner").strip().lower()

    def _scoped_query(self, model):
        return self.db.query(model).filter(model.tenant_id == self.tenant_id)

    def _get_provider_connection(self, connection_id: int) -> SmartProviderConnection:
        connection = (
            self._scoped_query(SmartProviderConnection)
            .filter(SmartProviderConnection.id == connection_id)
            .first()
        )
        if connection is None:
            raise HTTPException(status_code=404, detail="Provider connection non trovata")
        return connection

    def _require_write_access(self) -> None:
        if self.role in {"operator", "viewer"}:
            raise HTTPException(status_code=403, detail="Permesso insufficiente per modifiche smart")

    def _ensure_unit_visible(self, unit_id: int) -> Unit:
        unit = self.db.query(Unit).filter(Unit.id == unit_id).first()
        if unit is None:
            raise HTTPException(status_code=404, detail="Unita non trovata")
        if self.tenant_id != "default":
            has_device_binding = (
                self._scoped_query(Device).filter(Device.unit_id == unit_id).first()
            )
            if has_device_binding is None:
                raise HTTPException(status_code=404, detail="Unita non trovata")
        return unit

    def _property_or_404(self, property_id: int) -> Property:
        prop = (
            self._scoped_query(Property)
            .filter(Property.id == property_id)
            .first()
        )
        if prop is None:
            raise HTTPException(status_code=404, detail="Property non trovata")
        return prop

    def _provider_instance_for_connection(
        self,
        provider_name: str | None = None,
        connection: SmartProviderConnection | None = None,
    ):
        cfg = {}
        effective_name = provider_name
        if connection is not None:
            effective_name = connection.provider_name
            cfg = self._safe_json_loads(connection.config_json)
            if connection.base_url:
                cfg["base_url"] = connection.base_url
        return get_provider(effective_name, config=cfg)

    def _resolve_connection_for_device_provider(
        self, device: Device
    ) -> SmartProviderConnection | None:
        if device.unit_id is None:
            return None
        unit = self.db.query(Unit).filter(Unit.id == device.unit_id).first()
        if unit is None or unit.property_id is None:
            return None
        return (
            self._scoped_query(SmartProviderConnection)
            .filter(
                SmartProviderConnection.property_id == unit.property_id,
                SmartProviderConnection.provider_name == device.provider,
                SmartProviderConnection.is_active.is_(True),
            )
            .first()
        )

    def _resolve_connection_for_provider(
        self, provider_name: str, property_id: int | None = None
    ) -> SmartProviderConnection | None:
        query = self._scoped_query(SmartProviderConnection).filter(
            SmartProviderConnection.provider_name == provider_name,
            SmartProviderConnection.is_active.is_(True),
        )
        if property_id is not None:
            query = query.filter(SmartProviderConnection.property_id == property_id)
        return query.order_by(SmartProviderConnection.updated_at.desc(), SmartProviderConnection.id.desc()).first()

    def _property_units(self, property_id: int) -> list[Unit]:
        return self.db.query(Unit).filter(Unit.property_id == property_id).order_by(Unit.id.asc()).all()

    def _scope_unit_ids_for_operations(
        self,
        *,
        property_id: int | None,
        unit_id: int | None,
    ) -> set[int] | None:
        if unit_id is not None:
            self._ensure_unit_visible(unit_id)
            return {unit_id}
        if property_id is None:
            return None
        self._property_or_404(property_id)
        scoped_units = self._property_units(property_id)
        return {unit.id for unit in scoped_units}

    def _dedupe_strings(self, values: list[str]) -> list[str]:
        seen: set[str] = set()
        result: list[str] = []
        for value in values:
            clean = str(value or "").strip()
            if not clean or clean in seen:
                continue
            seen.add(clean)
            result.append(clean)
        return result

    def _safe_json_dumps(self, value: dict | None) -> str | None:
        if value is None:
            return None
        return json.dumps(value, ensure_ascii=True, sort_keys=True)

    def _safe_json_loads(self, value: str | None) -> dict:
        if not value:
            return {}
        try:
            parsed = json.loads(value)
        except json.JSONDecodeError:
            return {}
        return parsed if isinstance(parsed, dict) else {}

    def _validate_target_unit(self, target_unit_id: int | None) -> int | None:
        if target_unit_id is None:
            return None
        exists = self.db.query(Unit).filter(Unit.id == target_unit_id).first()
        if exists is None:
            raise HTTPException(status_code=400, detail="Unita target non trovata")
        return target_unit_id

    def _as_utc_datetime(self, value: datetime | None) -> datetime | None:
        if value is None:
            return None
        if value.tzinfo is None:
            return value.replace(tzinfo=timezone.utc)
        return value.astimezone(timezone.utc)

    def _combine_date_time(self, day: date | None, at: time | None = None) -> datetime | None:
        if day is None:
            return None
        base = datetime.combine(day, at or time(hour=0, minute=0, second=0))
        return base.replace(tzinfo=timezone.utc)

    def _require_owner_access(self) -> None:
        if self.role != "owner":
            raise HTTPException(status_code=403, detail="Solo owner puo usare il setup wizard")

    def _to_decimal(self, value) -> Decimal | None:
        if value is None:
            return None
        try:
            return Decimal(str(value))
        except (InvalidOperation, ValueError, TypeError):
            return None
