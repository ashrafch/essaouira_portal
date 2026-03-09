import { useEffect, useState } from "react";
import {
  createProperty,
  createSmartProviderConnection,
  getProperties,
  getSmartProviderConnections,
} from "../services/api";

function Properties() {
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
      setError(err.message || "Errore caricamento properties");
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
      setError(err.message || "Errore creazione provider connection");
    }
  }

  return (
    <div>
      <h1 style={{ marginTop: 0 }}>Properties</h1>
      <p style={{ color: "#6b7280" }}>
        Gestione property multi-tenant e registry connessioni provider smart.
      </p>
      {error && <p style={{ color: "#b91c1c" }}>{error}</p>}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
        <section style={{ border: "1px solid #e5e7eb", borderRadius: 12, background: "#fff", padding: 12 }}>
          <h3 style={{ marginTop: 0 }}>Nuova property</h3>
          <form onSubmit={onCreateProperty} style={{ display: "grid", gap: 8 }}>
            <input
              placeholder="Nome property"
              value={propertyForm.name}
              onChange={(e) => setPropertyForm((prev) => ({ ...prev, name: e.target.value }))}
              required
            />
            <input
              placeholder="Code / slug (opzionale)"
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
        </section>

        <section style={{ border: "1px solid #e5e7eb", borderRadius: 12, background: "#fff", padding: 12 }}>
          <h3 style={{ marginTop: 0 }}>Nuova provider connection</h3>
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
              placeholder="Base URL (per HA)"
              value={connectionForm.base_url}
              onChange={(e) => setConnectionForm((prev) => ({ ...prev, base_url: e.target.value }))}
            />
            <button type="submit">Salva connection</button>
          </form>
        </section>
      </div>

      <section style={{ border: "1px solid #e5e7eb", borderRadius: 12, background: "#fff", padding: 12, marginBottom: 12 }}>
        <h3 style={{ marginTop: 0 }}>Lista properties</h3>
        {loading ? (
          <p>Caricamento...</p>
        ) : properties.length === 0 ? (
          <p style={{ color: "#6b7280" }}>Nessuna property.</p>
        ) : (
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {properties.map((p) => (
              <li key={p.id}>
                {p.name} ({p.code}) · {p.timezone} · {p.status}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section style={{ border: "1px solid #e5e7eb", borderRadius: 12, background: "#fff", padding: 12 }}>
        <h3 style={{ marginTop: 0 }}>Provider connections</h3>
        {loading ? (
          <p>Caricamento...</p>
        ) : connections.length === 0 ? (
          <p style={{ color: "#6b7280" }}>Nessuna connection.</p>
        ) : (
          <div style={{ display: "grid", gap: 8 }}>
            {connections.map((c) => (
              <div key={c.id} style={{ border: "1px solid #eef2f7", borderRadius: 8, padding: 8 }}>
                <strong>{c.provider_name}</strong> · property #{c.property_id} · {c.status}
                <div style={{ fontSize: 12, color: "#6b7280" }}>
                  base_url: {c.base_url || "n/a"} · last_sync: {c.last_sync_at || "n/a"}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

export default Properties;
