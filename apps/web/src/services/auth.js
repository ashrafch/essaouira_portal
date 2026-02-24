const TOKEN_KEY = "essaouira_portal_token";
const USER_KEY = "essaouira_portal_user";

export function getAccessToken() {
  return window.localStorage.getItem(TOKEN_KEY);
}

export function setAuthSession({ accessToken, username }) {
  window.localStorage.setItem(TOKEN_KEY, accessToken);
  window.localStorage.setItem(USER_KEY, username);
}

export function clearAuthSession() {
  window.localStorage.removeItem(TOKEN_KEY);
  window.localStorage.removeItem(USER_KEY);
}

export function getCurrentUsername() {
  return window.localStorage.getItem(USER_KEY);
}

export function isAuthenticated() {
  return Boolean(getAccessToken());
}

export async function login(username, password, baseUrl) {
  const apiBase = (baseUrl || import.meta.env.VITE_API_BASE_URL || "http://localhost:8000").trim();
  const res = await fetch(`${apiBase}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });

  if (!res.ok) {
    const msg = await res.text();
    throw new Error(msg || "Login fallito");
  }

  const data = await res.json();
  setAuthSession({ accessToken: data.access_token, username: data.username });
  return data;
}
