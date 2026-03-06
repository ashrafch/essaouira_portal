import { useEffect, useState } from "react";
import { createSmartDevice, getSmartDevices, simulateSmartDeviceSync } from "../services/api";

function SmartDevices() {
  const [devices, setDevices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    provider: "mock",
    external_id: "",
    name: "",
    category: "motion_sensor",
    health_status: "unknown",
    is_active: true,
  });

  async function loadDevices() {
    setLoading(true);
    setError("");
    try {
      const data = await getSmartDevices();
      setDevices(data || []);
    } catch (err) {
      setError(err.message || "Errore caricamento dispositivi");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadDevices();
  }, []);

  async function handleCreate(e) {
    e.preventDefault();
    setError("");
    try {
      await createSmartDevice(form);
      setForm((prev) => ({ ...prev, external_id: "", name: "" }));
      await loadDevices();
    } catch (err) {
      setError(err.message || "Errore creazione device");
    }
  }

  async function handleSimulate(deviceId) {
    setError("");
    try {
      await simulateSmartDeviceSync(deviceId);
      await loadDevices();
    } catch (err) {
      setError(err.message || "Errore simulate sync");
    }
  }

  return (
    <div>
      <h1 style={{ marginTop: 0 }}>Smart Devices</h1>
      <p style={{ color: "#6b7280" }}>Inventario dispositivi con test rapido provider mock.</p>
      {error && <p style={{ color: "#b91c1c" }}>{error}</p>}

      <form onSubmit={handleCreate} style={{ border: "1px solid #e5e7eb", borderRadius: 12, background: "#fff", padding: 14, marginBottom: 16 }}>
        <h3 style={{ marginTop: 0 }}>Aggiungi dispositivo</h3>
        <div style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))" }}>
          <input placeholder="external_id" value={form.external_id} onChange={(e) => setForm({ ...form, external_id: e.target.value })} required />
          <input placeholder="name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          <input placeholder="category" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} required />
          <select value={form.provider} onChange={(e) => setForm({ ...form, provider: e.target.value })}>
            <option value="mock">mock</option>
            <option value="home_assistant">home_assistant</option>
          </select>
        </div>
        <button type="submit" style={{ marginTop: 10 }}>Salva</button>
      </form>

      {loading ? (
        <p>Caricamento...</p>
      ) : devices.length === 0 ? (
        <p style={{ color: "#6b7280" }}>Nessun dispositivo.</p>
      ) : (
        <div style={{ display: "grid", gap: 10 }}>
          {devices.map((d) => (
            <div key={d.id} style={{ border: "1px solid #e5e7eb", borderRadius: 12, background: "#fff", padding: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                <div>
                  <div style={{ fontWeight: 700 }}>{d.name}</div>
                  <div style={{ fontSize: 13, color: "#6b7280" }}>
                    {d.provider} · {d.category} · ext:{d.external_id}
                  </div>
                </div>
                <button type="button" onClick={() => handleSimulate(d.id)}>Simula sync</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default SmartDevices;
