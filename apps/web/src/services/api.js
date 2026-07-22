import { clearAuthSession, getAccessToken } from "./auth";

const BASE_URL =
  import.meta.env.VITE_API_BASE_URL?.trim() || "http://localhost:8000";
let unauthorizedHandled = false;

function getAuthHeaders() {
  const token = getAccessToken();
  if (!token) return {};
  return { Authorization: `Bearer ${token}` };
}

async function handleResponse(res, requestToken = null) {
  if (res.status === 401) {
    const currentToken = getAccessToken();
    const shouldHandle =
      (requestToken && currentToken && requestToken === currentToken) ||
      (!requestToken && !currentToken);
    if (shouldHandle && !unauthorizedHandled) {
      unauthorizedHandled = true;
      clearAuthSession();
      if (window.location.pathname !== "/login") {
        window.location.href = "/login?reason=expired";
      }
    }
    throw new Error("Sessione scaduta o token non valido. Effettua di nuovo il login.");
  }
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Errore API ${res.status}: ${text}`);
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
  const requestToken = getAccessToken();
  const res = await fetch(url, { headers: getAuthHeaders() });
  return handleResponse(res, requestToken);
}

export async function apiPost(path, body) {
  const requestToken = getAccessToken();
  const res = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...getAuthHeaders() },
    body: JSON.stringify(body),
  });
  return handleResponse(res, requestToken);
}

export async function apiPut(path, body) {
  const requestToken = getAccessToken();
  const res = await fetch(`${BASE_URL}${path}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...getAuthHeaders() },
    body: JSON.stringify(body),
  });
  return handleResponse(res, requestToken);
}

export async function apiDelete(path) {
  const requestToken = getAccessToken();
  const res = await fetch(`${BASE_URL}${path}`, {
    method: "DELETE",
    headers: getAuthHeaders(),
  });
  await handleResponse(res, requestToken);
  return null;
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

export function getProperties() {
  return apiGet("/properties");
}

export function createProperty(payload) {
  return apiPost("/properties", payload);
}

export function updateProperty(propertyId, payload) {
  return apiPut(`/properties/${propertyId}`, payload);
}

export function deleteProperty(propertyId) {
  return apiDelete(`/properties/${propertyId}`);
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

/* --------- REVENUE / RATE CALENDAR --------- */

/**
 * Calendario tariffe per unità. params: { from_date, to_date }.
 * Ritorna { unit_id, unit_name, from_date, to_date, currency, days[] }
 * dove ogni giorno ha price/min_stay/price_source/is_override/is_stored.
 */
export function getRateCalendar(unitId, params = {}) {
  return apiGet("/revenue/rate-calendar", { unit_id: unitId, ...params });
}

// entries: [{ date, price, min_stay?, currency? }]
export function upsertRateCalendar(unitId, entries) {
  return apiPut("/revenue/rate-calendar", { unit_id: unitId, entries });
}

export function deleteRateCalendarDay(unitId, day) {
  return apiDelete(`/revenue/rate-calendar?unit_id=${unitId}&day=${day}`);
}

export function getRevenueRecommendations(unitId, params = {}) {
  return apiGet("/revenue/recommendations", { unit_id: unitId, ...params });
}

export function applyRevenueRecommendations(unitId, fromDate, toDate) {
  return apiPost("/revenue/recommendations/apply", {
    unit_id: unitId,
    from_date: fromDate,
    to_date: toDate,
  });
}

// Pricing seasons (date-range adjustments)
export function getSeasons() {
  return apiGet("/revenue/seasons");
}
export function createSeason(payload) {
  return apiPost("/revenue/seasons", payload);
}
export function updateSeason(id, payload) {
  return apiPut(`/revenue/seasons/${id}`, payload);
}
export function deleteSeason(id) {
  return apiDelete(`/revenue/seasons/${id}`);
}

// Lead-time rules (adjust by days-until-date)
export function getLeadTimeRules() {
  return apiGet("/revenue/lead-time-rules");
}
export function createLeadTimeRule(payload) {
  return apiPost("/revenue/lead-time-rules", payload);
}
export function updateLeadTimeRule(id, payload) {
  return apiPut(`/revenue/lead-time-rules/${id}`, payload);
}
export function deleteLeadTimeRule(id) {
  return apiDelete(`/revenue/lead-time-rules/${id}`);
}

// Channel connections (iCal availability sync)
export function getChannels(unitId) {
  return apiGet("/revenue/channels", unitId != null ? { unit_id: unitId } : {});
}
export function createChannel(payload) {
  return apiPost("/revenue/channels", payload);
}
export function updateChannel(id, payload) {
  return apiPut(`/revenue/channels/${id}`, payload);
}
export function deleteChannel(id) {
  return apiDelete(`/revenue/channels/${id}`);
}
export function syncChannel(id) {
  return apiPost(`/revenue/channels/${id}/sync`, {});
}
export function getChannelExportInfo(unitId) {
  return apiGet(`/revenue/channels/units/${unitId}/export-info`);
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

export function getSmartDashboard(params = {}) {
  return apiGet("/smart/dashboard", params);
}

export function getSmartReadiness(params = {}) {
  return apiGet("/smart/readiness", params);
}

export function getSmartPropertyReadiness(propertyId, params = {}) {
  return apiGet(`/smart/readiness/property/${propertyId}`, params);
}

export function getSmartUnitReadiness(unitId) {
  return apiGet(`/smart/readiness/unit/${unitId}`);
}

export function getSmartOperations(params = {}) {
  return apiGet("/smart/operations", params);
}

export function getSmartCheckinAssistant(params = {}) {
  return apiGet("/smart/assistant/checkin", params);
}

export function getSmartCheckinAssistantBooking(bookingId) {
  return apiGet(`/smart/assistant/checkin/${bookingId}`);
}

export function getSmartCheckoutAssistant(params = {}) {
  return apiGet("/smart/assistant/checkout", params);
}

export function getSmartCheckoutAssistantBooking(bookingId) {
  return apiGet(`/smart/assistant/checkout/${bookingId}`);
}

export function getSmartOperationsUnitsNeedingAttention(params = {}) {
  return apiGet("/smart/operations/units-needing-attention", params);
}

export function getSmartOperationsIssues(params = {}) {
  return apiGet("/smart/operations/issues", params);
}

export function getSmartOperationsActivity(params = {}) {
  return apiGet("/smart/operations/activity", params);
}

export function getSmartUnitDetail(unitId, params = {}) {
  return apiGet(`/smart/units/${unitId}`, params);
}

export function getSmartUnitTimeline(unitId, params = {}) {
  return apiGet(`/smart/units/${unitId}/timeline`, params);
}

export function getSmartDevices() {
  return apiGet("/smart/devices", { include_freshness: true });
}

export function getSmartDevice(deviceId) {
  return apiGet(`/smart/devices/${deviceId}`);
}

export function getSmartDeviceHealth(params = {}) {
  return apiGet("/smart/device-health", params);
}

export function getSmartUnitDeviceHealth(unitId) {
  return apiGet(`/smart/units/${unitId}/device-health`);
}

export function getSingleSmartDeviceHealth(deviceId) {
  return apiGet(`/smart/devices/${deviceId}/health`);
}

export function getSmartDeviceTelemetry(deviceId, params = {}) {
  return apiGet(`/smart/telemetry/device/${deviceId}`, params);
}

export function getSmartUnitTelemetry(unitId, params = {}) {
  return apiGet(`/smart/telemetry/unit/${unitId}`, params);
}

export function getSmartPropertyTelemetry(propertyId, params = {}) {
  return apiGet(`/smart/telemetry/property/${propertyId}`, params);
}

export function getSmartTelemetryInsights(params = {}) {
  return apiGet("/smart/telemetry-insights", params);
}

export function getSmartPropertyTelemetryInsights(propertyId, params = {}) {
  return apiGet(`/smart/telemetry-insights/property/${propertyId}`, params);
}

export function getSmartUnitTelemetryInsights(unitId, params = {}) {
  return apiGet(`/smart/telemetry-insights/unit/${unitId}`, params);
}

export function createSmartDevice(payload) {
  return apiPost("/smart/devices", payload);
}

export function updateSmartDevice(deviceId, payload) {
  return apiPut(`/smart/devices/${deviceId}`, payload);
}

export function deleteSmartDevice(deviceId) {
  return apiDelete(`/smart/devices/${deviceId}`);
}

export function simulateSmartDeviceSync(deviceId) {
  return apiPost(`/smart/devices/${deviceId}/simulate-sync`, {});
}

export function syncSmartProvider(provider = "mock") {
  return apiPost(`/smart/providers/sync?provider=${encodeURIComponent(provider)}`, {});
}

export function pollSmartProvider(provider = "mock") {
  return apiPost(`/smart/providers/poll?provider=${encodeURIComponent(provider)}`, {});
}

export function getSmartAlerts(params = {}) {
  return apiGet("/smart/alerts", { include_freshness: true, ...params });
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

export function getSmartProviderConnections(params = {}) {
  return apiGet("/smart/provider-connections", params);
}

export function createSmartProviderConnection(payload) {
  return apiPost("/smart/provider-connections", payload);
}

export function updateSmartProviderConnection(connectionId, payload) {
  return apiPut(`/smart/provider-connections/${connectionId}`, payload);
}

export function getSmartScenarioPacks() {
  return apiGet("/smart/scenario-packs");
}

export function getEnabledSmartScenarioPacks(params = {}) {
  return apiGet("/smart/scenario-packs/enabled", params);
}

export function enableSmartScenarioPack(payload) {
  return apiPost("/smart/scenario-packs/enable", payload);
}

/* --------- SETUP WIZARD --------- */

export function setupStart() {
  return apiPost("/setup/start", {});
}

export function getSetupSession() {
  return apiGet("/setup/session");
}

export function setupProperty(payload) {
  return apiPost("/setup/property", payload);
}

export function setupUnits(payload) {
  return apiPost("/setup/units", payload);
}

export function setupConnectProvider(payload) {
  return apiPost("/setup/connect-provider", payload);
}

export function setupImportDevices(payload = {}) {
  return apiPost("/setup/import-devices", payload);
}

export function setupAssignDevices(payload) {
  return apiPost("/setup/assign-devices", payload);
}

export function setupEnableAutomations(payload) {
  return apiPost("/setup/enable-automations", payload);
}

export function setupComplete() {
  return apiPost("/setup/complete", {});
}

/* --------- DASHBOARD & REPORTS --------- */

// Single lightweight call powering sidebar badges + the mission-control home.
export function getDashboardSummary() {
  return apiGet("/dashboard/summary");
}

export function getOwnerMonthlyReport(year, month) {
  return apiGet("/analytics/report/monthly", { year, month });
}

// Direct URL for the CSV download (opened in a new tab / anchor href).
export function ownerMonthlyReportCsvUrl(year, month) {
  return `${BASE_URL}/analytics/report/monthly.csv${buildQuery({ year, month })}`;
}
