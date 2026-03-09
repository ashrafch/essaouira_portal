const TOKEN_KEY = "essaouira_portal_token";
const USER_KEY = "essaouira_portal_user";
const ROLE_KEY = "essaouira_portal_role";
const TENANT_KEY = "essaouira_portal_tenant";

function decodeJwtPayload(token) {
  try {
    const parts = String(token || "").split(".");
    if (parts.length < 2) return null;
    const base64Url = parts[1];
    const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
    return JSON.parse(window.atob(padded));
  } catch {
    return null;
  }
}

function isTokenExpired(token) {
  const payload = decodeJwtPayload(token);
  if (!payload || typeof payload.exp !== "number") {
    return false;
  }
  const nowSec = Math.floor(Date.now() / 1000);
  return payload.exp <= nowSec;
}

export function getAccessToken() {
  return window.localStorage.getItem(TOKEN_KEY);
}

export function setAuthSession({ accessToken, username, role, tenantId }) {
  window.localStorage.setItem(TOKEN_KEY, accessToken);
  window.localStorage.setItem(USER_KEY, username);
  window.localStorage.setItem(ROLE_KEY, role || "owner");
  window.localStorage.setItem(TENANT_KEY, tenantId || "default");
}

export function clearAuthSession() {
  window.localStorage.removeItem(TOKEN_KEY);
  window.localStorage.removeItem(USER_KEY);
  window.localStorage.removeItem(ROLE_KEY);
  window.localStorage.removeItem(TENANT_KEY);
}

export function getCurrentUsername() {
  return window.localStorage.getItem(USER_KEY);
}

export function getCurrentRole() {
  return window.localStorage.getItem(ROLE_KEY) || "owner";
}

export function getCurrentTenant() {
  return window.localStorage.getItem(TENANT_KEY) || "default";
}

export function isAuthenticated() {
  const token = getAccessToken();
  if (!token) return false;
  if (isTokenExpired(token)) {
    clearAuthSession();
    return false;
  }
  return true;
}

export async function login(username, password, tenantId = "default", baseUrl) {
  const apiBase = (baseUrl || import.meta.env.VITE_API_BASE_URL || "http://localhost:8000").trim();
  const res = await fetch(`${apiBase}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password, tenant_id: tenantId || "default" }),
  });

  if (!res.ok) {
    const msg = await res.text();
    throw new Error(msg || "Login fallito");
  }

  const data = await res.json();
  setAuthSession({
    accessToken: data.access_token,
    username: data.username,
    role: data.role,
    tenantId: data.tenant_id,
  });
  return data;
}
