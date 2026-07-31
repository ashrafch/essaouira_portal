"""Device command validation and lifecycle.

Split out of the former single-file ``service.py``; the method bodies are
unchanged. Every module is a mixin combined by ``SmartBuildingService``,
so cross-module ``self`` calls keep working exactly as before.
"""

from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException

from app.domains.smart_building.providers.base import ProviderCommandRequest
from app.domains.smart_building.taxonomy import (
    CANONICAL_COMMAND_TYPES,
    normalize_command_type,
)
from app.domains.smart_building.schemas import (
    DeviceCommandCreate,
    DeviceEventCreate,
)
from app.domains.smart_building.services.constants import (
    SUPPORTED_COMMAND_STATUSES,
    POWER_CATEGORIES,
    CLIMATE_CATEGORIES,
    COVER_CATEGORIES,
    FLAG_CATEGORIES,
    LOCK_CATEGORIES,
    NUMBER_CATEGORIES,
    SCENE_CATEGORIES,
    SCRIPT_CATEGORIES,
    SELECT_CATEGORIES,
    TEXT_CATEGORIES,
)
from app.models.smart_building import DeviceCommand


class CommandsMixin:
    """Device command validation and lifecycle."""

    def get_device_command_or_404(self, device_id: int, command_id: int) -> DeviceCommand:
        self.get_device_or_404(device_id)
        command = (
            self._scoped_query(DeviceCommand)
            .filter(DeviceCommand.id == command_id, DeviceCommand.device_id == device_id)
            .first()
        )
        if command is None:
            raise HTTPException(status_code=404, detail="Comando device non trovato")
        return command

    def _allowed_commands_for_category(self, category: str) -> set[str]:
        normalized = (category or "").strip().lower()
        if normalized in POWER_CATEGORIES:
            return {"device.power.on", "device.power.off"}
        if normalized in CLIMATE_CATEGORIES:
            return {
                "device.climate.set_mode",
                "device.climate.set_setpoint",
                "device.climate.set_power",
            }
        if normalized in LOCK_CATEGORIES:
            return {"device.lock.set_state"}
        if normalized in COVER_CATEGORIES:
            return {"device.cover.set_state"}
        if normalized in SCRIPT_CATEGORIES:
            return {"device.script.run"}
        if normalized in SCENE_CATEGORIES:
            return {"device.scene.apply"}
        if normalized in SELECT_CATEGORIES:
            return {"device.select.set_option"}
        if normalized in NUMBER_CATEGORIES:
            return {"device.number.set_value"}
        if normalized in TEXT_CATEGORIES:
            return {"device.text.set_value"}
        if normalized in FLAG_CATEGORIES:
            return {"device.boolean.set_state"}
        return set()

    def _validate_command_payload(self, command_type: str, payload: dict) -> dict:
        if command_type in {"device.power.on", "device.power.off"}:
            return {}
        if command_type == "device.climate.set_mode":
            mode = str((payload or {}).get("mode", "")).strip().lower()
            if mode not in {"off", "heat", "cool", "eco", "auto"}:
                raise HTTPException(status_code=400, detail="device.climate.set_mode richiede mode valido")
            return {"mode": mode}
        if command_type == "device.climate.set_setpoint":
            try:
                setpoint_c = float((payload or {}).get("setpoint_c"))
            except (TypeError, ValueError):
                raise HTTPException(
                    status_code=400,
                    detail="device.climate.set_setpoint richiede setpoint_c numerico",
                )
            return {"setpoint_c": round(setpoint_c, 2)}
        if command_type == "device.lock.set_state":
            target = str((payload or {}).get("target", "")).strip().lower()
            if target not in {"lock", "unlock"}:
                raise HTTPException(
                    status_code=400,
                    detail="device.lock.set_state richiede target lock|unlock",
                )
            return {"target": target}
        if command_type == "device.climate.set_power":
            target = str((payload or {}).get("target", "")).strip().lower()
            if target not in {"on", "off"}:
                raise HTTPException(
                    status_code=400,
                    detail="device.climate.set_power richiede target on|off",
                )
            return {"target": target}
        if command_type == "device.cover.set_state":
            target = str((payload or {}).get("target", "")).strip().lower()
            if target not in {"open", "close", "stop"}:
                raise HTTPException(
                    status_code=400,
                    detail="device.cover.set_state richiede target open|close|stop",
                )
            return {"target": target}
        if command_type == "device.boolean.set_state":
            target = str((payload or {}).get("target", "")).strip().lower()
            if target not in {"on", "off"}:
                raise HTTPException(
                    status_code=400,
                    detail="device.boolean.set_state richiede target on|off",
                )
            return {"target": target}
        if command_type == "device.script.run":
            variables = (payload or {}).get("variables") or {}
            if not isinstance(variables, dict):
                raise HTTPException(
                    status_code=400,
                    detail="device.script.run accetta variables come oggetto",
                )
            # Only scalars: a script field cannot take a nested structure, and
            # this keeps the audit payload readable.
            cleaned: dict[str, object] = {}
            for key, value in variables.items():
                name = str(key).strip()
                if not name:
                    continue
                if value is None or isinstance(value, (str, int, float, bool)):
                    cleaned[name] = value
                else:
                    raise HTTPException(
                        status_code=400,
                        detail=f"variables.{name} deve essere un valore semplice",
                    )
            return {"variables": cleaned} if cleaned else {}
        if command_type == "device.scene.apply":
            return {}
        if command_type == "device.select.set_option":
            option = str((payload or {}).get("option", "")).strip()
            if not option:
                raise HTTPException(
                    status_code=400,
                    detail="device.select.set_option richiede option",
                )
            return {"option": option}
        if command_type == "device.number.set_value":
            try:
                value = float((payload or {}).get("value"))
            except (TypeError, ValueError):
                raise HTTPException(
                    status_code=400,
                    detail="device.number.set_value richiede value numerico",
                )
            return {"value": round(value, 4)}
        if command_type == "device.text.set_value":
            value = (payload or {}).get("value")
            if not isinstance(value, str) or not value.strip():
                raise HTTPException(
                    status_code=400,
                    detail="device.text.set_value richiede value testuale",
                )
            return {"value": value.strip()[:255]}
        raise HTTPException(status_code=400, detail="Tipo comando non supportato")

    def list_device_commands(
        self, device_id: int, status: str | None = None, limit: int = 50
    ) -> list[DeviceCommand]:
        self.get_device_or_404(device_id)
        query = self._scoped_query(DeviceCommand).filter(DeviceCommand.device_id == device_id)
        if status:
            normalized = status.strip().lower()
            if normalized not in SUPPORTED_COMMAND_STATUSES:
                raise HTTPException(status_code=400, detail="Status comando non valido")
            query = query.filter(DeviceCommand.status == normalized)
        query = query.order_by(DeviceCommand.requested_at.desc(), DeviceCommand.id.desc())
        return query.limit(max(1, min(limit, 200))).all()

    def create_device_command(
        self,
        device_id: int,
        payload: DeviceCommandCreate,
        requested_by: str | None = None,
        correlation_id: str | None = None,
    ) -> DeviceCommand:
        self._require_write_access()
        device = self.get_device_or_404(device_id)
        try:
            command_type = normalize_command_type(payload.command_type)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail="Tipo comando non supportato") from exc
        if command_type not in CANONICAL_COMMAND_TYPES:
            raise HTTPException(status_code=400, detail="Tipo comando non supportato")
        allowed = self._allowed_commands_for_category(device.category)
        if command_type not in allowed:
            raise HTTPException(
                status_code=400,
                detail=f"Comando '{command_type}' non supportato per categoria '{device.category}'",
            )

        normalized_payload = self._validate_command_payload(command_type, payload.payload or {})
        now = datetime.now(timezone.utc)
        expires_at = now + timedelta(seconds=payload.ttl_seconds or 300)
        command = DeviceCommand(
            tenant_id=self.tenant_id,
            device_id=device.id,
            unit_id=device.unit_id,
            provider=device.provider,
            command_type=command_type,
            payload_json=json.dumps(normalized_payload, ensure_ascii=True),
            correlation_id=correlation_id,
            status="pending",
            requested_by=requested_by or "system",
            requested_at=now,
            expires_at=expires_at,
        )
        self.db.add(command)
        self.db.commit()
        self.db.refresh(command)

        self.create_device_event(
            device_id=device.id,
            payload=DeviceEventCreate(
                event_type="device.command.requested",
                severity="info",
                source="api",
                payload_json=json.dumps(
                    {
                        "command_id": command.id,
                        "command_type": command.command_type,
                        "requested_by": command.requested_by,
                        "correlation_id": correlation_id,
                    },
                    ensure_ascii=True,
                ),
            ),
        )

        provider = self._provider_instance_for_connection(
            device.provider,
            self._resolve_connection_for_device_provider(device),
        )
        if not getattr(provider, "supports_command_execution", False):
            command.status = "failed"
            command.failed_at = datetime.now(timezone.utc)
            command.error_message = "Provider command execution not supported"
            self.db.commit()
            self.db.refresh(command)
            self.create_device_event(
                device_id=device.id,
                payload=DeviceEventCreate(
                    event_type="device.command.failed",
                    severity="warning",
                    source=device.provider,
                    payload_json=json.dumps(
                        {
                            "command_id": command.id,
                            "reason": command.error_message,
                            "correlation_id": correlation_id,
                        },
                        ensure_ascii=True,
                    ),
                ),
            )
            return command

        result = provider.execute_command(
            ProviderCommandRequest(
                external_id=device.external_id,
                command_type=command.command_type,
                payload=normalized_payload,
                requested_by=command.requested_by,
                tenant_id=self.tenant_id,
            )
        )
        lifecycle_status = (result.lifecycle_status or "").strip().lower()
        if lifecycle_status not in SUPPORTED_COMMAND_STATUSES:
            lifecycle_status = "failed"

        command.status = lifecycle_status
        command.provider_ref = result.provider_ref
        command.result_json = (
            json.dumps(result.result_payload, ensure_ascii=True) if result.result_payload is not None else None
        )
        command.error_message = result.error_message

        transition_time = datetime.now(timezone.utc)
        if result.accepted:
            command.accepted_at = transition_time
        if lifecycle_status == "executed":
            command.executed_at = transition_time
        elif lifecycle_status == "failed":
            command.failed_at = transition_time
        elif lifecycle_status == "expired":
            command.expired_at = transition_time

        if lifecycle_status in {"accepted", "pending"} and command.expires_at and command.expires_at <= transition_time:
            command.status = "expired"
            command.expired_at = transition_time

        self.db.commit()
        self.db.refresh(command)

        outcome_event_type = (
            "device.command.executed"
            if command.status == "executed"
            else "device.command.failed"
            if command.status == "failed"
            else "device.command.expired"
            if command.status == "expired"
            else "device.command.accepted"
        )
        outcome_severity = "warning" if command.status in {"failed", "expired"} else "info"
        self.create_device_event(
            device_id=device.id,
            payload=DeviceEventCreate(
                event_type=outcome_event_type,
                severity=outcome_severity,
                source=device.provider,
                payload_json=json.dumps(
                    {
                        "command_id": command.id,
                        "status": command.status,
                        "provider_ref": command.provider_ref,
                        "error": command.error_message,
                        "correlation_id": correlation_id,
                    },
                    ensure_ascii=True,
                ),
            ),
        )
        return command
