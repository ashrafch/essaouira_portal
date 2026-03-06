import { useEffect, useState } from "react";
import {
  acknowledgeSmartAlert,
  createSmartAlert,
  getSmartAlerts,
  getUnits,
} from "../services/api";
import Modal from "../components/Modal";
import FeedbackMessage from "../components/FeedbackMessage";

const EMPTY_FORM = {
  unit_id: "",
  alert_type: "custom.alert",
  severity: "warning",
  title: "",
  description: "",
};

function SmartAlerts() {
  const [alerts, setAlerts] = useState([]);
  const [units, setUnits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [feedback, setFeedback] = useState({ type: "info", message: "" });
  const [form, setForm] = useState(EMPTY_FORM);

  async function loadAlerts() {
    setLoading(true);
    setError("");
    try {
      const [alertsData, unitsData] = await Promise.all([getSmartAlerts(), getUnits()]);
      setAlerts(alertsData || []);
      setUnits(unitsData || []);
    } catch (err) {
      setError(err.message || "Errore caricamento alert");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAlerts();
  }, []);

  function openCreateModal() {
    setForm(EMPTY_FORM);
    setIsModalOpen(true);
  }

  async function handleCreate(e) {
    e.preventDefault();
    setError("");
    try {
      await createSmartAlert({
        unit_id: form.unit_id ? Number(form.unit_id) : null,
        alert_type: form.alert_type,
        severity: form.severity,
        title: form.title,
        description: form.description || null,
      });
      await loadAlerts();
      setFeedback({ type: "success", message: "Alert creato con successo." });
      setIsModalOpen(false);
      setForm(EMPTY_FORM);
    } catch (err) {
      setFeedback({ type: "error", message: err.message || "Errore creazione alert" });
    }
  }

  async function handleAck(id) {
    setError("");
    try {
      await acknowledgeSmartAlert(id);
      await loadAlerts();
      setFeedback({ type: "success", message: "Alert preso in carico." });
    } catch (err) {
      setFeedback({ type: "error", message: err.message || "Errore acknowledge" });
    }
  }

  return (
    <div>
      <h1 style={{ marginTop: 0 }}>Smart Alerts</h1>
      {error && <p style={{ color: "#b91c1c" }}>{error}</p>}
      <FeedbackMessage
        message={feedback.message}
        type={feedback.type}
        onClose={() => setFeedback({ type: "info", message: "" })}
      />

      <div style={{ marginBottom: 14 }}>
        <button type="button" onClick={openCreateModal}>+ Crea alert</button>
      </div>

      {loading ? (
        <p>Caricamento...</p>
      ) : alerts.length === 0 ? (
        <p style={{ color: "#6b7280" }}>Nessun alert.</p>
      ) : (
        <div style={{ display: "grid", gap: 10 }}>
          {alerts.map((a) => (
            <div key={a.id} style={{ border: "1px solid #e5e7eb", borderRadius: 12, background: "#fff", padding: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                <div>
                  <div style={{ fontWeight: 700 }}>{a.title}</div>
                  <div style={{ fontSize: 13, color: "#6b7280" }}>
                    {a.alert_type} · {a.severity} · stato: {a.status}
                  </div>
                </div>
                {a.status === "open" && (
                  <button type="button" onClick={() => handleAck(a.id)}>Acknowledge</button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal
        open={isModalOpen}
        title="Crea alert"
        onClose={() => setIsModalOpen(false)}
        width={720}
      >
        <form onSubmit={handleCreate} style={{ display: "grid", gap: 8 }}>
          <div style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))" }}>
            <select value={form.unit_id} onChange={(e) => setForm({ ...form, unit_id: e.target.value })}>
              <option value="">Nessuna unita</option>
              {units.map((u) => (
                <option key={u.id} value={u.id}>{u.name}</option>
              ))}
            </select>
            <input value={form.alert_type} onChange={(e) => setForm({ ...form, alert_type: e.target.value })} />
            <select value={form.severity} onChange={(e) => setForm({ ...form, severity: e.target.value })}>
              <option value="info">info</option>
              <option value="warning">warning</option>
              <option value="critical">critical</option>
            </select>
            <input required placeholder="titolo" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          </div>
          <textarea rows={2} placeholder="descrizione" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} style={{ marginTop: 8, width: "100%" }} />
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 6 }}>
            <button type="button" onClick={() => setIsModalOpen(false)}>Annulla</button>
            <button type="submit">Crea alert</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

export default SmartAlerts;
