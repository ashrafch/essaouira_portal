export const APP_ROUTES = [
  { path: "/", key: "dashboard", allowedRoles: ["owner", "manager", "operator", "viewer"] },
  { path: "/operations", key: "operations", allowedRoles: ["owner", "manager", "operator", "viewer"] },
  { path: "/units", key: "units", allowedRoles: ["owner", "manager", "operator", "viewer"] },
  { path: "/units/:unitId/timeline", key: "unitTimeline", allowedRoles: ["owner", "manager", "operator", "viewer"] },
  { path: "/bookings", key: "bookings", allowedRoles: ["owner", "manager", "operator", "viewer"] },
  { path: "/calendar", key: "calendar", allowedRoles: ["owner", "manager", "operator", "viewer"] },
  { path: "/staff", key: "staff", allowedRoles: ["owner", "manager", "operator"] },
  { path: "/staff-planner", key: "staffPlanner", allowedRoles: ["owner", "manager", "operator"] },
  { path: "/business", key: "business", allowedRoles: ["owner", "manager", "viewer"] },
  { path: "/staff-anagrafica", key: "staffDirectory", allowedRoles: ["owner", "manager"] },
  { path: "/tariffe-canali", key: "pricing", allowedRoles: ["owner", "manager"] },
  { path: "/maintenance", key: "maintenance", allowedRoles: ["owner", "manager", "operator"] },
  { path: "/expenses", key: "expenses", allowedRoles: ["owner", "manager", "operator"] },
  { path: "/properties", key: "properties", allowedRoles: ["owner", "manager", "viewer"] },
  { path: "/admin-control", key: "adminControl", allowedRoles: ["owner"] },
  { path: "/smart-overview", key: "smartOverview", allowedRoles: ["owner", "manager", "operator", "viewer"] },
  { path: "/smart-dashboard", key: "smartDashboard", allowedRoles: ["owner", "manager", "operator", "viewer"] },
  { path: "/smart-operations", key: "smartOperations", allowedRoles: ["owner", "manager", "operator", "viewer"] },
  { path: "/smart-devices", key: "smartDevices", allowedRoles: ["owner", "manager", "operator", "viewer"] },
  { path: "/smart-devices/:deviceId", key: "smartDeviceDetail", allowedRoles: ["owner", "manager", "operator", "viewer"] },
  { path: "/smart-alerts", key: "smartAlerts", allowedRoles: ["owner", "manager", "operator", "viewer"] },
  { path: "/smart-automation", key: "smartAutomation", allowedRoles: ["owner", "manager"] },
  { path: "/smart-assistant/checkin", key: "smartCheckinAssistant", allowedRoles: ["owner", "manager", "operator", "viewer"] },
  { path: "/smart-assistant/checkout", key: "smartCheckoutAssistant", allowedRoles: ["owner", "manager", "operator", "viewer"] },
  { path: "/smart-units/:unitId", key: "smartUnitDetail", allowedRoles: ["owner", "manager", "operator", "viewer"] },
  { path: "/setup", key: "setupWizard", allowedRoles: ["owner"] },
];

/**
 * routeKey -> Set(allowedRoles), derived from APP_ROUTES.
 * Single source of truth for RBAC: rbac.canAccessRoute() reads from this map,
 * and App.jsx uses the same allowedRoles for the route guards.
 */
export const ROUTE_ROLES = Object.fromEntries(
  APP_ROUTES.map((route) => [route.key, new Set(route.allowedRoles)])
);
