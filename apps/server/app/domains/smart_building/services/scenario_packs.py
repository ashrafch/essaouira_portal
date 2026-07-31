"""Scenario pack definitions and idempotent install flow.

Split out of the former single-file ``service.py``; the method bodies are
unchanged. Every module is a mixin combined by ``SmartBuildingService``,
so cross-module ``self`` calls keep working exactly as before.
"""

from __future__ import annotations

from datetime import datetime, timezone

from fastapi import HTTPException

from app.domains.smart_building.schemas import (
    AutomationRuleCreate,
    SceneCreate,
)
from app.domains.smart_building.services.constants import (
    AUTOMATION_TEMPLATE_KEYS,
    SCENARIO_PACK_DEFINITIONS,
)
from app.models.property import Property
from app.models.smart_building import (
    AutomationRule,
    Scene,
    SmartScenarioPackInstall,
)


class ScenarioPacksMixin:
    """Scenario pack definitions and idempotent install flow."""

    def list_scenario_pack_definitions(self) -> list[dict[str, object]]:
        return [
            {"key": key, **value}
            for key, value in SCENARIO_PACK_DEFINITIONS.items()
        ]

    def list_enabled_scenario_packs(self, property_id: int | None = None) -> list[SmartScenarioPackInstall]:
        query = self._scoped_query(SmartScenarioPackInstall).order_by(
            SmartScenarioPackInstall.updated_at.desc(),
            SmartScenarioPackInstall.id.desc(),
        )
        if property_id is not None:
            self._property_or_404(property_id)
            query = query.filter(SmartScenarioPackInstall.property_id == property_id)
        return query.all()

    def _pack_prefix(self, prop: Property) -> str:
        return f"[Pack:{prop.code}]"

    def _rule_payload_for_pack(self, payload: dict, *, property_id: int, unit_ids: list[int]) -> dict:
        enriched = dict(payload)
        enriched["property_id"] = property_id
        if unit_ids:
            enriched["unit_ids"] = unit_ids
        return enriched

    def _materialize_scenario_pack(
        self,
        *,
        pack_key: str,
        property_id: int,
    ) -> list[dict[str, object]]:
        prop = self._property_or_404(property_id)
        units = self._property_units(property_id)
        unit_ids = [unit.id for unit in units]
        prefix = self._pack_prefix(prop)
        created: list[dict[str, object]] = []

        if pack_key == "basic_hospitality_pack":
            scene = self._ensure_scene(
                name=f"{prefix} Hospitality Welcome Scene",
                description=f"Placeholder scena welcome per property {prop.name}.",
            )
            created.append({"entity": "scene", "id": scene.id, "name": scene.name})
            rule_checkin = self._ensure_rule(
                name=f"{prefix} Trigger check-in welcome",
                description=f"Check-in completato: alert readiness smart ({prop.name}).",
                trigger_type="booking.checked_in",
                trigger_filter={"property_id": property_id, "unit_ids": unit_ids},
                action_type="action.create_alert",
                payload=self._rule_payload_for_pack(
                    {
                        "severity": "info",
                        "title": f"[{prop.code}] Check-in completato",
                        "description": "Verifica comfort unita e readiness smart.",
                        "alert_type": "automation.alert.raised",
                    },
                    property_id=property_id,
                    unit_ids=unit_ids,
                ),
            )
            created.append({"entity": "rule", "id": rule_checkin.id, "name": rule_checkin.name})
            rule_checkout = self._ensure_rule(
                name=f"{prefix} Trigger checkout fallback",
                description=f"Checkout completato: reminder spegnimento carichi ({prop.name}).",
                trigger_type="booking.checked_out",
                trigger_filter={"property_id": property_id, "unit_ids": unit_ids},
                action_type="action.create_alert",
                payload=self._rule_payload_for_pack(
                    {
                        "severity": "warning",
                        "title": f"[{prop.code}] Checkout completato",
                        "description": "Conferma profilo eco e spegnimento carichi non essenziali.",
                        "alert_type": "automation.alert.raised",
                    },
                    property_id=property_id,
                    unit_ids=unit_ids,
                ),
            )
            created.append({"entity": "rule", "id": rule_checkout.id, "name": rule_checkout.name})
        elif pack_key == "energy_saver_pack":
            rule = self._ensure_rule(
                name=f"{prefix} Trigger checkout energy saver",
                description=f"Checkout: alert energia/eco mode per {prop.name}.",
                trigger_type="booking.checked_out",
                trigger_filter={"property_id": property_id, "unit_ids": unit_ids},
                action_type="action.create_alert",
                payload=self._rule_payload_for_pack(
                    {
                        "severity": "warning",
                        "title": f"[{prop.code}] Attiva energy saver",
                        "description": "Imposta setpoint eco e verifica spegnimento luci/relays.",
                        "alert_type": "automation.alert.raised",
                    },
                    property_id=property_id,
                    unit_ids=unit_ids,
                ),
            )
            created.append({"entity": "rule", "id": rule.id, "name": rule.name})
        elif pack_key == "leak_protection_pack":
            rule = self._ensure_rule(
                name=f"{prefix} Trigger leak maintenance",
                description=f"Leak alert: apertura ticket manutenzione ({prop.name}).",
                trigger_type="alert.raised",
                trigger_filter={
                    "property_id": property_id,
                    "unit_ids": unit_ids,
                    "alert_types": ["sensor.leak_detected", "custom.sensor.leak_detected"],
                },
                action_type="action.create_maintenance_ticket",
                payload=self._rule_payload_for_pack(
                    {
                        "title": f"[{prop.code}] Leak protection follow-up",
                        "description": "Verifica perdita segnalata dai sensori smart.",
                        "severity": "high",
                    },
                    property_id=property_id,
                    unit_ids=unit_ids,
                ),
            )
            created.append({"entity": "rule", "id": rule.id, "name": rule.name})
        return created

    def enable_scenario_pack(
        self,
        *,
        property_id: int,
        pack_key: str,
        requested_by: str | None = None,
    ) -> SmartScenarioPackInstall:
        self._require_write_access()
        normalized = (pack_key or "").strip().lower()
        if normalized not in AUTOMATION_TEMPLATE_KEYS:
            raise HTTPException(status_code=400, detail=f"Scenario pack non supportato: {pack_key}")
        self._property_or_404(property_id)

        install = (
            self._scoped_query(SmartScenarioPackInstall)
            .filter(
                SmartScenarioPackInstall.property_id == property_id,
                SmartScenarioPackInstall.pack_key == normalized,
            )
            .first()
        )

        created = self._materialize_scenario_pack(pack_key=normalized, property_id=property_id)
        details = {
            "pack_key": normalized,
            "property_id": property_id,
            "created_or_reused": created,
            "installed_by": requested_by or "system",
            "installed_at": datetime.now(timezone.utc).isoformat(),
        }

        if install is None:
            install = SmartScenarioPackInstall(
                tenant_id=self.tenant_id,
                property_id=property_id,
                pack_key=normalized,
                status="enabled",
                installed_by=requested_by or "system",
                details_json=self._safe_json_dumps(details),
            )
            self.db.add(install)
        else:
            install.status = "enabled"
            install.installed_by = requested_by or install.installed_by
            install.details_json = self._safe_json_dumps(details)
        self.db.commit()
        self.db.refresh(install)
        return install

    def _ensure_scene(self, name: str, description: str) -> Scene:
        existing = self._scoped_query(Scene).filter(Scene.name == name).first()
        if existing is not None:
            return existing
        return self.create_scene(SceneCreate(name=name, description=description, is_active=True))

    def _ensure_rule(
        self,
        *,
        name: str,
        description: str,
        trigger_type: str,
        action_type: str,
        payload: dict,
        trigger_filter: dict | None = None,
    ) -> AutomationRule:
        existing = self._scoped_query(AutomationRule).filter(AutomationRule.name == name).first()
        if existing is not None:
            return existing
        return self.create_automation_rule(
            AutomationRuleCreate(
                name=name,
                description=description,
                trigger_type=trigger_type,
                trigger_filter=trigger_filter or {},
                action_type=action_type,
                payload=payload,
                is_active=True,
            )
        )

    def _enable_template(self, template: str, *, property_id: int, installed_by: str | None = None) -> dict[str, object]:
        key = template.strip().lower()
        if key not in AUTOMATION_TEMPLATE_KEYS:
            raise HTTPException(status_code=400, detail=f"Template non supportato: {template}")
        install = self.enable_scenario_pack(
            property_id=property_id,
            pack_key=key,
            requested_by=installed_by,
        )
        details = self._safe_json_loads(install.details_json)
        return {"template": key, "created": details.get("created_or_reused", [])}
