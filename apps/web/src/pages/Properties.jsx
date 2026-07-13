import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  createProperty,
  createSmartProviderConnection,
  getProperties,
  getSmartProviderConnections,
} from "../services/api";
import {
  AppCard,
  EmptyState,
  LoadingSkeleton,
  SectionHeader,
  StatusBadge,
} from "../components/ui";
import ActivityCard from "../components/dashboard/ActivityCard";

function Properties() {
  const navigate = useNavigate();
  const [properties, setProperties] = useState([]);
  const [connections, setConnections] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [propertyForm, setPropertyForm] = useState({
    name: "",
    code: "",
    timezone: "Africa/Casablanca",
  });
  const [connectionForm, setConnectionForm] = useState({
    property_id: "",
    provider_name: "mock",
    base_url: "",
  });

  async function load() {
    setLoading(true);
    setError("");
    try {
      const [p, c] = await Promise.all([getProperties(), getSmartProviderConnections()]);
      setProperties(p || []);
      setConnections(c || []);
    } catch (err) {
      setError(err.message || "Errore caricamento property");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function onCreateProperty(e) {
    e.preventDefault();
    try {
      await createProperty({
        name: propertyForm.name,
        code: propertyForm.code || undefined,
        timezone: propertyForm.timezone,
      });
      setPropertyForm({ name: "", code: "", timezone: "Africa/Casablanca" });
      await load();
    } catch (err) {
      setError(err.message || "Errore creazione property");
    }
  }

  async function onCreateConnection(e) {
    e.preventDefault();
    try {
      await createSmartProviderConnection({
        property_id: Number(connectionForm.property_id),
        provider_name: connectionForm.provider_name,
        base_url: connectionForm.base_url || null,
        config: {},
        status: "connected",
        is_active: true,
      });
      setConnectionForm({ property_id: "", provider_name: "mock", base_url: "" });
      await load();
    } catch (err) {
      setError(err.message || "Errore creazione connessione provider");
    }
  }

  return (
    <div>
      <SectionHeader
        title="Property e Connessioni Provider"
        subtitle="Gestione portfolio property multi-tenant e connessioni provider persistenti"
        right={<button type="button" onClick={() => navigate("/setup")}>Apri Setup Wizard</button>}
      />
      {error && <p style={{ color: "var(--color-danger)" }}>{error}</p>}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 12, marginBottom: 12 }}>
        <AppCard>
          <h3 style={{ marginTop: 0, marginBottom: 10 }}>Nuova property</h3>
          <form onSubmit={onCreateProperty} style={{ display: "grid", gap: 8 }}>
            <input
              placeholder="Nome property"
              value={propertyForm.name}
              onChange={(e) => setPropertyForm((prev) => ({ ...prev, name: e.target.value }))}
              required
            />
            <input
              placeholder="Codice / slug (opzionale)"
              value={propertyForm.code}
              onChange={(e) => setPropertyForm((prev) => ({ ...prev, code: e.target.value }))}
            />
            <input
              placeholder="Timezone"
              value={propertyForm.timezone}
              onChange={(e) => setPropertyForm((prev) => ({ ...prev, timezone: e.target.value }))}
              required
            />
            <button type="submit">Crea property</button>
          </form>
        </AppCard>

        <AppCard>
          <h3 style={{ marginTop: 0, marginBottom: 10 }}>Nuova connessione provider</h3>
          <form onSubmit={onCreateConnection} style={{ display: "grid", gap: 8 }}>
            <select
              value={connectionForm.property_id}
              onChange={(e) => setConnectionForm((prev) => ({ ...prev, property_id: e.target.value }))}
              required
            >
              <option value="">Seleziona property</option>
              {properties.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <select
              value={connectionForm.provider_name}
              onChange={(e) => setConnectionForm((prev) => ({ ...prev, provider_name: e.target.value }))}
            >
              <option value="mock">mock</option>
              <option value="home_assistant">home_assistant</option>
            </select>
            <input
              placeholder="Base URL (solo Home Assistant)"
              value={connectionForm.base_url}
              onChange={(e) => setConnectionForm((prev) => ({ ...prev, base_url: e.target.value }))}
            />
            <button type="submit">Salva connessione</button>
          </form>
        </AppCard>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 12 }}>
        <AppCard>
          <h3 style={{ marginTop: 0, marginBottom: 10 }}>Elenco property</h3>
          {loading ? (
            <LoadingSkeleton rows={5} height={22} />
          ) : properties.length === 0 ? (
            <EmptyState title="Nessuna property" description="Crea la prima property per iniziare onboarding e setup smart" />
          ) : (
            <div style={{ display: "grid", gap: 8 }}>
              {properties.map((p) => (
                <div key={p.id} style={{ border: "1px solid var(--color-border)", borderRadius: 8, padding: 8 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                    <strong>{p.name}</strong>
                    <StatusBadge status={p.status || "active"} />
                  </div>
                  <div style={{ fontSize: 12, color: "var(--color-text-muted)", marginTop: 4 }}>
                    #{p.id} · {p.code || "n/d"} · {p.timezone}
                  </div>
                </div>
              ))}
            </div>
          )}
        </AppCard>

        <AppCard>
          <h3 style={{ marginTop: 0, marginBottom: 10 }}>Connessioni provider</h3>
          {loading ? (
            <LoadingSkeleton rows={5} height={22} />
          ) : connections.length === 0 ? (
            <EmptyState title="Nessuna connessione" description="Aggiungi una connessione mock o Home Assistant per importare dispositivi" />
          ) : (
            <div style={{ display: "grid", gap: 8 }}>
              {connections.map((c) => (
                <ActivityCard
                  key={c.id}
                  title={`${c.provider_name} · property #${c.property_id}`}
                  subtitle={`base_url: ${c.base_url || "n/d"} · ultimo sync: ${c.last_sync_at || "n/d"}`}
                  severity={c.status === "error" ? "critical" : c.status === "disconnected" ? "warning" : "info"}
                  timestamp={c.updated_at || c.created_at}
                  right={<StatusBadge status={c.status || "unknown"} />}
                />
              ))}
            </div>
          )}
        </AppCard>
      </div>
    </div>
  );
}

export default Properties;

