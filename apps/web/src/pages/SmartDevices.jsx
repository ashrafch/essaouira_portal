import { useCallback, useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { useNavigate } from "react-router-dom";
import {
  createSmartDevice,
  deleteSmartDevice,
  getUnits,
  getSmartDeviceHealth,
  pollSmartProvider,
  simulateSmartDeviceSync,
  syncSmartProvider,
  updateSmartDevice,
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
  const navigate = useNavigate();
  const [devices, setDevices] = useState([]);
  const [units, setUnits] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState({ type: "info", message: "" });
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [filters, setFilters] = useState({ status: "", connectivity: "" });
  const [syncingAll, setSyncingAll] = useState(false);
  const [assigningDeviceId, setAssigningDeviceId] = useState(null);
  const [deletingDeviceId, setDeletingDeviceId] = useState(null);

  const loadDevices = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await getSmartDeviceHealth({
        status: filters.status || undefined,
        connectivity: filters.connectivity || undefined,
      });
      const unitsData = await getUnits();
      setDevices(data?.devices || []);
      setSummary(data?.property_summary || null);
      setUnits(unitsData || []);
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

  async function handleSyncAllDevices() {
    setError("");
    setFeedback({ type: "info", message: "" });
    setSyncingAll(true);
    try {
      const providers = [...new Set((devices || []).map((d) => d.provider).filter(Boolean))];
      const targets = providers.length > 0 ? providers : ["home_assistant"];
      for (const provider of targets) {
        await syncSmartProvider(provider);
        await pollSmartProvider(provider);
      }
      await loadDevices();
      setFeedback({
        type: "success",
        message: `Sincronizzazione completata per ${targets.length} provider.`,
      });
    } catch (err) {
      setFeedback({ type: "error", message: err.message || "Errore sync dispositivi" });
    } finally {
      setSyncingAll(false);
    }
  }

  async function handleAssignUnit(deviceId, unitId) {
    setAssigningDeviceId(deviceId);
    setError("");
    try {
      await updateSmartDevice(deviceId, { unit_id: unitId });
      await loadDevices();
      setFeedback({ type: "success", message: "Assegnazione unità aggiornata." });
    } catch (err) {
      setFeedback({ type: "error", message: err.message || "Errore assegnazione unità" });
    } finally {
      setAssigningDeviceId(null);
    }
  }

  async function handleDeleteDevice(deviceId) {
    if (!window.confirm("Eliminare il dispositivo? Se usato in scene/regole l'operazione verrà bloccata.")) {
      return;
    }
    setDeletingDeviceId(deviceId);
    setError("");
    try {
      await deleteSmartDevice(deviceId);
      await loadDevices();
      setFeedback({ type: "success", message: "Dispositivo eliminato." });
    } catch (err) {
      setFeedback({ type: "error", message: err.message || "Errore eliminazione dispositivo" });
    } finally {
      setDeletingDeviceId(null);
    }
  }

  return (
    <div>
      <SectionHeader
        title="Dispositivi Smart"
        subtitle="Inventario dispositivi con stato salute, connettività e qualità segnale"
        right={
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button type="button" onClick={handleSyncAllDevices} disabled={syncingAll}>
              {syncingAll ? "Sincronizzo..." : "Sync tutti i dispositivi"}
            </button>
            <button type="button" onClick={openCreateModal}>
              <Plus size={14} style={{ marginRight: 6 }} />
              Nuovo dispositivo
            </button>
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
        <label style={{ minWidth: 190 }}>
          <span style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Stato salute</span>
          <select value={filters.status} onChange={(e) => setFilters((prev) => ({ ...prev, status: e.target.value }))}>
            <option value="">Tutti</option>
            <option value="healthy">healthy</option>
            <option value="warning">warning</option>
            <option value="critical">critical</option>
          </select>
        </label>
        <label style={{ minWidth: 190 }}>
          <span style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Connettività</span>
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
          <StatCard label="Dispositivi" value={summary.total_devices} />
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
            <DeviceCard
              key={d.device_id}
              device={d}
              units={units}
              onSimulate={handleSimulate}
              onOpenDetail={(id) => navigate(`/smart-devices/${id}`)}
              onAssignUnit={handleAssignUnit}
              onDelete={handleDeleteDevice}
              assigning={assigningDeviceId === d.device_id}
              deleting={deletingDeviceId === d.device_id}
            />
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
            <input placeholder="ID esterno provider" value={form.external_id} onChange={(e) => setForm({ ...form, external_id: e.target.value })} required />
            <input placeholder="Nome dispositivo" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            <input placeholder="Categoria dispositivo" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} required />
            <select value={form.provider} onChange={(e) => setForm({ ...form, provider: e.target.value })}>
              <option value="mock">mock</option>
              <option value="home_assistant">home_assistant</option>
            </select>
          </div>
          <AppCard style={{ marginTop: 4 }}>
            <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
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
