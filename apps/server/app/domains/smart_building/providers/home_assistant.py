from __future__ import annotations

import json
import os
from datetime import datetime, timezone
from typing import Any
from urllib import error, request

from app.domains.smart_building.providers.base import (
    ProviderCommandRequest,
    ProviderCommandResult,
    ProviderDeviceSnapshot,
    ProviderStateSnapshot,
    ProviderWebhookEvent,
    SmartDeviceProvider,
)
from app.domains.smart_building.providers.home_assistant_mapping import (
    SUPPORTED_ENTITY_DOMAINS,
    map_entity_to_device,
    map_entity_to_state,
    parse_entity_domain,
)


class HomeAssistantProvider(SmartDeviceProvider):
    provider_name = "home_assistant"
    supports_catalog_sync = True
    supports_webhook_ingest = True
    supports_command_execution = True

    def __init__(
        self,
        *,
        base_url: str | None = None,
        token: str | None = None,
        timeout_seconds: int | None = None,
        include_domains: str | None = None,
        unit_hints_json: str | None = None,
    ) -> None:
        self._base_url = (base_url or os.getenv("HOME_ASSISTANT_URL", "")).strip().rstrip("/")
        self._token = (token or os.getenv("HOME_ASSISTANT_TOKEN", "")).strip()
        timeout_raw = os.getenv("HOME_ASSISTANT_TIMEOUT_SECONDS", "8").strip()
        effective_timeout = timeout_seconds if timeout_seconds is not None else timeout_raw
        try:
            self._timeout = max(2, min(int(effective_timeout), 30))
        except (TypeError, ValueError):
            self._timeout = 8
        self._include_domains = self._parse_domains(
            include_domains if include_domains is not None else os.getenv("HOME_ASSISTANT_INCLUDE_DOMAINS"),
            default=SUPPORTED_ENTITY_DOMAINS,
        )
        self._unit_hint_map = self._parse_unit_hint_map(
            unit_hints_json if unit_hints_json is not None else os.getenv("HOME_ASSISTANT_UNIT_HINTS", "")
        )

    def _parse_domains(self, value: str | None, *, default: set[str]) -> set[str]:
        if not value:
            return set(default)
        values = {item.strip().lower() for item in value.split(",") if item.strip()}
        return values or set(default)

    def _parse_unit_hint_map(self, raw: str) -> dict[str, str]:
        if not raw.strip():
            return {}
        try:
            parsed = json.loads(raw)
        except json.JSONDecodeError:
            return {}
        if not isinstance(parsed, dict):
            return {}
        result: dict[str, str] = {}
        for key, value in parsed.items():
            entity_id = str(key).strip()
            unit_hint = str(value).strip()
            if entity_id and unit_hint:
                result[entity_id] = unit_hint
        return result

    def _is_configured(self) -> bool:
        return bool(self._base_url and self._token)

    def _request_json(self, method: str, path: str, payload: dict[str, Any] | None = None) -> Any:
        if not self._is_configured():
            raise RuntimeError("Home Assistant config missing: HOME_ASSISTANT_URL / HOME_ASSISTANT_TOKEN")
        url = f"{self._base_url}{path}"
        data = None
        headers = {"Authorization": f"Bearer {self._token}"}
        if payload is not None:
            data = json.dumps(payload, ensure_ascii=True).encode("utf-8")
            headers["Content-Type"] = "application/json"
        req = request.Request(url=url, method=method.upper(), data=data, headers=headers)
        try:
            with request.urlopen(req, timeout=self._timeout) as response:
                body = response.read().decode("utf-8") if response.length != 0 else ""
        except error.HTTPError as exc:
            detail = exc.read().decode("utf-8") if exc.fp else ""
            raise RuntimeError(f"Home Assistant API error {exc.code}: {detail}") from exc
        except error.URLError as exc:
            raise RuntimeError(f"Home Assistant API unreachable: {exc.reason}") from exc
        if not body:
            return {}
        try:
            return json.loads(body)
        except json.JSONDecodeError as exc:
            raise RuntimeError("Invalid JSON response from Home Assistant") from exc

    def _resolve_service_for_command(
        self, external_id: str, command_type: str, payload: dict[str, Any]
    ) -> tuple[str, str, dict[str, Any]]:
        entity_id = external_id.strip()
        if "." not in entity_id:
            raise RuntimeError("Home Assistant external_id must be a valid entity_id")
        domain = parse_entity_domain(entity_id)

        if command_type == "device.power.on":
            service_domain = "switch" if domain not in {"switch", "light"} else domain
            return service_domain, "turn_on", {"entity_id": entity_id}
        if command_type == "device.power.off":
            service_domain = "switch" if domain not in {"switch", "light"} else domain
            return service_domain, "turn_off", {"entity_id": entity_id}
        if command_type == "device.climate.set_mode":
            mode = str(payload.get("mode", "")).strip().lower()
            if not mode:
                raise RuntimeError("Missing climate mode")
            return "climate", "set_hvac_mode", {"entity_id": entity_id, "hvac_mode": mode}
        if command_type == "device.climate.set_setpoint":
            setpoint = payload.get("setpoint_c")
            if setpoint is None:
                raise RuntimeError("Missing setpoint_c")
            return "climate", "set_temperature", {"entity_id": entity_id, "temperature": float(setpoint)}
        if command_type == "device.lock.set_state":
            target = str(payload.get("target", "")).strip().lower()
            if target not in {"lock", "unlock"}:
                raise RuntimeError("Invalid lock target")
            return "lock", "lock" if target == "lock" else "unlock", {"entity_id": entity_id}
        raise RuntimeError(f"Unsupported command type '{command_type}' for Home Assistant provider")

    def pull_state(self, external_id: str) -> ProviderStateSnapshot:
        entity_id = external_id.strip()
        payload = self._request_json("GET", f"/api/states/{entity_id}")
        if not isinstance(payload, dict):
            raise RuntimeError("Unexpected Home Assistant state payload")
        return map_entity_to_state(payload)

    def list_devices(self, tenant_id: str) -> list[ProviderDeviceSnapshot]:
        payload = self._request_json("GET", "/api/states")
        if not isinstance(payload, list):
            raise RuntimeError("Unexpected Home Assistant states payload")
        devices: list[ProviderDeviceSnapshot] = []
        for raw_entity in payload:
            if not isinstance(raw_entity, dict):
                continue
            entity_id = str(raw_entity.get("entity_id", "")).strip()
            if "." not in entity_id:
                continue
            if parse_entity_domain(entity_id) not in self._include_domains:
                continue
            devices.append(
                map_entity_to_device(
                    raw_entity,
                    unit_hint_by_entity=self._unit_hint_map,
                )
            )
        return devices

    def parse_webhook(self, payload: dict[str, Any]) -> ProviderWebhookEvent | None:
        if not isinstance(payload, dict):
            return None

        event_type = str(payload.get("event_type", "")).strip().lower()
        entity_id = str(payload.get("entity_id", "")).strip()
        new_state: dict[str, Any] | None = (
            payload.get("new_state") if isinstance(payload.get("new_state"), dict) else None
        )
        if not entity_id and isinstance(payload.get("event"), dict):
            event_obj = payload["event"]
            event_type = str(event_obj.get("event_type", event_type)).strip().lower()
            data = event_obj.get("data", {})
            if isinstance(data, dict):
                entity_id = str(data.get("entity_id", "")).strip()
                candidate = data.get("new_state")
                if isinstance(candidate, dict):
                    new_state = candidate

        if not entity_id:
            return None
        if event_type and event_type != "state_changed":
            return ProviderWebhookEvent(
                external_id=entity_id,
                event_type="provider.webhook.ingested",
                severity="info",
                payload={"ha_event_type": event_type, "raw": payload},
                state=None,
                occurred_at=datetime.now(timezone.utc),
            )

        parsed_state = map_entity_to_state(new_state) if isinstance(new_state, dict) else None
        severity = "warning" if parsed_state is not None and not parsed_state.online else "info"
        return ProviderWebhookEvent(
            external_id=entity_id,
            event_type="provider.webhook.ingested",
            severity=severity,
            payload={"ha_event_type": "state_changed", "raw": payload},
            state=parsed_state,
            occurred_at=datetime.now(timezone.utc),
        )

    def execute_command(self, request_data: ProviderCommandRequest) -> ProviderCommandResult:
        try:
            service_domain, service_name, service_payload = self._resolve_service_for_command(
                request_data.external_id,
                request_data.command_type,
                request_data.payload or {},
            )
            response = self._request_json(
                "POST",
                f"/api/services/{service_domain}/{service_name}",
                payload=service_payload,
            )
            provider_ref = None
            if isinstance(response, list) and response:
                first = response[0]
                if isinstance(first, dict):
                    context = first.get("context", {})
                    if isinstance(context, dict):
                        context_id = context.get("id")
                        if context_id:
                            provider_ref = str(context_id)
            return ProviderCommandResult(
                accepted=True,
                lifecycle_status="executed",
                provider_ref=provider_ref,
                result_payload={"service": f"{service_domain}.{service_name}", "response": response},
                executed=True,
            )
        except Exception as exc:
            return ProviderCommandResult(
                accepted=False,
                lifecycle_status="failed",
                error_message=str(exc),
                executed=False,
            )
