import { useEffect, useState } from "react";
import {
  createSmartDevice,
  getSmartDeviceHealth,
  simulateSmartDeviceSync,
} from "../services/api";
import Modal from "../components/Modal";
import FeedbackMessage from "../components/FeedbackMessage";

const EMPTY_FORM = {
  provider: "mock",
  external_id: "",
  name: "",
  category: "motion_sensor",
  health_status: "unknown",
  is_active: true,
};

function SmartDevices() {
  const [devices, setDevices] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState({ type: "info", message: "" });
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [filters, setFilters] = useState({ status: "", connectivity: "" });

  async function loadDevices() {
    setLoading(true);
    setError("");
    try {
      const data = await getSmartDeviceHealth({
        status: filters.status || undefined,
        connectivity: filters.connectivity || undefined,
      });
      setDevices(data?.devices || []);
      setSummary(data?.property_summary || null);
    } catch (err) {
      setError(err.message || "Errore caricamento dispositivi");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadDevices();
  }, [filters.status, filters.connectivity]);

  function openCreateModal() {
    setForm(EMPTY_FORM);
    setIsModalOpen(true);
  }

  async function handleCreate(e) {
    e.preventDefault();
    setError("");
    try {
      await createSmartDevice(form);
      await loadDevices();
      setFeedback({ type: "success", message: "Dispositivo creato con successo." });
      setIsModalOpen(false);
      setForm(EMPTY_FORM);
    } catch (err) {
      setFeedback({ type: "error", message: err.message || "Errore creazione dispositivo" });
    }
  }

  async function handleSimulate(deviceId) {
    setError("");
    try {
      await simulateSmartDeviceSync(deviceId);
      await loadDevices();
      setFeedback({ type: "success", message: "Sync simulata completata." });
    } catch (err) {
      setFeedback({ type: "error", message: err.message || "Errore simulate sync" });
    }
  }

  return (
    <div>
      <h1 style={{ marginTop: 0 }}>Smart Devices</h1>
      <p style={{ color: "#6b7280" }}>
        Inventario dispositivi con health monitoring e visibilita operativa.
      </p>
      {error && <p style={{ color: "#b91c1c" }}>{error}</p>}
      <FeedbackMessage
        message={feedback.message}
        type={feedback.type}
        onClose={() => setFeedback({ type: "info", message: "" })}
      />

      <div style={{ marginBottom: 14 }}>
        <button type="button" onClick={openCreateModal}>+ Aggiungi dispositivo</button>
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
        <select value={filters.status} onChange={(e) => setFilters((prev) => ({ ...prev, status: e.target.value }))}>
          <option value="">Tutti health</option>
          <option value="healthy">healthy</option>
          <option value="warning">warning</option>
          <option value="critical">critical</option>
        </select>
        <select value={filters.connectivity} onChange={(e) => setFilters((prev) => ({ ...prev, connectivity: e.target.value }))}>
          <option value="">Tutte connectivity</option>
          <option value="online">online</option>
          <option value="offline">offline</option>
          <option value="unknown">unknown</option>
        </select>
      </div>

      {summary && (
        <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", marginBottom: 14 }}>
          <div style={{ border: "1px solid #e5e7eb", borderRadius: 10, padding: 10, background: "#fff" }}>Totali <strong>{summary.total_devices}</strong></div>
          <div style={{ border: "1px solid #e5e7eb", borderRadius: 10, padding: 10, background: "#fff" }}>Online <strong>{summary.online_devices}</strong></div>
          <div style={{ border: "1px solid #e5e7eb", borderRadius: 10, padding: 10, background: "#fff" }}>Offline <strong>{summary.offline_devices}</strong></div>
          <div style={{ border: "1px solid #e5e7eb", borderRadius: 10, padding: 10, background: "#fff" }}>Warning <strong>{summary.warning_devices}</strong></div>
          <div style={{ border: "1px solid #e5e7eb", borderRadius: 10, padding: 10, background: "#fff" }}>Critical <strong>{summary.critical_devices}</strong></div>
        </div>
      )}

      {loading ? (
        <p>Caricamento...</p>
      ) : devices.length === 0 ? (
        <p style={{ color: "#6b7280" }}>Nessun dispositivo.</p>
      ) : (
        <div style={{ display: "grid", gap: 10 }}>
          {devices.map((d) => (
            <div key={d.device_id} style={{ border: "1px solid #e5e7eb", borderRadius: 12, background: "#fff", padding: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                <div>
                  <div style={{ fontWeight: 700 }}>{d.name}</div>
                  <div style={{ fontSize: 13, color: "#6b7280" }}>
                    {d.provider} · {d.category}
                  </div>
                  <div style={{ marginTop: 6, display: "flex", gap: 8, flexWrap: "wrap", fontSize: 12 }}>
                    <span style={{ border: "1px solid #d1d5db", borderRadius: 999, padding: "2px 8px", background: "#f9fafb" }}>
                      Connectivity: <strong>{d.connectivity_status}</strong>
                    </span>
                    <span style={{ border: "1px solid #d1d5db", borderRadius: 999, padding: "2px 8px", background: "#f9fafb" }}>
                      Health: <strong>{d.health_status}</strong>
                    </span>
                    <span style={{ border: "1px solid #d1d5db", borderRadius: 999, padding: "2px 8px", background: "#f9fafb" }}>
                      Battery: <strong>{d.battery_level ?? "-"}</strong>
                    </span>
                    <span style={{ border: "1px solid #d1d5db", borderRadius: 999, padding: "2px 8px", background: "#f9fafb" }}>
                      RSSI: <strong>{d.signal_strength ?? "-"}</strong>
                    </span>
                  </div>
                  <div style={{ marginTop: 6, fontSize: 12, color: "#6b7280" }}>
                    Last seen: {d.last_seen_at ? new Date(d.last_seen_at).toLocaleString() : "n/a"}
                  </div>
                </div>
                <button type="button" onClick={() => handleSimulate(d.device_id)}>Simula sync</button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal
        open={isModalOpen}
        title="Aggiungi dispositivo"
        onClose={() => setIsModalOpen(false)}
        width={720}
      >
        <form onSubmit={handleCreate} style={{ display: "grid", gap: 8 }}>
          <div style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))" }}>
            <input placeholder="external_id" value={form.external_id} onChange={(e) => setForm({ ...form, external_id: e.target.value })} required />
            <input placeholder="name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            <input placeholder="category" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} required />
            <select value={form.provider} onChange={(e) => setForm({ ...form, provider: e.target.value })}>
              <option value="mock">mock</option>
              <option value="home_assistant">home_assistant</option>
            </select>
          </div>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 6 }}>
            <button type="button" onClick={() => setIsModalOpen(false)}>Annulla</button>
            <button type="submit">Salva</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

export default SmartDevices;
