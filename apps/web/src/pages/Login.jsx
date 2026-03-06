import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { isAuthenticated, login } from "../services/auth";

function Login() {
  const navigate = useNavigate();
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
    <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "#f3f4f6", padding: 20 }}>
      <form onSubmit={handleSubmit} style={{ width: "100%", maxWidth: 360, background: "white", borderRadius: 14, padding: 20, border: "1px solid #e5e7eb", boxShadow: "0 1px 6px rgba(0,0,0,0.06)" }}>
        <h1 style={{ margin: 0, fontSize: 20 }}>Accesso Portale</h1>
        <p style={{ marginTop: 6, marginBottom: 14, fontSize: 13, color: "#6b7280" }}>Inserisci le credenziali di gestione.</p>

        <label style={{ fontSize: 12, fontWeight: 600, color: "#374151" }}>Username</label>
        <input value={username} onChange={(e) => setUsername(e.target.value)} required autoFocus style={{ marginTop: 4, marginBottom: 10 }} />

        <label style={{ fontSize: 12, fontWeight: 600, color: "#374151" }}>Password</label>
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required style={{ marginTop: 4, marginBottom: 10 }} />

        <label style={{ fontSize: 12, fontWeight: 600, color: "#374151" }}>Tenant</label>
        <input value={tenantId} onChange={(e) => setTenantId(e.target.value)} required style={{ marginTop: 4, marginBottom: 10 }} />

        {error && <p style={{ color: "#b91c1c", fontSize: 12, marginBottom: 10 }}>{error}</p>}

        <button type="submit" disabled={loading} style={{ width: "100%" }}>
          {loading ? "Accesso..." : "Accedi"}
        </button>
      </form>
    </div>
  );
}

export default Login;
