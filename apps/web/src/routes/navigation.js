import { APP_ROUTES } from "./appRoutes";
import { canAccessRoute } from "../config/rbac";

const LABELS = {
  dashboard: "Dashboard",
  operations: "Arrivi & Partenze",
  units: "Appartamenti",
  bookings: "Prenotazioni",
  calendar: "Calendario",
  staff: "Task staff & pulizie",
  staffPlanner: "Planner staff",
  business: "Business, ricavi, costi e report",
  staffDirectory: "Anagrafica staff",
  pricing: "Tariffe & Canali",
  maintenance: "Manutenzioni",
  expenses: "Spese generali",
  properties: "Proprieta",
  adminControl: "Admin & Config",
  smartOverview: "Smart overview",
  smartDashboard: "Smart dashboard",
  smartOperations: "Smart operations",
  smartFacilities: "Impianti e aree comuni",
  smartDevices: "Dispositivi smart",
  smartAlerts: "Alert smart",
  smartAutomation: "Automazioni smart",
  smartCheckinAssistant: "Assistant check-in",
  smartCheckoutAssistant: "Assistant checkout",
  smartLink: "Link VillaCore",
  setupWizard: "Setup Wizard",
};

export function getNavigationItems(role) {
  return APP_ROUTES.filter((route) => !route.standalone && !route.path.includes(":") && canAccessRoute(route.key, role))
    .map((route) => ({ path: route.path, routeKey: route.key, label: LABELS[route.key] }));
}

export function isNavigationActive(pathname, destination) {
  return pathname === destination || (destination !== "/" && pathname.startsWith(`${destination}/`));
}
