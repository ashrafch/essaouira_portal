import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { isAuthenticated, login } from "../services/auth";

function Login() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [tenantId, setTenantId] = useState("default");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (isAuthenticated()) {
      navigate("/", { replace: true });
    }
  }, [navigate]);

  useEffect(() => {
    if (searchParams.get("reason") === "expired") {
      setError("Sessione scaduta o token non valido. Effettua di nuovo il login.");
    }
  }, [searchParams]);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login(username.trim(), password, tenantId.trim() || "default");
      navigate("/", { replace: true });
    } catch {
      setError("Credenziali non valide.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "var(--color-bg)", padding: 20 }}>
      <form onSubmit={handleSubmit} style={{ width: "100%", maxWidth: 360, background: "var(--color-surface)", borderRadius: 14, padding: 20, border: "1px solid var(--color-border)", boxShadow: "var(--shadow-sm)" }}>
        <h1 style={{ margin: 0, fontSize: 20 }}>Accesso Portale</h1>
        <p style={{ marginTop: 6, marginBottom: 14, fontSize: 13, color: "var(--color-text-muted)" }}>Inserisci le credenziali di gestione.</p>

        <label htmlFor="login-username" style={{ fontSize: 12, fontWeight: 600, color: "var(--color-text)" }}>Username</label>
        <input id="login-username" name="username" autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} required autoFocus style={{ marginTop: 4, marginBottom: 10 }} />

        <label htmlFor="login-password" style={{ fontSize: 12, fontWeight: 600, color: "var(--color-text)" }}>Password</label>
        <input id="login-password" name="password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required style={{ marginTop: 4, marginBottom: 10 }} />

        <label htmlFor="login-tenant" style={{ fontSize: 12, fontWeight: 600, color: "var(--color-text)" }}>Tenant</label>
        <input id="login-tenant" name="tenant" autoComplete="organization" value={tenantId} onChange={(e) => setTenantId(e.target.value)} required style={{ marginTop: 4, marginBottom: 10 }} />

        {error && <p role="alert" style={{ color: "var(--color-danger)", fontSize: 12, marginBottom: 10 }}>{error}</p>}

        <button type="submit" disabled={loading} style={{ width: "100%" }}>
          {loading ? "Accesso..." : "Accedi"}
        </button>
      </form>
    </div>
  );
}

export default Login;
