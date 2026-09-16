import { canAccessPath, canAccessRoute, canEditOperations } from "../../config/rbac";

export function canUseSmartQuickAction(action, role) {
  if (!action?.enabled) return false;
  if (action.action_type === "run_scene") return Boolean(action.scene_id) && canAccessRoute("smartAutomation", role);
  if (action.action_type === "acknowledge_alert") return Boolean(action.alert_id) && canEditOperations(role);
  return canAccessPath(action.route, role);
}
