const BASE_URL = "http://localhost:8000";

function buildQuery(params = {}) {
  const esc = encodeURIComponent;
  const entries = Object.entries(params).filter(
    ([, value]) => value !== undefined && value !== null && value !== ""
  );
  if (!entries.length) return "";
  return entries
    .map(([k, v]) => `${esc(k)}=${esc(String(v))}`)
    .join("&");
}

async function handleResponse(res) {
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Errore API ${res.status}: ${text}`);
  }
  return res.json();
}

export async function apiGet(path, params) {
  const qs = params ? buildQuery(params) : "";
  const url = qs ? `${BASE_URL}${path}?${qs}` : `${BASE_URL}${path}`;
  const res = await fetch(url);
  return handleResponse(res);
}

export async function apiPost(path, body) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return handleResponse(res);
}

export async function apiPut(path, body) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return handleResponse(res);
}

export async function apiDelete(path) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: "DELETE",
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Errore API ${res.status}: ${text}`);
  }
  return true;
}

// --------- BASE ---------

export function getHealth() {
  return apiGet("/health");
}

// --------- UNITS ---------

export function getUnits() {
  return apiGet("/units");
}

export function getUnitSchedule(unitId, params = {}) {
  return apiGet(`/units/${unitId}/schedule`, params);
}

// --------- BOOKINGS ---------

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

// --------- STAFF TASKS ---------

export function getStaffTasks(params = {}) {
  // supporta from_date, to_date, date=YYYY-MM-DD
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

// --------- STAFF DEFAULTS (impostazioni automatiche) ---------

export function getStaffDefaults() {
  return apiGet("/staff-defaults");
}

export function updateStaffDefaults(payload) {
  return apiPut("/staff-defaults", payload);
}
// --------- COST ITEMS ---------

export function getCostItems(params = {}) {
  // supporta from_date, to_date
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

// --------- ANALYTICS / BUSINESS ---------

export function getMonthSummary(year, month) {
  return apiGet("/analytics/month-summary", { year, month });
}
