import { useCallback, useEffect, useState } from "react";
import { Plus } from "lucide-react";
import {
  createSmartDevice,
  getSmartDeviceHealth,
  simulateSmartDeviceSync,
} from "../services/api";
import Modal from "../components/Modal";
import FeedbackMessage from "../components/FeedbackMessage";
import { AppCard, EmptyState, LoadingSkeleton, SectionHeader, StatCard } from "../components/ui";
import FilterBar from "../components/dashboard/FilterBar";
import DeviceCard from "../components/smart/DeviceCard";

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

  const loadDevices = useCallback(async () => {
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
  }, [filters.connectivity, filters.status]);

  useEffect(() => {
    loadDevices();
  }, [loadDevices]);

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
      <SectionHeader
        title="Smart Devices"
        subtitle="Inventario dispositivi con health monitoring, stato connessione e qualità segnale"
        right={
          <button type="button" onClick={openCreateModal}>
            <Plus size={14} style={{ marginRight: 6 }} />
            Add device
          </button>
        }
      />

      {error && <p style={{ color: "#b91c1c" }}>{error}</p>}
      <FeedbackMessage
        message={feedback.message}
        type={feedback.type}
        onClose={() => setFeedback({ type: "info", message: "" })}
      />

      <FilterBar>
        <label style={{ minWidth: 190 }}>
          <span style={{ fontSize: 12, color: "#64748b" }}>Health status</span>
          <select value={filters.status} onChange={(e) => setFilters((prev) => ({ ...prev, status: e.target.value }))}>
            <option value="">Tutti</option>
            <option value="healthy">healthy</option>
            <option value="warning">warning</option>
            <option value="critical">critical</option>
          </select>
        </label>
        <label style={{ minWidth: 190 }}>
          <span style={{ fontSize: 12, color: "#64748b" }}>Connectivity</span>
          <select value={filters.connectivity} onChange={(e) => setFilters((prev) => ({ ...prev, connectivity: e.target.value }))}>
            <option value="">Tutte</option>
            <option value="online">online</option>
            <option value="offline">offline</option>
            <option value="unknown">unknown</option>
          </select>
        </label>
      </FilterBar>

      {summary ? (
        <div className="ui-grid-cards" style={{ marginBottom: 12 }}>
          <StatCard label="Total" value={summary.total_devices} />
          <StatCard label="Online" value={summary.online_devices} tone="success" />
          <StatCard label="Offline" value={summary.offline_devices} tone="danger" />
          <StatCard label="Warning" value={summary.warning_devices} tone="warning" />
          <StatCard label="Critical" value={summary.critical_devices} tone="danger" />
        </div>
      ) : null}

      {loading ? (
        <LoadingSkeleton rows={6} height={24} />
      ) : devices.length === 0 ? (
        <EmptyState title="Nessun dispositivo" description="Importa dal provider o crea manualmente il primo device" />
      ) : (
        <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(290px, 1fr))" }}>
          {devices.map((d) => (
            <DeviceCard key={d.device_id} device={d} onSimulate={handleSimulate} />
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
          <AppCard style={{ marginTop: 4 }}>
            <div style={{ fontSize: 12, color: "#64748b" }}>
              Suggerimento: usa `external_id` coerente con il provider per semplificare sync e mapping automatico.
            </div>
          </AppCard>
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
