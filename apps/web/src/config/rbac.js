import { getCurrentRole } from "../services/auth";
import { ROUTE_ROLES } from "../routes/appRoutes";

export const ALL_ROLES = ["owner", "manager", "operator", "viewer"];

export function normalizeRole(role) {
  const value = (role || "").trim().toLowerCase();
  return ALL_ROLES.includes(value) ? value : "viewer";
}

export function getRole() {
  return normalizeRole(getCurrentRole());
}

/**
 * Access is derived from APP_ROUTES.allowedRoles (see routes/appRoutes.js),
 * the same source used by the <ProtectedRoute> guards — no drift possible.
 * Owner keeps full access, including keys not present in the map.
 */
export function canAccessRoute(routeKey, role) {
  const normalized = normalizeRole(role);
  if (normalized === "owner") return true;
  return ROUTE_ROLES[routeKey]?.has(normalized) || false;
}
