const BASE_URL =
  import.meta.env.VITE_API_BASE_URL?.trim() || "http://localhost:8000";
const TOKEN_KEY = "essaouira_portal_token";
const USER_KEY = "essaouira_portal_user";
const ROLE_KEY = "essaouira_portal_role";
const TENANT_KEY = "essaouira_portal_tenant";
const AUTH_REDIRECT_GUARD = "essaouira_portal_auth_redirect_inflight";

function getAuthHeaders() {
  const token = window.localStorage.getItem(TOKEN_KEY);
  if (!token) return {};
  return { Authorization: `Bearer ${token}` };
}

async function handleResponse(res) {
  if (!res.ok) {
    const text = await res.text();
    if (res.status === 401) {
      window.localStorage.removeItem(TOKEN_KEY);
      window.localStorage.removeItem(USER_KEY);
      window.localStorage.removeItem(ROLE_KEY);
      window.localStorage.removeItem(TENANT_KEY);

      if (window.location.pathname !== "/login" && !window.sessionStorage.getItem(AUTH_REDIRECT_GUARD)) {
        window.sessionStorage.setItem(AUTH_REDIRECT_GUARD, "1");
        const reason = encodeURIComponent("Sessione scaduta o token non valido. Effettua di nuovo il login.");
        window.location.replace(`/login?reason=${reason}`);
      }
    }
    throw new Error(`Errore API ${res.status}: ${text}`);
  }
  if (window.sessionStorage.getItem(AUTH_REDIRECT_GUARD)) {
    window.sessionStorage.removeItem(AUTH_REDIRECT_GUARD);
  }
  if (res.status === 204) {
    return null;
  }
  return res.json();
}

function buildQuery(params = {}) {
  const searchParams = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== "") {
      searchParams.append(k, v);
    }
  });
  const qs = searchParams.toString();
  return qs ? `?${qs}` : "";
}

/* --------- LOW LEVEL WRAPPERS --------- */

export async function apiGet(path, params) {
  const url = `${BASE_URL}${path}${buildQuery(params)}`;
  const res = await fetch(url, { headers: getAuthHeaders() });
  return handleResponse(res);
}

export async function apiPost(path, body) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...getAuthHeaders() },
    body: JSON.stringify(body),
  });
  return handleResponse(res);
}

export async function apiPut(path, body) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...getAuthHeaders() },
    body: JSON.stringify(body),
  });
  return handleResponse(res);
}

export async function apiDelete(path) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: "DELETE",
    headers: getAuthHeaders(),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Errore API ${res.status}: ${text}`);
  }
  return;
}

/* --------- BASIC --------- */

export function getHealth() {
  return apiGet("/health");
}

/* --------- UNITS --------- */

export function getUnits() {
  return apiGet("/units");
}

export function updateUnit(unitId, payload) {
  return apiPut(`/units/${unitId}`, payload);
}

/* --------- BOOKINGS --------- */

export function getBookings() {
  return apiGet("/bookings");
}

export function createBooking(payload) {
  return apiPost("/bookings", payload);
}

export function updateBooking(id, payload) {
  return apiPut(`/bookings/${id}`, payload);
}

export function deleteBooking(id) {
  return apiDelete(`/bookings/${id}`);
}

/**
 * Calendario/schedule per singola unità
 * params può contenere: { from_date: "2025-11-01", to_date: "2025-11-30" }
 */
export function getUnitSchedule(unitId, params = {}) {
  return apiGet(`/units/${unitId}/schedule`, params);
}

/* --------- ANALYTICS --------- */

// riepilogo base (se lo usiamo ancora in Dashboard)
export function getMonthSummary(year, month) {
  return apiGet("/analytics/month-summary", { year, month });
}

// ricavi, costi, profitto per mese (pagina Business)
export function getMonthPnL(year, month) {
  return apiGet("/analytics/month-pnl", { year, month });
}

// righe di costo dettagliate per il mese (booking + staff + costi manuali)
export function getMonthCostLines(year, month) {
  return apiGet("/analytics/month-cost-lines", { year, month });
}

export function getAdvancedKpis(year, month) {
  return apiGet("/analytics/advanced-kpis", { year, month });
}

export function getTodayAlerts() {
  return apiGet("/alerts/today");
}

export async function downloadMonthCostLinesCsv(year, month) {
  const res = await fetch(
    `${BASE_URL}/analytics/month-cost-lines.csv${buildQuery({ year, month })}`,
    { headers: getAuthHeaders() }
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Errore export CSV ${res.status}: ${text}`);
  }
  return res.blob();
}

/* --------- STAFF TASKS --------- */

export function getStaffTasks(params = {}) {
  return apiGet("/staff-tasks", params);
}

export function createStaffTask(payload) {
  return apiPost("/staff-tasks", payload);
}

export function updateStaffTask(id, payload) {
  return apiPut(`/staff-tasks/${id}`, payload);
}

export function deleteStaffTask(id) {
  return apiDelete(`/staff-tasks/${id}`);
}

/* --------- COST ITEMS --------- */

export function getCostItems(params = {}) {
  return apiGet("/cost-items", params);
}

export function createCostItem(payload) {
  return apiPost("/cost-items", payload);
}

export function updateCostItem(id, payload) {
  return apiPut(`/cost-items/${id}`, payload);
}

export function deleteCostItem(id) {
  return apiDelete(`/cost-items/${id}`);
}

/* --------- STAFF DEFAULTS (config automatismi) --------- */

export function getStaffDefaults() {
  return apiGet("/staff-defaults");
}

export function updateStaffDefaults(payload) {
  return apiPut("/staff-defaults", payload);
}

/* --------- STAFF MEMBERS (ANAGRAFICA) --------- */

export function getStaffMembers(params = {}) {
  return apiGet("/staff-members", params);
}

export function createStaffMember(payload) {
  return apiPost("/staff-members", payload);
}

export function updateStaffMember(id, payload) {
  return apiPut(`/staff-members/${id}`, payload);
}

// soft delete -> mette is_active = false
export function deactivateStaffMember(id) {
  return apiDelete(`/staff-members/${id}`);
}

// hard delete -> cancella dal DB
// ATTENZIONE: Endpoint corretto è DELETE /staff-members/{id} (il backend fa hard delete)
export function deleteStaffMember(id) {
  return apiDelete(`/staff-members/${id}`);
}

/* --------- PRICING DEFAULTS --------- */

export function getPricingDefaults() {
  return apiGet("/pricing-defaults");
}

export function updatePricingDefaults(payload) {
  return apiPut("/pricing-defaults", payload);
}

/* --------- USER MANAGEMENT --------- */

export function getUsers() {
  return apiGet("/users");
}

export function createUser(payload) {
  return apiPost("/users", payload);
}

export function updateUser(id, payload) {
  return apiPut(`/users/${id}`, payload);
}

export function resetUserPassword(id, newPassword) {
  return apiPost(`/users/${id}/reset-password`, { new_password: newPassword });
}

export function deleteUser(id) {
  return apiDelete(`/users/${id}`);
}

/* --------- MAINTENANCE --------- */

export function getMaintenanceTickets() {
  return apiGet("/maintenance");
}

export function createMaintenanceTicket(payload) {
  return apiPost("/maintenance", payload);
}

export function updateMaintenanceTicket(id, payload) {
  return apiPut(`/maintenance/${id}`, payload);
}

export function deleteMaintenanceTicket(id) {
  return apiDelete(`/maintenance/${id}`);
}

/* --------- SMART BUILDING --------- */

export function getSmartOverview() {
  return apiGet("/smart/overview");
}

export function getSmartUnitDetail(unitId, params = {}) {
  return apiGet(`/smart/units/${unitId}`, params);
}

export function getSmartUnitTimeline(unitId, params = {}) {
  return apiGet(`/smart/units/${unitId}/timeline`, params);
}

export function getSmartDevices() {
  return apiGet("/smart/devices");
}

export function createSmartDevice(payload) {
  return apiPost("/smart/devices", payload);
}

export function simulateSmartDeviceSync(deviceId) {
  return apiPost(`/smart/devices/${deviceId}/simulate-sync`, {});
}

export function getSmartAlerts(params = {}) {
  return apiGet("/smart/alerts", params);
}

export function createSmartAlert(payload) {
  return apiPost("/smart/alerts", payload);
}

export function acknowledgeSmartAlert(alertId) {
  return apiPut(`/smart/alerts/${alertId}/acknowledge`, {});
}

export function getSmartScenes() {
  return apiGet("/smart/scenes");
}

export function runSmartScene(sceneId, context = {}) {
  return apiPost(`/smart/scenes/${sceneId}/run`, { context });
}

export function getSmartAutomationRules() {
  return apiGet("/smart/automation-rules");
}

export function triggerSmartAutomationRule(ruleId, payload = {}) {
  return apiPost(`/smart/automation-rules/${ruleId}/trigger`, payload);
}

export function getSmartAutomationExecutions(params = {}) {
  return apiGet("/smart/automation-executions", params);
}
