import { getCurrentRole } from "../services/auth";

export const ALL_ROLES = ["owner", "manager", "operator", "viewer"];

export function normalizeRole(role) {
  const value = (role || "").trim().toLowerCase();
  return ALL_ROLES.includes(value) ? value : "viewer";
}

export function getRole() {
  return normalizeRole(getCurrentRole());
}

export function canAccessRoute(routeKey, role) {
  const normalized = normalizeRole(role);
  if (normalized === "owner") return true;
  const permissions = {
    manager: new Set([
      "dashboard",
      "operations",
      "units",
      "unitTimeline",
      "bookings",
      "calendar",
      "staff",
      "staffPlanner",
      "business",
      "staffDirectory",
      "pricing",
      "maintenance",
      "expenses",
      "properties",
      "smartOverview",
      "smartDashboard",
      "smartDevices",
      "smartDeviceDetail",
      "smartAlerts",
      "smartAutomation",
      "smartUnitDetail",
    ]),
    operator: new Set([
      "dashboard",
      "operations",
      "units",
      "unitTimeline",
      "bookings",
      "calendar",
      "staff",
      "staffPlanner",
      "maintenance",
      "expenses",
      "properties",
      "smartOverview",
      "smartDashboard",
      "smartDevices",
      "smartDeviceDetail",
      "smartAlerts",
      "smartUnitDetail",
    ]),
    viewer: new Set([
      "dashboard",
      "operations",
      "units",
      "unitTimeline",
      "bookings",
      "calendar",
      "business",
      "properties",
      "smartOverview",
      "smartDashboard",
      "smartDevices",
      "smartDeviceDetail",
      "smartAlerts",
      "smartUnitDetail",
    ]),
  };
  return permissions[normalized]?.has(routeKey) || false;
}
