import { useEffect, useMemo, useState } from "react";
import {
  createPlatformTenant,
  downloadAuditLogsCsv,
  getAuditLogs,
  getCompliancePolicy,
  getPlatformTenants,
} from "../services/api";
import { getCurrentRole } from "../services/auth";

const card = {
  background: "white",
  border: "1px solid #e5e7eb",
  borderRadius: 12,
  padding: 16,
};

function AdminControl() {
  const role = getCurrentRole() || "viewer";
  const isOwner = role === "owner";
  const [tenants, setTenants] = useState([]);
  const [logs, setLogs] = useState([]);
  const [policy, setPolicy] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    tenant_id: "",
    name: "",
    owner_username: "",
    owner_password: "",
  });

  const canManageTenants = useMemo(() => isOwner, [isOwner]);

  async function loadAll() {
    setLoading(true);
    setError("");
    try {
      const [p, l] = await Promise.all([getCompliancePolicy(), getAuditLogs({ limit: 100 })]);
      setPolicy(p);
      setLogs(Array.isArray(l) ? l : []);
      if (canManageTenants) {
        const t = await getPlatformTenants();
        setTenants(Array.isArray(t) ? t : []);
      }
    } catch (e) {
      setError(e?.message || "Errore caricamento dati admin");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canManageTenants]);

  async function onCreateTenant(e) {
    e.preventDefault();
    setError("");
    try {
      await createPlatformTenant(form);
      setForm({ tenant_id: "", name: "", owner_username: "", owner_password: "" });
      await loadAll();
    } catch (e) {
      setError(e?.message || "Errore creazione tenant");
    }
  }

  async function onExportAudit() {
    try {
      const blob = await downloadAuditLogsCsv({ limit: 2000 });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "audit_logs.csv";
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e?.message || "Errore export audit");
    }
  }

  if (loading) return <div style={{ padding: 20 }}>Caricamento admin control...</div>;

  return (
    <div style={{ padding: 20, display: "grid", gap: 16 }}>
      <h1 style={{ margin: 0 }}>Admin Control</h1>
      {error ? <div style={{ color: "#b91c1c" }}>{error}</div> : null}

      <section style={card}>
        <h2 style={{ marginTop: 0 }}>Compliance</h2>
        {policy ? (
          <div style={{ fontSize: 14, color: "#374151" }}>
            <div>Azienda: <strong>{policy.company_name}</strong></div>
            <div>Privacy email: <strong>{policy.privacy_email}</strong></div>
            <div><a href={policy.privacy_url} target="_blank" rel="noreferrer">Privacy policy</a></div>
            <div><a href={policy.terms_url} target="_blank" rel="noreferrer">Terms</a></div>
          </div>
        ) : (
          <div>Nessuna policy caricata.</div>
        )}
      </section>

      <section style={card}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h2 style={{ marginTop: 0, marginBottom: 8 }}>Audit Log</h2>
          <button onClick={onExportAudit}>Export CSV</button>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left" }}>Data</th>
                <th style={{ textAlign: "left" }}>Utente</th>
                <th style={{ textAlign: "left" }}>Ruolo</th>
                <th style={{ textAlign: "left" }}>Metodo</th>
                <th style={{ textAlign: "left" }}>Path</th>
                <th style={{ textAlign: "left" }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((l) => (
                <tr key={l.id}>
                  <td>{l.created_at ? new Date(l.created_at).toLocaleString("it-IT") : "-"}</td>
                  <td>{l.username || "-"}</td>
                  <td>{l.role || "-"}</td>
                  <td>{l.method}</td>
                  <td>{l.path}</td>
                  <td>{l.status_code}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {canManageTenants ? (
        <section style={card}>
          <h2 style={{ marginTop: 0 }}>Tenant Onboarding</h2>
          <form onSubmit={onCreateTenant} style={{ display: "grid", gap: 8, maxWidth: 520 }}>
            <input
              placeholder="tenant_id (es. client-a)"
              value={form.tenant_id}
              onChange={(e) => setForm((s) => ({ ...s, tenant_id: e.target.value }))}
              required
            />
            <input
              placeholder="Nome tenant"
              value={form.name}
              onChange={(e) => setForm((s) => ({ ...s, name: e.target.value }))}
              required
            />
            <input
              placeholder="Owner username"
              value={form.owner_username}
              onChange={(e) => setForm((s) => ({ ...s, owner_username: e.target.value }))}
              required
            />
            <input
              placeholder="Owner password"
              type="password"
              value={form.owner_password}
              onChange={(e) => setForm((s) => ({ ...s, owner_password: e.target.value }))}
              required
            />
            <button type="submit">Crea Tenant</button>
          </form>

          <div style={{ marginTop: 12, fontSize: 13 }}>
            <strong>Tenant registrati:</strong>
            <ul>
              {tenants.map((t) => (
                <li key={t.tenant_id}>
                  {t.tenant_id} - {t.name} ({t.is_active ? "active" : "inactive"})
                </li>
              ))}
            </ul>
          </div>
        </section>
      ) : null}
    </div>
  );
}

export default AdminControl;
