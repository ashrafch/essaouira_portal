import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  acknowledgeSmartAlert,
  createSmartAlert,
  getSmartAlerts,
  getUnits,
} from "../services/api";
import Modal from "../components/Modal";
import FeedbackMessage from "../components/FeedbackMessage";
import {
  EmptyState,
  LoadingSkeleton,
  SectionHeader,
  SeverityBadge,
  StatusBadge,
} from "../components/ui";
import FilterBar from "../components/dashboard/FilterBar";
import ActivityCard from "../components/dashboard/ActivityCard";

const EMPTY_FORM = {
  unit_id: "",
  alert_type: "custom.alert",
  severity: "warning",
  title: "",
  description: "",
};

function SmartAlerts() {
  const navigate = useNavigate();
  const [alerts, setAlerts] = useState([]);
  const [units, setUnits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [feedback, setFeedback] = useState({ type: "info", message: "" });
  const [form, setForm] = useState(EMPTY_FORM);
  const [statusFilter, setStatusFilter] = useState("");

  const loadAlerts = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [alertsData, unitsData] = await Promise.all([
        getSmartAlerts(statusFilter ? { status: statusFilter } : {}),
        getUnits(),
      ]);
      setAlerts(alertsData || []);
      setUnits(unitsData || []);
    } catch (err) {
      setError(err.message || "Errore caricamento alert");
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    loadAlerts();
  }, [loadAlerts]);

  const grouped = useMemo(() => {
    const open = alerts.filter((a) => a.status === "open");
    const resolved = alerts.filter((a) => a.status !== "open");
    return { open, resolved };
  }, [alerts]);

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
      setFeedback({ type: "error", message: err.message || "Errore presa in carico" });
    }
  }

  return (
    <div>
      <SectionHeader
        title="Alert Smart"
        subtitle="Alert operativi da dispositivi, regole e automazioni smart"
        right={
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button type="button" onClick={openCreateModal}>Nuovo alert</button>
            <button type="button" onClick={() => navigate("/smart-dashboard")}>Apri dashboard</button>
          </div>
        }
      />
      {error && <p style={{ color: "var(--color-danger)" }}>{error}</p>}
      <FeedbackMessage
        message={feedback.message}
        type={feedback.type}
        onClose={() => setFeedback({ type: "info", message: "" })}
      />

      <FilterBar>
        <label style={{ minWidth: 180 }}>
          <span style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Stato</span>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="">Tutti</option>
            <option value="open">Aperti</option>
            <option value="acknowledged">In carico</option>
            <option value="resolved">Risolti</option>
          </select>
        </label>
      </FilterBar>

      {loading ? (
        <LoadingSkeleton rows={6} height={24} />
      ) : alerts.length === 0 ? (
        <EmptyState title="Nessun alert" description="Quando arriva un'anomalia smart la trovi qui" />
      ) : (
        <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))" }}>
          <div>
            <h3 style={{ marginBottom: 8 }}>Aperti ({grouped.open.length})</h3>
            <div style={{ display: "grid", gap: 8 }}>
              {grouped.open.length === 0 ? <EmptyState title="Nessun alert aperto" /> : grouped.open.map((a) => (
                <ActivityCard
                  key={a.id}
                  title={a.title}
                  subtitle={`${a.alert_type} · unità ${a.unit_id || "n/d"}`}
                  severity={a.severity}
                  timestamp={a.last_seen_at || a.first_seen_at}
                  right={<button type="button" onClick={() => handleAck(a.id)}>Prendi in carico</button>}
                />
              ))}
            </div>
          </div>
          <div>
            <h3 style={{ marginBottom: 8 }}>Storico ({grouped.resolved.length})</h3>
            <div style={{ display: "grid", gap: 8 }}>
              {grouped.resolved.length === 0 ? <EmptyState title="Nessun alert nello storico" /> : grouped.resolved.map((a) => (
                <ActivityCard
                  key={a.id}
                  title={a.title}
                  subtitle={`${a.alert_type} · stato ${a.status}`}
                  severity={a.severity}
                  timestamp={a.resolved_at || a.last_seen_at || a.first_seen_at}
                  right={<StatusBadge status={a.status} />}
                />
              ))}
            </div>
          </div>
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
              <option value="">Nessuna unità</option>
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
            <input required placeholder="Titolo" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          </div>
          <SeverityBadge severity={form.severity} />
          <textarea rows={2} placeholder="Descrizione" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} style={{ marginTop: 8, width: "100%" }} />
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

