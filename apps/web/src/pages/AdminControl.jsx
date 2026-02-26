import { useEffect, useMemo, useState } from "react";
import AppModal from "../components/AppModal";
import useIsMobile from "../hooks/useIsMobile";
import {
  createPlatformTenant,
  downloadAuditLogsCsv,
  getAuditLogs,
  getCompliancePolicy,
  getPlatformTenants,
  updatePlatformTenant,
} from "../services/api";
import { getCurrentRole } from "../services/auth";
import PageInfoHelp from "../components/PageInfoHelp";

const card = {
  background: "linear-gradient(180deg,#fff 0%,#f8fafc 100%)",
  border: "1px solid #e2e8f0",
  borderRadius: 16,
  padding: 16,
  boxShadow: "0 8px 20px rgba(15,23,42,0.05)",
};

const STEPS = [
  { id: 1, title: "Tenant" },
  { id: 2, title: "Owner" },
  { id: 3, title: "Review" },
];

function normalizeTenantId(value) {
  return (value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/--+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function AdminControl() {
  const isMobile = useIsMobile(900);
  const role = getCurrentRole() || "viewer";
  const isOwner = role === "owner";

  const [tenants, setTenants] = useState([]);
  const [logs, setLogs] = useState([]);
  const [policy, setPolicy] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [isTenantModalOpen, setIsTenantModalOpen] = useState(false);
  const [wizardStep, setWizardStep] = useState(1);
  const [isCreatingTenant, setIsCreatingTenant] = useState(false);
  const [tenantSearch, setTenantSearch] = useState("");
  const [editingTenant, setEditingTenant] = useState(null);
  const [isBrandModalOpen, setIsBrandModalOpen] = useState(false);

  const [form, setForm] = useState({
    tenant_id: "",
    name: "",
    owner_username: "",
    owner_password: "",
    brand_primary_color: "",
    brand_logo_url: "",
  });

  const [onboardingResult, setOnboardingResult] = useState(null);

  const canManageTenants = useMemo(() => isOwner, [isOwner]);

  const sanitizedTenantId = useMemo(
    () => normalizeTenantId(form.tenant_id),
    [form.tenant_id]
  );

  const passwordChecks = useMemo(() => {
    const p = form.owner_password || "";
    return {
      minLength: p.length >= 10,
      hasUpper: /[A-Z]/.test(p),
      hasLower: /[a-z]/.test(p),
      hasNumber: /[0-9]/.test(p),
      hasSymbol: /[^A-Za-z0-9]/.test(p),
    };
  }, [form.owner_password]);

  const passwordPolicyOk =
    passwordChecks.minLength &&
    passwordChecks.hasUpper &&
    passwordChecks.hasLower &&
    passwordChecks.hasNumber &&
    passwordChecks.hasSymbol;

  const filteredTenants = useMemo(() => {
    const q = tenantSearch.trim().toLowerCase();
    if (!q) return tenants;
    return tenants.filter(
      (t) =>
        (t.tenant_id || "").toLowerCase().includes(q) ||
        (t.name || "").toLowerCase().includes(q)
    );
  }, [tenants, tenantSearch]);

  async function loadAll() {
    setLoading(true);
    setError("");
    try {
      const [p, l] = await Promise.all([
        getCompliancePolicy(),
        getAuditLogs({ limit: 100 }),
      ]);
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

  function resetWizard() {
    setWizardStep(1);
    setIsCreatingTenant(false);
    setOnboardingResult(null);
    setForm({
      tenant_id: "",
      name: "",
      owner_username: "",
      owner_password: "",
      brand_primary_color: "",
      brand_logo_url: "",
    });
  }

  function openWizard() {
    resetWizard();
    setIsTenantModalOpen(true);
  }

  function closeWizard() {
    setIsTenantModalOpen(false);
    resetWizard();
  }

  function nextStep() {
    if (wizardStep === 1) {
      if (!sanitizedTenantId || !form.name.trim()) {
        setError("Compila tenant_id e nome tenant.");
        return;
      }
      if (!form.owner_username.trim()) {
        setForm((prev) => ({ ...prev, owner_username: `${sanitizedTenantId}-owner` }));
      }
    }

    if (wizardStep === 2) {
      if (!form.owner_username.trim()) {
        setError("Owner username obbligatorio.");
        return;
      }
      if (!passwordPolicyOk) {
        setError("Password owner non conforme alla policy.");
        return;
      }
    }

    setError("");
    setWizardStep((s) => Math.min(3, s + 1));
  }

  function prevStep() {
    setError("");
    setWizardStep((s) => Math.max(1, s - 1));
  }

  async function submitWizard(e) {
    e.preventDefault();
    if (!sanitizedTenantId || !form.name.trim() || !form.owner_username.trim() || !passwordPolicyOk) {
      setError("Dati wizard incompleti o non validi.");
      return;
    }

    setError("");
    setIsCreatingTenant(true);
    try {
      await createPlatformTenant({
        tenant_id: sanitizedTenantId,
        name: form.name.trim(),
        owner_username: form.owner_username.trim(),
        owner_password: form.owner_password,
        brand_primary_color: form.brand_primary_color.trim() || null,
        brand_logo_url: form.brand_logo_url.trim() || null,
      });

      const result = {
        tenant_id: sanitizedTenantId,
        name: form.name.trim(),
        owner_username: form.owner_username.trim(),
      };
      setOnboardingResult(result);
      await loadAll();
    } catch (e) {
      setError(e?.message || "Errore creazione tenant");
    } finally {
      setIsCreatingTenant(false);
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

  async function saveTenantBranding(e) {
    e.preventDefault();
    if (!editingTenant?.tenant_id) return;
    try {
      await updatePlatformTenant(editingTenant.tenant_id, {
        name: editingTenant.name?.trim() || editingTenant.tenant_id,
        is_active: Boolean(editingTenant.is_active),
        brand_primary_color: editingTenant.brand_primary_color?.trim() || null,
        brand_logo_url: editingTenant.brand_logo_url?.trim() || null,
      });
      setIsBrandModalOpen(false);
      setEditingTenant(null);
      await loadAll();
    } catch (e2) {
      setError(e2?.message || "Errore aggiornando tenant");
    }
  }

  function renderWizardStep() {
    if (onboardingResult) {
      return (
        <div style={{ display: "grid", gap: 10 }}>
          <div
            style={{
              border: "1px solid #bbf7d0",
              background: "#f0fdf4",
              color: "#166534",
              borderRadius: 10,
              padding: 10,
              fontSize: 13,
            }}
          >
            Tenant creato correttamente.
          </div>
          <div style={{ fontSize: 13, color: "#334155", display: "grid", gap: 4 }}>
            <div>Tenant ID: <strong>{onboardingResult.tenant_id}</strong></div>
            <div>Nome: <strong>{onboardingResult.name}</strong></div>
            <div>Owner username: <strong>{onboardingResult.owner_username}</strong></div>
            <div>Login URL: <strong>http://localhost:8081/login</strong></div>
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, flexWrap: "wrap" }}>
            <button type="button" onClick={closeWizard} style={{ background: "white", color: "#111827", border: "1px solid #d1d5db" }}>
              Chiudi
            </button>
            <button
              type="button"
              onClick={() => {
                resetWizard();
                setWizardStep(1);
              }}
            >
              Crea altro tenant
            </button>
          </div>
        </div>
      );
    }

    if (wizardStep === 1) {
      return (
        <div style={{ display: "grid", gap: 10 }}>
          <input
            placeholder="tenant_id (es. riad-essaouira)"
            value={form.tenant_id}
            onChange={(e) => setForm((s) => ({ ...s, tenant_id: e.target.value }))}
            required
          />
          <div style={{ fontSize: 12, color: "#64748b" }}>
            tenant_id normalizzato: <strong>{sanitizedTenantId || "-"}</strong>
          </div>
          <input
            placeholder="Nome tenant (es. Riad Essaouira)"
            value={form.name}
            onChange={(e) => setForm((s) => ({ ...s, name: e.target.value }))}
            required
          />
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "120px 1fr", gap: 8 }}>
            <input
              placeholder="#0f766e"
              value={form.brand_primary_color}
              onChange={(e) => setForm((s) => ({ ...s, brand_primary_color: e.target.value }))}
            />
            <input
              placeholder="Logo URL (opzionale)"
              value={form.brand_logo_url}
              onChange={(e) => setForm((s) => ({ ...s, brand_logo_url: e.target.value }))}
            />
          </div>
        </div>
      );
    }

    if (wizardStep === 2) {
      return (
        <div style={{ display: "grid", gap: 10 }}>
          <input
            placeholder="Owner username"
            value={form.owner_username}
            onChange={(e) => setForm((s) => ({ ...s, owner_username: e.target.value }))}
            required
          />
          <input
            type="password"
            placeholder="Owner password"
            value={form.owner_password}
            onChange={(e) => setForm((s) => ({ ...s, owner_password: e.target.value }))}
            required
          />
          <div style={{ border: "1px solid #e2e8f0", borderRadius: 10, background: "#f8fafc", padding: 10, fontSize: 12 }}>
            <div>Password policy:</div>
            <div>- min 10 caratteri ({passwordChecks.minLength ? "ok" : "no"})</div>
            <div>- maiuscola ({passwordChecks.hasUpper ? "ok" : "no"})</div>
            <div>- minuscola ({passwordChecks.hasLower ? "ok" : "no"})</div>
            <div>- numero ({passwordChecks.hasNumber ? "ok" : "no"})</div>
            <div>- simbolo ({passwordChecks.hasSymbol ? "ok" : "no"})</div>
          </div>
        </div>
      );
    }

    return (
      <div style={{ display: "grid", gap: 8, fontSize: 13, color: "#334155" }}>
        <div>Tenant ID: <strong>{sanitizedTenantId}</strong></div>
        <div>Nome tenant: <strong>{form.name.trim()}</strong></div>
        <div>Owner username: <strong>{form.owner_username.trim()}</strong></div>
        <div>Brand color: <strong>{form.brand_primary_color.trim() || "-"}</strong></div>
        <div>Brand logo URL: <strong>{form.brand_logo_url.trim() || "-"}</strong></div>
        <div>
          Password owner: <strong>{form.owner_password ? "impostata" : "mancante"}</strong>
        </div>
        <div style={{ border: "1px solid #e2e8f0", borderRadius: 10, background: "#f8fafc", padding: 10 }}>
          Dopo la creazione, il nuovo owner potra fare login con `tenant_id` dedicato e gestire utenti e dati del suo account.
        </div>
      </div>
    );
  }

  if (loading) return <div style={{ padding: 20 }}>Caricamento admin control...</div>;

  return (
    <div style={{ padding: 4, display: "grid", gap: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <h1 style={{ margin: 0 }}>Admin Control</h1>
        <PageInfoHelp title="Come usare Admin Control">
          <p>Area governance piattaforma: compliance, audit e onboarding tenant.</p>
          <ul style={{ margin: 0, paddingLeft: 18, display: "grid", gap: 4 }}>
            <li>Compliance mostra policy legali configurate.</li>
            <li>Audit Log traccia azioni utente per sicurezza e controllo.</li>
            <li>Tenant Onboarding (owner) crea nuovi clienti/ambienti.</li>
          </ul>
        </PageInfoHelp>
      </div>
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
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
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
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <h2 style={{ marginTop: 0, marginBottom: 8 }}>Tenant Onboarding</h2>
            <button type="button" onClick={openWizard}>Nuovo tenant (wizard)</button>
          </div>

          <div style={{ marginBottom: 8 }}>
            <input
              value={tenantSearch}
              onChange={(e) => setTenantSearch(e.target.value)}
              placeholder="Cerca tenant per id o nome"
              style={{ maxWidth: isMobile ? "100%" : 360 }}
            />
          </div>

          <div style={{ marginTop: 6, fontSize: 13 }}>
            <strong>Tenant registrati: {filteredTenants.length}</strong>
            <div style={{ marginTop: 8, display: "grid", gap: 8 }}>
              {filteredTenants.map((t) => (
                <div
                  key={t.tenant_id}
                  style={{
                    border: "1px solid #e2e8f0",
                    borderRadius: 10,
                    padding: 10,
                    background: "#ffffff",
                    display: "grid",
                    gridTemplateColumns: isMobile ? "1fr" : "1fr auto",
                    gap: 6,
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 700 }}>{t.name}</div>
                    <div style={{ color: "#64748b", fontSize: 12 }}>tenant_id: {t.tenant_id}</div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4, fontSize: 11, color: "#64748b" }}>
                      <span
                        style={{
                          width: 10,
                          height: 10,
                          borderRadius: 999,
                          border: "1px solid #cbd5e1",
                          background: t.brand_primary_color || "#e2e8f0",
                        }}
                      />
                      {t.brand_primary_color || "no brand color"}
                    </div>
                  </div>
                  <div style={{ alignSelf: "center", fontSize: 12, display: "flex", gap: 6, flexWrap: "wrap", justifyContent: isMobile ? "flex-start" : "flex-end" }}>
                    <span
                      style={{
                        borderRadius: 999,
                        padding: "3px 8px",
                        border: "1px solid #d1d5db",
                        background: t.is_active ? "#ecfdf5" : "#f8fafc",
                        color: t.is_active ? "#166534" : "#6b7280",
                      }}
                    >
                      {t.is_active ? "active" : "inactive"}
                    </span>
                    <button
                      type="button"
                      style={{
                        borderRadius: 999,
                        border: "1px solid #d1d5db",
                        background: "#fff",
                        color: "#334155",
                        padding: "3px 8px",
                        fontSize: 11,
                      }}
                      onClick={() => {
                        setEditingTenant({
                          tenant_id: t.tenant_id,
                          name: t.name || "",
                          is_active: Boolean(t.is_active),
                          brand_primary_color: t.brand_primary_color || "",
                          brand_logo_url: t.brand_logo_url || "",
                        });
                        setIsBrandModalOpen(true);
                      }}
                    >
                      Branding
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <AppModal
            open={isTenantModalOpen}
            onClose={closeWizard}
            title="Onboarding nuovo tenant"
            maxWidth={700}
          >
            <form onSubmit={submitWizard} style={{ display: "grid", gap: 12 }}>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {STEPS.map((s) => (
                  <div
                    key={s.id}
                    style={{
                      borderRadius: 999,
                      padding: "4px 10px",
                      fontSize: 12,
                      border: "1px solid #d1d5db",
                      background: wizardStep === s.id ? "#0f766e" : "#ffffff",
                      color: wizardStep === s.id ? "#ffffff" : "#334155",
                    }}
                  >
                    {s.id}. {s.title}
                  </div>
                ))}
              </div>

              {renderWizardStep()}

              {!onboardingResult ? (
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                  <button
                    type="button"
                    onClick={prevStep}
                    disabled={wizardStep === 1 || isCreatingTenant}
                    style={{ background: "white", color: "#111827", border: "1px solid #d1d5db" }}
                  >
                    Indietro
                  </button>

                  {wizardStep < 3 ? (
                    <button type="button" onClick={nextStep} disabled={isCreatingTenant}>
                      Continua
                    </button>
                  ) : (
                    <button type="submit" disabled={isCreatingTenant}>
                      {isCreatingTenant ? "Creazione in corso..." : "Crea tenant"}
                    </button>
                  )}
                </div>
              ) : null}
            </form>
          </AppModal>

          <AppModal
            open={isBrandModalOpen}
            onClose={() => {
              setIsBrandModalOpen(false);
              setEditingTenant(null);
            }}
            title="Modifica branding tenant"
            maxWidth={620}
          >
            {editingTenant ? (
              <form onSubmit={saveTenantBranding} style={{ display: "grid", gap: 10 }}>
                <input
                  value={editingTenant.name}
                  onChange={(e) =>
                    setEditingTenant((s) => ({ ...s, name: e.target.value }))
                  }
                  placeholder="Nome tenant"
                />
                <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "120px 1fr", gap: 8 }}>
                  <input
                    value={editingTenant.brand_primary_color}
                    onChange={(e) =>
                      setEditingTenant((s) => ({ ...s, brand_primary_color: e.target.value }))
                    }
                    placeholder="#0f766e"
                  />
                  <input
                    value={editingTenant.brand_logo_url}
                    onChange={(e) =>
                      setEditingTenant((s) => ({ ...s, brand_logo_url: e.target.value }))
                    }
                    placeholder="Logo URL"
                  />
                </div>
                <label style={{ fontSize: 13, color: "#334155" }}>
                  <input
                    type="checkbox"
                    checked={editingTenant.is_active}
                    onChange={(e) =>
                      setEditingTenant((s) => ({ ...s, is_active: e.target.checked }))
                    }
                  />{" "}
                  Tenant attivo
                </label>
                <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, flexWrap: "wrap" }}>
                  <button
                    type="button"
                    onClick={() => {
                      setIsBrandModalOpen(false);
                      setEditingTenant(null);
                    }}
                    style={{ background: "white", color: "#111827", border: "1px solid #d1d5db" }}
                  >
                    Annulla
                  </button>
                  <button type="submit">Salva branding</button>
                </div>
              </form>
            ) : null}
          </AppModal>
        </section>
      ) : null}
    </div>
  );
}

export default AdminControl;
