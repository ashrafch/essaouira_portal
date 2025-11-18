const BASE_URL = "http://localhost:8000";

async function handleResponse(res) {
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Errore API ${res.status}: ${text}`);
  }
  return res.json();
}

export async function apiGet(path) {
  const res = await fetch(`${BASE_URL}${path}`);
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
  const res = await fetch(`${BASE_URL}${path}`, { method: "DELETE" });
  if (!res.ok && res.status !== 204) {
    const text = await res.text();
    throw new Error(`Errore API ${res.status}: ${text}`);
  }
}

// ---- funzioni specifiche ----

export function getHealth() {
  return apiGet("/health");
}

export function getUnits() {
  return apiGet("/units");
}

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
