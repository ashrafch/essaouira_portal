import { getCurrentRole } from "../services/auth";
import { ROUTE_ROLES } from "../routes/appRoutes";
import { APP_ROUTES } from "../routes/appRoutes";
import { matchPath } from "react-router-dom";

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
 * Unknown destinations fail closed, including for owners.
 */
export function canAccessRoute(routeKey, role) {
  const normalized = normalizeRole(role);
  return ROUTE_ROLES[routeKey]?.has(normalized) || false;
}

export function canAccessPath(path, role) {
  if (typeof path !== "string" || !path.startsWith("/") || path.startsWith("//") || path.includes("\\")) return false;
  const pathname = path.split(/[?#]/)[0];
  const route = APP_ROUTES.find((item) => matchPath({ path: item.path, end: true }, pathname));
  return Boolean(route && canAccessRoute(route.key, role));
}

export function canEditOperations(role = getRole()) {
  return ["owner", "manager", "operator"].includes(normalizeRole(role));
}
