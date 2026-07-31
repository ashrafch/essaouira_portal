"""Scenes, automation rules and execution bookkeeping.

Split out of the former single-file ``service.py``; the method bodies are
unchanged. Every module is a mixin combined by ``SmartBuildingService``,
so cross-module ``self`` calls keep working exactly as before.
"""

from __future__ import annotations

import hashlib
import json
import uuid
from datetime import date, datetime, time, timezone

from fastapi import HTTPException

from app.domains.smart_building.taxonomy import (
    CANONICAL_RULE_ACTION_TYPES,
    CANONICAL_RULE_TRIGGER_TYPES,
    CANONICAL_SCENE_ACTION_TYPES,
    is_automatic_trigger_source,
    normalize_command_type,
    normalize_rule_action_type,
    normalize_rule_trigger_type,
    normalize_scene_action_type,
    normalize_trigger_source,
)
from app.domains.smart_building.schemas import (
    AlertCreate,
    AutomationRuleCreate,
    AutomationRuleUpdate,
    DeviceCommandCreate,
    RuleTriggerRequest,
    SceneActionCreate,
    SceneActionUpdate,
    SceneCreate,
    SceneUpdate,
)
from app.domains.smart_building.services.constants import (
    AUTOMATION_EXECUTION_STATUSES,
    AUTOMATION_DEDUP_WINDOW,
)
from app.models.maintenance import MaintenanceTicket
from app.models.staff_task import StaffTask
from app.models.unit import Unit
from app.models.smart_building import (
    AutomationExecution,
    AutomationRule,
    Scene,
    SceneAction,
)


class AutomationMixin:
    """Scenes, automation rules and execution bookkeeping."""

    def _extract_execution_scope(self, execution: AutomationExecution) -> dict[str, int | str | None]:
        context = self._safe_json_loads(execution.context_json)
        snapshot = self._safe_json_loads(execution.trigger_snapshot_json)
        unit_id = context.get("unit_id") or snapshot.get("unit_id")
        alert_id = context.get("alert_id") or snapshot.get("alert_id")
        booking_id = context.get("booking_id") or snapshot.get("booking_id")
        try:
            unit_id = int(unit_id) if unit_id is not None else None
        except (TypeError, ValueError):
            unit_id = None
        return {
            "unit_id": unit_id,
            "alert_id": alert_id,
            "booking_id": booking_id,
        }

    def _execution_matches_scope(
        self,
        execution: AutomationExecution,
        *,
        unit_id: int | None,
        unit_ids: set[int] | None,
    ) -> bool:
        if unit_id is None and not unit_ids:
            return True
        scope = self._extract_execution_scope(execution)
        scoped_unit_id = scope.get("unit_id")
        if scoped_unit_id is None:
            return False
        if unit_id is not None:
            return scoped_unit_id == unit_id
        return int(scoped_unit_id) in (unit_ids or set())

    def _validate_scene_action_type(self, action_type: str) -> str:
        try:
            normalized = normalize_scene_action_type(action_type)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail="Tipo azione scena non supportato") from exc
        if normalized not in CANONICAL_SCENE_ACTION_TYPES:
            raise HTTPException(status_code=400, detail="Tipo azione scena non supportato")
        return normalized

    def _validate_rule_trigger_type(self, trigger_type: str) -> str:
        try:
            normalized = normalize_rule_trigger_type(trigger_type)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail="Tipo trigger regola non supportato") from exc
        if normalized not in CANONICAL_RULE_TRIGGER_TYPES:
            raise HTTPException(status_code=400, detail="Tipo trigger regola non supportato")
        return normalized

    def _validate_rule_action_type(self, action_type: str) -> str:
        try:
            normalized = normalize_rule_action_type(action_type)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail="Tipo azione regola non supportato") from exc
        if normalized not in CANONICAL_RULE_ACTION_TYPES:
            raise HTTPException(status_code=400, detail="Tipo azione regola non supportato")
        return normalized

    def list_scenes(self) -> list[Scene]:
        return self._scoped_query(Scene).order_by(Scene.name.asc(), Scene.id.asc()).all()

    def get_scene_or_404(self, scene_id: int) -> Scene:
        scene = self._scoped_query(Scene).filter(Scene.id == scene_id).first()
        if scene is None:
            raise HTTPException(status_code=404, detail="Scena non trovata")
        return scene

    def create_scene(self, payload: SceneCreate) -> Scene:
        self._require_write_access()
        scene = Scene(
            tenant_id=self.tenant_id,
            name=payload.name.strip(),
            description=payload.description,
            is_active=payload.is_active,
        )
        self.db.add(scene)
        self.db.commit()
        self.db.refresh(scene)
        return scene

    def update_scene(self, scene_id: int, payload: SceneUpdate) -> Scene:
        self._require_write_access()
        scene = self.get_scene_or_404(scene_id)
        for key, value in payload.model_dump(exclude_unset=True).items():
            if key == "name" and value is not None:
                setattr(scene, key, value.strip())
            else:
                setattr(scene, key, value)
        self.db.commit()
        self.db.refresh(scene)
        return scene

    def list_scene_actions(self, scene_id: int) -> list[SceneAction]:
        self.get_scene_or_404(scene_id)
        return (
            self._scoped_query(SceneAction)
            .filter(SceneAction.scene_id == scene_id)
            .order_by(SceneAction.position.asc(), SceneAction.id.asc())
            .all()
        )

    def create_scene_action(self, scene_id: int, payload: SceneActionCreate) -> SceneAction:
        self._require_write_access()
        scene = self.get_scene_or_404(scene_id)
        action_type = self._validate_scene_action_type(payload.action_type)
        target_device_id = payload.target_device_id
        if target_device_id is not None:
            self.get_device_or_404(target_device_id)
        target_unit_id = self._validate_target_unit(payload.target_unit_id)
        action = SceneAction(
            tenant_id=self.tenant_id,
            scene_id=scene.id,
            position=payload.position,
            action_type=action_type,
            target_device_id=target_device_id,
            target_unit_id=target_unit_id,
            payload_json=self._safe_json_dumps(payload.payload),
            is_active=payload.is_active,
        )
        self.db.add(action)
        self.db.commit()
        self.db.refresh(action)
        return action

    def update_scene_action(
        self, scene_id: int, action_id: int, payload: SceneActionUpdate
    ) -> SceneAction:
        self._require_write_access()
        self.get_scene_or_404(scene_id)
        action = (
            self._scoped_query(SceneAction)
            .filter(SceneAction.id == action_id, SceneAction.scene_id == scene_id)
            .first()
        )
        if action is None:
            raise HTTPException(status_code=404, detail="Azione scena non trovata")

        values = payload.model_dump(exclude_unset=True)
        if "action_type" in values and values["action_type"] is not None:
            values["action_type"] = self._validate_scene_action_type(values["action_type"])
        if "target_device_id" in values and values["target_device_id"] is not None:
            self.get_device_or_404(values["target_device_id"])
        if "target_unit_id" in values:
            values["target_unit_id"] = self._validate_target_unit(values["target_unit_id"])
        if "payload" in values:
            values["payload_json"] = self._safe_json_dumps(values.pop("payload"))

        for key, value in values.items():
            setattr(action, key, value)

        self.db.commit()
        self.db.refresh(action)
        return action

    def delete_scene_action(self, scene_id: int, action_id: int) -> None:
        self._require_write_access()
        self.get_scene_or_404(scene_id)
        action = (
            self._scoped_query(SceneAction)
            .filter(SceneAction.id == action_id, SceneAction.scene_id == scene_id)
            .first()
        )
        if action is None:
            raise HTTPException(status_code=404, detail="Azione scena non trovata")
        self.db.delete(action)
        self.db.commit()

    def list_automation_rules(self) -> list[AutomationRule]:
        return self._scoped_query(AutomationRule).order_by(AutomationRule.name.asc(), AutomationRule.id.asc()).all()

    def get_automation_rule_or_404(self, rule_id: int) -> AutomationRule:
        rule = self._scoped_query(AutomationRule).filter(AutomationRule.id == rule_id).first()
        if rule is None:
            raise HTTPException(status_code=404, detail="Regola automazione non trovata")
        return rule

    def create_automation_rule(self, payload: AutomationRuleCreate) -> AutomationRule:
        self._require_write_access()
        trigger_type = self._validate_rule_trigger_type(payload.trigger_type)
        action_type = self._validate_rule_action_type(payload.action_type)
        target_device_id = payload.target_device_id
        if target_device_id is not None:
            self.get_device_or_404(target_device_id)
        target_unit_id = self._validate_target_unit(payload.target_unit_id)
        rule = AutomationRule(
            tenant_id=self.tenant_id,
            name=payload.name.strip(),
            description=payload.description,
            trigger_type=trigger_type,
            trigger_filter_json=self._safe_json_dumps(payload.trigger_filter),
            action_type=action_type,
            target_device_id=target_device_id,
            target_unit_id=target_unit_id,
            payload_json=self._safe_json_dumps(payload.payload),
            is_active=payload.is_active,
        )
        self.db.add(rule)
        self.db.commit()
        self.db.refresh(rule)
        return rule

    def _context_property_id(self, context: dict | None) -> int | None:
        if not context:
            return None
        raw_property_id = context.get("property_id")
        if raw_property_id is not None:
            try:
                return int(raw_property_id)
            except (TypeError, ValueError):
                return None
        raw_unit_id = context.get("unit_id")
        try:
            unit_id = int(raw_unit_id) if raw_unit_id is not None else None
        except (TypeError, ValueError):
            unit_id = None
        if unit_id is None:
            return None
        unit = self.db.query(Unit).filter(Unit.id == unit_id).first()
        return unit.property_id if unit else None

    def _rule_filter_matches(self, rule: AutomationRule, context: dict | None) -> bool:
        filters = self._safe_json_loads(rule.trigger_filter_json)
        if not filters:
            return True
        payload = context or {}

        filter_property_id = filters.get("property_id")
        if filter_property_id is not None:
            try:
                expected_property_id = int(filter_property_id)
            except (TypeError, ValueError):
                expected_property_id = None
            if expected_property_id is None or self._context_property_id(payload) != expected_property_id:
                return False

        filter_unit_ids = filters.get("unit_ids") or []
        if filter_unit_ids:
            try:
                expected_unit_ids = {int(v) for v in filter_unit_ids}
            except (TypeError, ValueError):
                expected_unit_ids = set()
            raw_unit_id = payload.get("unit_id")
            try:
                runtime_unit_id = int(raw_unit_id) if raw_unit_id is not None else None
            except (TypeError, ValueError):
                runtime_unit_id = None
            if runtime_unit_id is None or runtime_unit_id not in expected_unit_ids:
                return False

        alert_types = filters.get("alert_types") or []
        if alert_types:
            current_alert_type = str(payload.get("alert_type") or "").strip().lower()
            allowed_alert_types = {
                str(item).strip().lower() for item in alert_types if str(item).strip()
            }
            if current_alert_type not in allowed_alert_types:
                return False

        return True

    def trigger_rules_for_business_event(
        self,
        *,
        trigger_type: str,
        trigger_source: str,
        context: dict | None,
        requested_by: str | None = None,
        correlation_id: str | None = None,
    ) -> list[AutomationExecution]:
        normalized_trigger = self._validate_rule_trigger_type(trigger_type)
        normalized_source = normalize_trigger_source(trigger_source)
        rules = (
            self._scoped_query(AutomationRule)
            .filter(
                AutomationRule.trigger_type == normalized_trigger,
                AutomationRule.is_active.is_(True),
            )
            .order_by(AutomationRule.id.asc())
            .all()
        )
        executions: list[AutomationExecution] = []
        for rule in rules:
            if not self._rule_filter_matches(rule, context):
                continue
            execution = self.trigger_automation_rule(
                rule.id,
                RuleTriggerRequest(
                    trigger_type=normalized_trigger,
                    trigger_source=normalized_source,
                    correlation_id=correlation_id,
                    context=context or {},
                ),
                requested_by=requested_by,
            )
            executions.append(execution)
        return executions

    def update_automation_rule(self, rule_id: int, payload: AutomationRuleUpdate) -> AutomationRule:
        self._require_write_access()
        rule = self.get_automation_rule_or_404(rule_id)
        values = payload.model_dump(exclude_unset=True)
        if "trigger_type" in values and values["trigger_type"] is not None:
            values["trigger_type"] = self._validate_rule_trigger_type(values["trigger_type"])
        if "action_type" in values and values["action_type"] is not None:
            values["action_type"] = self._validate_rule_action_type(values["action_type"])
        if "target_device_id" in values and values["target_device_id"] is not None:
            self.get_device_or_404(values["target_device_id"])
        if "target_unit_id" in values:
            values["target_unit_id"] = self._validate_target_unit(values["target_unit_id"])
        if "trigger_filter" in values:
            values["trigger_filter_json"] = self._safe_json_dumps(values.pop("trigger_filter"))
        if "payload" in values:
            values["payload_json"] = self._safe_json_dumps(values.pop("payload"))
        if "name" in values and values["name"] is not None:
            values["name"] = values["name"].strip()
        for key, value in values.items():
            setattr(rule, key, value)
        self.db.commit()
        self.db.refresh(rule)
        return rule

    def list_automation_executions(
        self, limit: int = 50, scene_id: int | None = None, rule_id: int | None = None
    ) -> list[AutomationExecution]:
        query = self._scoped_query(AutomationExecution)
        if scene_id is not None:
            query = query.filter(AutomationExecution.scene_id == scene_id)
        if rule_id is not None:
            query = query.filter(AutomationExecution.rule_id == rule_id)
        query = query.order_by(AutomationExecution.started_at.desc(), AutomationExecution.id.desc())
        return query.limit(max(1, min(limit, 200))).all()

    def _make_correlation_id(self, supplied: str | None = None) -> str:
        raw = (supplied or "").strip()
        if raw:
            return raw[:64]
        return uuid.uuid4().hex

    def _make_trigger_snapshot(
        self,
        *,
        trigger_type: str,
        trigger_source: str,
        context: dict,
    ) -> dict[str, object]:
        return {
            "trigger_type": trigger_type,
            "trigger_source": trigger_source,
            "booking_id": context.get("booking_id"),
            "alert_id": context.get("alert_id"),
            "device_id": context.get("device_id"),
            "unit_id": context.get("unit_id"),
            "event_id": context.get("event_id"),
        }

    def _make_dedup_key(
        self,
        *,
        rule_id: int,
        trigger_type: str,
        trigger_source: str,
        snapshot: dict[str, object],
        occurred_at: datetime,
    ) -> str:
        bucket = int(occurred_at.timestamp() // int(AUTOMATION_DEDUP_WINDOW.total_seconds()))
        material = json.dumps(
            {
                "tenant_id": self.tenant_id,
                "rule_id": rule_id,
                "trigger_type": trigger_type,
                "trigger_source": trigger_source,
                "snapshot": snapshot,
                "bucket": bucket,
            },
            sort_keys=True,
            ensure_ascii=True,
        )
        return hashlib.sha256(material.encode("utf-8")).hexdigest()

    def _find_recent_execution_by_dedup_key(self, dedup_key: str) -> AutomationExecution | None:
        threshold = datetime.now(timezone.utc) - AUTOMATION_DEDUP_WINDOW
        return (
            self._scoped_query(AutomationExecution)
            .filter(
                AutomationExecution.dedup_key == dedup_key,
                AutomationExecution.started_at >= threshold,
            )
            .order_by(AutomationExecution.started_at.desc(), AutomationExecution.id.desc())
            .first()
        )

    def _create_execution(
        self,
        *,
        scene_id: int | None,
        rule_id: int | None,
        trigger_type: str,
        trigger_source: str,
        trigger_snapshot: dict[str, object] | None,
        correlation_id: str,
        dedup_key: str | None,
        requested_by: str | None,
        context: dict | None,
    ) -> AutomationExecution:
        execution = AutomationExecution(
            tenant_id=self.tenant_id,
            scene_id=scene_id,
            rule_id=rule_id,
            trigger_type=trigger_type,
            trigger_source=trigger_source,
            trigger_snapshot_json=self._safe_json_dumps(trigger_snapshot or {}),
            correlation_id=correlation_id,
            dedup_key=dedup_key,
            status="running",
            requested_by=requested_by or "system",
            context_json=self._safe_json_dumps(context or {}),
        )
        self.db.add(execution)
        self.db.commit()
        self.db.refresh(execution)
        return execution

    def _finalize_execution(
        self,
        execution: AutomationExecution,
        *,
        results: list[dict],
        failures: list[dict],
        reference_updated=None,
    ) -> AutomationExecution:
        now = datetime.now(timezone.utc)
        if failures and results:
            status = "partial"
        elif failures:
            status = "failed"
        else:
            status = "executed"
        if status not in AUTOMATION_EXECUTION_STATUSES:
            status = "failed"

        execution.status = status
        execution.result_json = self._safe_json_dumps(
            {
                "results": results,
                "failures": failures,
                "result_count": len(results),
                "failure_count": len(failures),
            }
        )
        execution.error_message = failures[0].get("error") if failures else None
        execution.finished_at = now
        if reference_updated is not None:
            reference_updated.last_run_at = now
        self.db.commit()
        self.db.refresh(execution)
        return execution

    def _execute_action(
        self,
        *,
        action_type: str,
        target_device_id: int | None,
        target_unit_id: int | None,
        payload: dict,
        requested_by: str | None,
        correlation_id: str,
    ) -> dict:
        try:
            normalized = normalize_rule_action_type(action_type)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail="Azione non supportata") from exc
        if normalized == "action.dispatch_device_command":
            if target_device_id is None:
                raise HTTPException(
                    status_code=400,
                    detail="action.dispatch_device_command richiede target_device_id",
                )
            command_type = normalize_command_type(str(payload.get("command_type", "")))
            command_payload = payload.get("payload", {}) if isinstance(payload.get("payload", {}), dict) else {}
            ttl_seconds = payload.get("ttl_seconds", 300)
            command = self.create_device_command(
                target_device_id,
                DeviceCommandCreate(
                    command_type=command_type,
                    payload=command_payload,
                    ttl_seconds=ttl_seconds,
                ),
                requested_by=requested_by,
                correlation_id=correlation_id,
            )
            return {
                "entity": "device_command",
                "id": command.id,
                "status": command.status,
                "device_id": command.device_id,
                "correlation_id": correlation_id,
            }

        if normalized == "action.create_alert":
            alert = self.create_alert(
                AlertCreate(
                    unit_id=target_unit_id or payload.get("unit_id"),
                    device_id=target_device_id or payload.get("device_id"),
                    alert_type=str(payload.get("alert_type") or "automation_alert"),
                    severity=str(payload.get("severity") or "warning"),
                    title=str(payload.get("title") or "Automation alert"),
                    description=payload.get("description"),
                ),
                correlation_id=correlation_id,
                trigger_rules=False,
                trigger_source="auto.automation",
                requested_by=requested_by,
            )
            return {
                "entity": "alert",
                "id": alert.id,
                "status": alert.status,
                "correlation_id": correlation_id,
            }

        if normalized == "action.create_maintenance_ticket":
            unit_id = target_unit_id or payload.get("unit_id")
            self._validate_target_unit(unit_id)
            ticket = MaintenanceTicket(
                title=str(payload.get("title") or "Automation maintenance ticket"),
                description=payload.get("description"),
                unit_id=unit_id,
                status=str(payload.get("status") or "todo"),
                priority=str(payload.get("priority") or "medium"),
                ticket_type=str(payload.get("ticket_type") or "repair"),
                currency=str(payload.get("currency") or "EUR"),
            )
            self.db.add(ticket)
            self.db.commit()
            self.db.refresh(ticket)
            return {
                "entity": "maintenance_ticket",
                "id": ticket.id,
                "status": ticket.status,
                "correlation_id": correlation_id,
            }

        if normalized == "action.create_staff_task":
            unit_id = target_unit_id or payload.get("unit_id")
            self._validate_target_unit(unit_id)
            date_raw = payload.get("date")
            task_date = date.today()
            if isinstance(date_raw, str) and date_raw.strip():
                try:
                    task_date = date.fromisoformat(date_raw.strip())
                except ValueError as exc:
                    raise HTTPException(status_code=400, detail="Formato data task non valido") from exc
            time_raw = payload.get("time")
            task_time = None
            if isinstance(time_raw, str) and time_raw.strip():
                try:
                    task_time = time.fromisoformat(time_raw.strip())
                except ValueError as exc:
                    raise HTTPException(status_code=400, detail="Formato ora task non valido") from exc
            task = StaffTask(
                unit_id=unit_id,
                date=task_date,
                time=task_time,
                task_type=str(payload.get("task_type") or "automation"),
                assignee_name=payload.get("assignee_name"),
                status=str(payload.get("status") or "planned"),
                notes=payload.get("notes"),
                cost=payload.get("cost"),
                currency=str(payload.get("currency") or "EUR"),
            )
            self.db.add(task)
            self.db.commit()
            self.db.refresh(task)
            return {
                "entity": "staff_task",
                "id": task.id,
                "status": task.status,
                "correlation_id": correlation_id,
            }

        raise HTTPException(status_code=400, detail="Azione non supportata")

    def run_scene(
        self, scene_id: int, requested_by: str | None = None, context: dict | None = None
    ) -> AutomationExecution:
        self._require_write_access()
        scene = self.get_scene_or_404(scene_id)
        if not scene.is_active:
            raise HTTPException(status_code=400, detail="Scena disattivata")

        actions = (
            self._scoped_query(SceneAction)
            .filter(SceneAction.scene_id == scene_id, SceneAction.is_active.is_(True))
            .order_by(SceneAction.position.asc(), SceneAction.id.asc())
            .all()
        )
        if not actions:
            raise HTTPException(status_code=400, detail="Scena senza azioni attive")

        correlation_id = self._make_correlation_id()
        trigger_type = normalize_rule_trigger_type("manual")
        trigger_source = normalize_trigger_source("manual.api")
        trigger_snapshot = self._make_trigger_snapshot(
            trigger_type=trigger_type,
            trigger_source=trigger_source,
            context=context or {},
        )
        execution = self._create_execution(
            scene_id=scene.id,
            rule_id=None,
            trigger_type=trigger_type,
            trigger_source=trigger_source,
            trigger_snapshot=trigger_snapshot,
            correlation_id=correlation_id,
            dedup_key=None,
            requested_by=requested_by,
            context=context,
        )
        results: list[dict] = []
        failures: list[dict] = []
        for action in actions:
            payload = self._safe_json_loads(action.payload_json)
            try:
                outcome = self._execute_action(
                    action_type=action.action_type,
                    target_device_id=action.target_device_id,
                    target_unit_id=action.target_unit_id,
                    payload=payload,
                    requested_by=requested_by,
                    correlation_id=correlation_id,
                )
                results.append({"action_id": action.id, "action_type": action.action_type, "outcome": outcome})
            except HTTPException as exc:
                failures.append({"action_id": action.id, "error": exc.detail})
            except Exception as exc:  # pragma: no cover - fallback guardrail
                failures.append({"action_id": action.id, "error": str(exc)})
        return self._finalize_execution(execution, results=results, failures=failures, reference_updated=scene)

    def trigger_automation_rule(
        self, rule_id: int, payload: RuleTriggerRequest, requested_by: str | None = None
    ) -> AutomationExecution:
        self._require_write_access()
        rule = self.get_automation_rule_or_404(rule_id)
        if not rule.is_active:
            raise HTTPException(status_code=400, detail="Regola disattivata")
        runtime_trigger = self._validate_rule_trigger_type(payload.trigger_type)
        configured_trigger = self._validate_rule_trigger_type(rule.trigger_type)
        trigger_source = normalize_trigger_source(payload.trigger_source)

        if runtime_trigger != configured_trigger and runtime_trigger != "manual":
            raise HTTPException(status_code=400, detail="Trigger runtime non compatibile con la regola")
        effective_trigger = configured_trigger if runtime_trigger == "manual" else runtime_trigger
        if not self._rule_filter_matches(rule, payload.context):
            raise HTTPException(status_code=409, detail="Rule trigger_filter mismatch for provided context")

        correlation_id = self._make_correlation_id(payload.correlation_id)
        snapshot = self._make_trigger_snapshot(
            trigger_type=effective_trigger,
            trigger_source=trigger_source,
            context=payload.context,
        )

        dedup_key = None
        if is_automatic_trigger_source(trigger_source) and effective_trigger != "manual":
            dedup_key = self._make_dedup_key(
                rule_id=rule.id,
                trigger_type=effective_trigger,
                trigger_source=trigger_source,
                snapshot=snapshot,
                occurred_at=datetime.now(timezone.utc),
            )
            existing = self._find_recent_execution_by_dedup_key(dedup_key)
            if existing is not None:
                return existing

        execution = self._create_execution(
            scene_id=None,
            rule_id=rule.id,
            trigger_type=effective_trigger,
            trigger_source=trigger_source,
            trigger_snapshot=snapshot,
            correlation_id=correlation_id,
            dedup_key=dedup_key,
            requested_by=requested_by,
            context=payload.context,
        )
        results: list[dict] = []
        failures: list[dict] = []
        try:
            outcome = self._execute_action(
                action_type=rule.action_type,
                target_device_id=rule.target_device_id,
                target_unit_id=rule.target_unit_id,
                payload=self._safe_json_loads(rule.payload_json),
                requested_by=requested_by,
                correlation_id=correlation_id,
            )
            results.append({"rule_id": rule.id, "action_type": rule.action_type, "outcome": outcome})
        except HTTPException as exc:
            failures.append({"rule_id": rule.id, "error": exc.detail})
        except Exception as exc:  # pragma: no cover - fallback guardrail
            failures.append({"rule_id": rule.id, "error": str(exc)})
        return self._finalize_execution(execution, results=results, failures=failures, reference_updated=rule)
