"""Resumable setup wizard sessions.

Split out of the former single-file ``service.py``; the method bodies are
unchanged. Every module is a mixin combined by ``SmartBuildingService``,
so cross-module ``self`` calls keep working exactly as before.
"""

from __future__ import annotations

from datetime import datetime, timezone

from fastapi import HTTPException

from app.domains.smart_building.providers.factory import get_provider
from app.domains.smart_building.schemas import (
    SetupAssignDevicesIn,
    SetupConnectProviderIn,
    SetupEnableAutomationsIn,
    SetupImportDevicesIn,
    SetupPropertyIn,
    SetupUnitsIn,
)
from app.domains.smart_building.services.constants import SETUP_STEPS
from app.models.property import Property
from app.models.unit import Unit
from app.models.smart_building import (
    Device,
    SetupSession,
    SmartProviderConnection,
)


class SetupMixin:
    """Resumable setup wizard sessions."""

    def _latest_setup_session(self) -> SetupSession | None:
        return (
            self._scoped_query(SetupSession)
            .order_by(SetupSession.created_at.desc(), SetupSession.id.desc())
            .first()
        )

    def _active_setup_session_or_404(self) -> SetupSession:
        session = (
            self._scoped_query(SetupSession)
            .filter(SetupSession.status == "in_progress")
            .order_by(SetupSession.created_at.desc(), SetupSession.id.desc())
            .first()
        )
        if session is None:
            raise HTTPException(status_code=404, detail="Setup session non trovata")
        return session

    def _session_to_dict(self, session: SetupSession) -> dict[str, object]:
        return {
            "id": session.id,
            "tenant_id": session.tenant_id,
            "status": session.status,
            "current_step": session.current_step,
            "metadata": self._safe_json_loads(session.metadata_json),
            "created_at": session.created_at,
            "updated_at": session.updated_at,
            "completed_at": session.completed_at,
        }

    def _update_setup_session(
        self,
        session: SetupSession,
        *,
        current_step: str | None = None,
        status: str | None = None,
        metadata_updates: dict | None = None,
    ) -> SetupSession:
        metadata = self._safe_json_loads(session.metadata_json)
        if metadata_updates:
            metadata.update(metadata_updates)
        if current_step:
            session.current_step = current_step
        if status:
            session.status = status
            if status == "completed":
                session.completed_at = datetime.now(timezone.utc)
        session.metadata_json = self._safe_json_dumps(metadata)
        self.db.commit()
        self.db.refresh(session)
        return session

    def setup_start(self) -> dict[str, object]:
        self._require_owner_access()
        existing = (
            self._scoped_query(SetupSession)
            .filter(SetupSession.status == "in_progress")
            .order_by(SetupSession.created_at.desc(), SetupSession.id.desc())
            .first()
        )
        if existing is not None:
            return {"session": self._session_to_dict(existing)}

        session = SetupSession(
            tenant_id=self.tenant_id,
            status="in_progress",
            current_step=SETUP_STEPS[0],
            metadata_json=self._safe_json_dumps({"steps": list(SETUP_STEPS)}),
        )
        self.db.add(session)
        self.db.commit()
        self.db.refresh(session)
        return {"session": self._session_to_dict(session)}

    def get_setup_session(self) -> dict[str, object] | None:
        self._require_owner_access()
        session = self._latest_setup_session()
        if session is None:
            return None
        return self._session_to_dict(session)

    def setup_property(self, payload: SetupPropertyIn) -> dict[str, object]:
        self._require_owner_access()
        session = self._active_setup_session_or_404()
        code = (
            payload.property_name.strip().lower().replace(" ", "-").replace("--", "-")[:64]
            or f"property-{self.tenant_id}"
        )
        existing = (
            self._scoped_query(Property)
            .filter(Property.code == code)
            .first()
        )
        if existing is None:
            prop = Property(
                tenant_id=self.tenant_id,
                name=payload.property_name.strip(),
                code=code,
                status="active",
                timezone=payload.timezone or "Africa/Casablanca",
                metadata_json=self._safe_json_dumps({"currency": payload.currency or "EUR"}),
                is_active=True,
            )
            self.db.add(prop)
            self.db.commit()
            self.db.refresh(prop)
        else:
            prop = existing
        session = self._update_setup_session(
            session,
            current_step="units",
            metadata_updates={
                "property_name": payload.property_name.strip(),
                "property_id": prop.id,
                "timezone": payload.timezone or "Africa/Casablanca",
                "currency": (payload.currency or "EUR").upper(),
            },
        )
        return self._session_to_dict(session)

    def setup_units(self, payload: SetupUnitsIn) -> dict[str, object]:
        self._require_owner_access()
        session = self._active_setup_session_or_404()
        metadata = self._safe_json_loads(session.metadata_json)
        property_id = payload.property_id or metadata.get("property_id")
        if not property_id:
            raise HTTPException(status_code=400, detail="Step property richiesto prima di creare units")
        created_ids: list[int] = []
        existing_ids: list[int] = []

        for raw_name in payload.units:
            name = (raw_name or "").strip()
            if not name:
                continue
            existing = self.db.query(Unit).filter(Unit.name == name).first()
            if existing is not None:
                if existing.property_id is None:
                    existing.property_id = int(property_id)
                existing_ids.append(existing.id)
                continue
            unit = Unit(name=name, property_id=int(property_id), currency="EUR")
            self.db.add(unit)
            self.db.flush()
            created_ids.append(unit.id)
        self.db.commit()

        all_ids = existing_ids + created_ids
        session = self._update_setup_session(
            session,
            current_step="connect_provider",
            metadata_updates={
                "unit_ids": all_ids,
                "units_created": created_ids,
                "units_existing": existing_ids,
            },
        )
        return self._session_to_dict(session)

    def setup_connect_provider(self, payload: SetupConnectProviderIn) -> dict[str, object]:
        self._require_owner_access()
        session = self._active_setup_session_or_404()
        metadata = self._safe_json_loads(session.metadata_json)
        property_id = payload.property_id or metadata.get("property_id")
        if not property_id:
            raise HTTPException(status_code=400, detail="Property non impostata nel wizard")
        self._property_or_404(int(property_id))
        provider_name = (payload.provider or "").strip().lower()
        if provider_name not in {"mock", "home_assistant", "villacore"}:
            raise HTTPException(status_code=400, detail="Provider non supportato dal setup wizard")
        _ = get_provider(provider_name)
        connection = (
            self._scoped_query(SmartProviderConnection)
            .filter(
                SmartProviderConnection.property_id == int(property_id),
                SmartProviderConnection.provider_name == provider_name,
            )
            .first()
        )
        base_url = str((payload.config or {}).get("base_url", "")).strip() or None
        config_payload = dict(payload.config or {})
        if connection is None:
            connection = SmartProviderConnection(
                tenant_id=self.tenant_id,
                property_id=int(property_id),
                provider_name=provider_name,
                status="connected",
                base_url=base_url,
                config_json=self._safe_json_dumps(config_payload),
                is_active=True,
            )
            self.db.add(connection)
        else:
            connection.status = "connected"
            connection.base_url = base_url
            connection.config_json = self._safe_json_dumps(config_payload)
            connection.is_active = True
            connection.last_error = None
        self.db.commit()
        self.db.refresh(connection)
        session = self._update_setup_session(
            session,
            current_step="import_devices",
            metadata_updates={
                "provider_name": provider_name,
                "provider_connection_id": connection.id,
                "provider_config": payload.config or {},
            },
        )
        return self._session_to_dict(session)

    def setup_import_devices(self, payload: SetupImportDevicesIn) -> dict[str, object]:
        self._require_owner_access()
        session = self._active_setup_session_or_404()
        metadata = self._safe_json_loads(session.metadata_json)
        provider_name = (payload.provider or metadata.get("provider_name") or "mock").strip().lower()
        connection_id = payload.provider_connection_id or metadata.get("provider_connection_id")
        connection = self._get_provider_connection(int(connection_id)) if connection_id else None
        sync_result = self.sync_catalog_from_provider(provider_name, provider_connection=connection)
        imported_devices = (
            self._scoped_query(Device)
            .filter(Device.provider == provider_name)
            .order_by(Device.id.asc())
            .all()
        )
        if connection is not None:
            connection.last_sync_at = datetime.now(timezone.utc)
            connection.status = "connected"
            connection.last_error = None
            self.db.commit()
        session = self._update_setup_session(
            session,
            current_step="assign_devices",
            metadata_updates={
                "provider_name": provider_name,
                "import_result": sync_result,
                "imported_device_ids": [d.id for d in imported_devices],
            },
        )
        return self._session_to_dict(session)

    def setup_assign_devices(self, payload: SetupAssignDevicesIn) -> dict[str, object]:
        self._require_owner_access()
        session = self._active_setup_session_or_404()

        assigned = 0
        skipped_conflict = 0
        invalid = 0
        property_id = payload.property_id or self._safe_json_loads(session.metadata_json).get("property_id")
        for item in payload.assignments or []:
            try:
                device_id = int(item.get("device_id"))
                unit_id = int(item.get("unit_id"))
            except (TypeError, ValueError):
                invalid += 1
                continue
            device = self._scoped_query(Device).filter(Device.id == device_id).first()
            if device is None:
                invalid += 1
                continue
            self._ensure_unit_visible(unit_id)
            if property_id:
                unit = self.db.query(Unit).filter(Unit.id == unit_id).first()
                if unit is not None and unit.property_id not in {None, int(property_id)}:
                    skipped_conflict += 1
                    continue
            if device.unit_id is not None and device.unit_id != unit_id:
                skipped_conflict += 1
                continue
            device.unit_id = unit_id
            assigned += 1
        self.db.commit()

        session = self._update_setup_session(
            session,
            current_step="enable_automations",
            metadata_updates={
                "assignment_result": {
                    "assigned": assigned,
                    "skipped_conflict": skipped_conflict,
                    "invalid": invalid,
                }
            },
        )
        return self._session_to_dict(session)

    def setup_enable_automations(self, payload: SetupEnableAutomationsIn) -> dict[str, object]:
        self._require_owner_access()
        session = self._active_setup_session_or_404()
        property_id = payload.property_id or self._safe_json_loads(session.metadata_json).get("property_id")
        if not property_id:
            raise HTTPException(status_code=400, detail="Property non impostata nel setup wizard")
        self._property_or_404(int(property_id))
        templates = payload.templates or []
        if not templates:
            templates = ["basic_hospitality_pack"]
        results = [
            self._enable_template(
                template,
                property_id=int(property_id),
                installed_by="setup_wizard",
            )
            for template in templates
        ]
        session = self._update_setup_session(
            session,
            current_step="complete",
            metadata_updates={
                "automation_templates": [r["template"] for r in results],
                "automation_result": results,
            },
        )
        return self._session_to_dict(session)

    def setup_complete(self) -> dict[str, object]:
        self._require_owner_access()
        session = self._active_setup_session_or_404()
        session = self._update_setup_session(session, current_step="complete", status="completed")
        return self._session_to_dict(session)
