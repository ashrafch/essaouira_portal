import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  CheckCircle2,
  Cpu,
  PlugZap,
  ShieldAlert,
  Zap,
} from "lucide-react";
import {
  Bar,
  BarChart,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  AppCard,
  EmptyState,
  LoadingSkeleton,
  SectionHeader,
  StatCard,
  StatusBadge,
} from "../components/ui";
import ActivityCard from "../components/dashboard/ActivityCard";
import FilterBar from "../components/dashboard/FilterBar";
import HeatmapTile from "../components/dashboard/HeatmapTile";
import TelemetryInsightCard from "../components/smart/TelemetryInsightCard";
import EnvironmentSummaryCard from "../components/smart/EnvironmentSummaryCard";
import EnergySummaryCard from "../components/smart/EnergySummaryCard";
import {
  enableSmartScenarioPack,
  getEnabledSmartScenarioPacks,
  getProperties,
  getSmartDashboard,
  getSmartScenarioPacks,
  getUnits,
} from "../services/api";

const MotionDiv = motion.div;

function SmartDashboard() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");
  const [busyPack, setBusyPack] = useState("");

  const [properties, setProperties] = useState([]);
  const [units, setUnits] = useState([]);
  const [packDefs, setPackDefs] = useState([]);
  const [enabledPacks, setEnabledPacks] = useState([]);
  const [dashboard, setDashboard] = useState(null);

  const [propertyId, setPropertyId] = useState("");
  const [unitId, setUnitId] = useState("");

  const filteredUnits = useMemo(() => {
    if (!propertyId) return units;
    return units.filter((u) => u.property_id === Number(propertyId));
  }, [units, propertyId]);

  const chartHealth = useMemo(() => {
    if (!dashboard) return [];
    return [
      { name: "Online", value: dashboard.kpis.online_devices, color: "#10b981" },
      { name: "Offline", value: dashboard.kpis.offline_devices, color: "#ef4444" },
      { name: "Warning", value: dashboard.kpis.warning_devices, color: "#f59e0b" },
      { name: "Critical", value: dashboard.kpis.critical_devices, color: "#dc2626" },
    ];
  }, [dashboard]);

  const chartOps = useMemo(() => {
    if (!dashboard) return [];
    return [
      { label: "Alert aperti", value: dashboard.kpis.open_alerts },
      { label: "Esecuzioni oggi", value: dashboard.kpis.automation_executions_today },
      { label: "Errori", value: dashboard.kpis.automation_failures_today },
      { label: "Parziali", value: dashboard.kpis.automation_partial_today },
    ];
  }, [dashboard]);

  async function loadDashboardAndPacks(selectedPropertyId = propertyId, selectedUnitId = unitId) {
    const params = {};
    if (selectedPropertyId) params.property_id = Number(selectedPropertyId);
    if (selectedUnitId) params.unit_id = Number(selectedUnitId);
    const [dash, enabled] = await Promise.all([
      getSmartDashboard(params),
      getEnabledSmartScenarioPacks(selectedPropertyId ? { property_id: Number(selectedPropertyId) } : {}),
    ]);
    setDashboard(dash);
    setEnabledPacks(enabled || []);
  }

  async function loadAll(selectedPropertyId = propertyId, selectedUnitId = unitId) {
    setLoading(true);
    setError("");
    try {
      const [propsData, unitsData, packsData] = await Promise.all([
        getProperties(),
        getUnits(),
        getSmartScenarioPacks(),
      ]);
      setProperties(propsData || []);
      setUnits(unitsData || []);
      setPackDefs(packsData || []);
      await loadDashboardAndPacks(selectedPropertyId, selectedUnitId);
    } catch (err) {
      setError(err.message || "Errore caricamento Smart Dashboard");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function applyFilters(nextPropertyId, nextUnitId) {
    setActionError("");
    try {
      await loadDashboardAndPacks(nextPropertyId, nextUnitId);
    } catch (err) {
      setActionError(err.message || "Errore applicando filtri");
    }
  }

  async function handleEnablePack(packKey) {
    if (!propertyId) {
      setActionError("Seleziona prima una property.");
      return;
    }
    setBusyPack(packKey);
    setActionError("");
    try {
      await enableSmartScenarioPack({
        property_id: Number(propertyId),
        pack_key: packKey,
      });
      await loadDashboardAndPacks(propertyId, unitId);
    } catch (err) {
      setActionError(err.message || "Errore abilitazione pacchetto scenario");
    } finally {
      setBusyPack("");
    }
  }

  return (
    <MotionDiv initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.2 }}>
      <SectionHeader
        title="Smart Dashboard"
        subtitle="Vista operativa unificata di dispositivi, alert, automazioni e provider"
        right={
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button type="button" onClick={() => navigate("/smart-alerts")}>Nuovo alert</button>
            <button type="button" onClick={() => navigate("/smart-automation")}>Apri automazioni</button>
          </div>
        }
      />

      <FilterBar>
        <label style={{ minWidth: 220 }}>
          <span style={{ fontSize: 12, color: "#64748b" }}>Property</span>
          <select
            value={propertyId}
            onChange={(e) => {
              const nextPropertyId = e.target.value;
              setPropertyId(nextPropertyId);
              setUnitId("");
              applyFilters(nextPropertyId, "");
            }}
          >
            <option value="">Tutte le property</option>
            {properties.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <label style={{ minWidth: 220 }}>
          <span style={{ fontSize: 12, color: "#64748b" }}>Unità</span>
          <select
            value={unitId}
            onChange={(e) => {
              const nextUnitId = e.target.value;
              setUnitId(nextUnitId);
              applyFilters(propertyId, nextUnitId);
            }}
          >
            <option value="">Tutte le unità</option>
            {filteredUnits.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        </label>
      </FilterBar>

      {loading ? <LoadingSkeleton rows={8} height={30} /> : null}
      {error ? <p style={{ color: "#b91c1c" }}>{error}</p> : null}
      {actionError ? <p style={{ color: "#b91c1c" }}>{actionError}</p> : null}

      {!loading && !error && dashboard ? (
        <>
          <div className="ui-grid-cards" style={{ marginBottom: 12 }}>
            <StatCard label="Property" value={dashboard.kpis.total_properties} icon={<PlugZap size={16} />} />
            <StatCard label="Unità" value={dashboard.kpis.total_units} />
            <StatCard label="Dispositivi" value={dashboard.kpis.total_devices} icon={<Cpu size={16} />} />
            <StatCard label="Online" value={dashboard.kpis.online_devices} tone="success" icon={<CheckCircle2 size={16} />} />
            <StatCard label="Offline" value={dashboard.kpis.offline_devices} tone="danger" icon={<AlertTriangle size={16} />} />
            <StatCard label="Warning" value={dashboard.kpis.warning_devices} tone="warning" />
            <StatCard label="Critical" value={dashboard.kpis.critical_devices} tone="danger" icon={<ShieldAlert size={16} />} />
            <StatCard label="Alert aperti" value={dashboard.kpis.open_alerts} tone="warning" />
            <StatCard label="Esecuzioni oggi" value={dashboard.kpis.automation_executions_today} tone="info" icon={<Zap size={16} />} />
            <StatCard
              label="Errori / Parziali"
              value={`${dashboard.kpis.automation_failures_today}/${dashboard.kpis.automation_partial_today}`}
              hint="fail/parziali"
              tone="danger"
            />
          </div>

          <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", marginBottom: 12 }}>
            <AppCard>
              <h3 style={{ marginBottom: 8 }}>Distribuzione salute dispositivi</h3>
              <div style={{ height: 240 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={chartHealth} dataKey="value" nameKey="name" outerRadius={86}>
                      {chartHealth.map((entry) => (
                        <Cell key={entry.name} fill={entry.color} />
                      ))}
                    </Pie>
                    <Legend />
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </AppCard>
            <AppCard>
              <h3 style={{ marginBottom: 8 }}>Andamento alert e automazioni</h3>
              <div style={{ height: 240 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartOps}>
                    <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                    <YAxis allowDecimals={false} />
                    <Tooltip />
                    <Bar dataKey="value" fill="#0f766e" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </AppCard>
          </div>

          <AppCard style={{ marginBottom: 12 }}>
            <h3 style={{ marginBottom: 10 }}>Heatmap stato operativo</h3>
            <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))" }}>
              <HeatmapTile title="Online" value={dashboard.kpis.online_devices} level="healthy" subtitle="Connessi" />
              <HeatmapTile title="Offline" value={dashboard.kpis.offline_devices} level={dashboard.kpis.offline_devices > 0 ? "critical" : "healthy"} subtitle="Da verificare" />
              <HeatmapTile title="Warning" value={dashboard.kpis.warning_devices} level={dashboard.kpis.warning_devices > 0 ? "warning" : "healthy"} subtitle="Batteria / segnale" />
              <HeatmapTile title="Critical" value={dashboard.kpis.critical_devices} level={dashboard.kpis.critical_devices > 0 ? "critical" : "healthy"} subtitle="Intervento rapido" />
              <HeatmapTile title="Alert aperti" value={dashboard.kpis.open_alerts} level={dashboard.kpis.open_alerts > 0 ? "warning" : "healthy"} subtitle="Operativo" />
              <HeatmapTile title="Errori automazione" value={dashboard.kpis.automation_failures_today} level={dashboard.kpis.automation_failures_today > 0 ? "critical" : "healthy"} subtitle="Oggi" />
            </div>
          </AppCard>

          <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", marginBottom: 12 }}>
            <EnvironmentSummaryCard summary={dashboard.environment_summary} title="Environment summary (24h)" />
            <EnergySummaryCard summary={dashboard.energy_summary} title="Energy summary (24h)" />
          </div>

          <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", marginBottom: 12 }}>
            <AppCard>
              <h3 style={{ marginBottom: 8 }}>Unità con criticità</h3>
              {(dashboard.problematic_units || []).length === 0 ? (
                <EmptyState title="Nessuna unità critica" />
              ) : (
                <div style={{ display: "grid", gap: 8 }}>
                  {(dashboard.problematic_units || []).map((item) => (
                    <div key={`${item.unit_id || "na"}-${item.unit_name}`} style={{ border: "1px solid #e2e8f0", borderRadius: 10, padding: 10 }}>
                      <strong>{item.unit_name}</strong>
                      <div style={{ marginTop: 6, display: "flex", gap: 8, flexWrap: "wrap" }}>
                        <StatusBadge status={item.offline_devices > 0 ? "offline" : "online"} />
                        <StatusBadge status={item.critical_devices > 0 ? "critical" : item.warning_devices > 0 ? "warning" : "healthy"} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </AppCard>

            <AppCard>
              <h3 style={{ marginBottom: 8 }}>Alert recenti</h3>
              {(dashboard.recent_alerts || []).length === 0 ? (
                <EmptyState title="Nessun alert recente" />
              ) : (
                <div style={{ display: "grid", gap: 8 }}>
                  {(dashboard.recent_alerts || []).map((item) => (
                    <ActivityCard key={item.id} title={item.title} subtitle={item.subtitle || ""} severity={item.severity} timestamp={item.occurred_at} />
                  ))}
                </div>
              )}
            </AppCard>

            <AppCard>
              <h3 style={{ marginBottom: 8 }}>Errori automazione recenti</h3>
              {(dashboard.recent_automation_failures || []).length === 0 ? (
                <EmptyState title="Nessun errore recente" />
              ) : (
                <div style={{ display: "grid", gap: 8 }}>
                  {(dashboard.recent_automation_failures || []).map((item) => (
                    <ActivityCard key={item.id} title={item.title} subtitle={item.subtitle || ""} severity={item.severity} timestamp={item.occurred_at} />
                  ))}
                </div>
              )}
            </AppCard>

            <AppCard>
              <h3 style={{ marginBottom: 8 }}>Telemetry anomalies</h3>
              {(dashboard.telemetry_anomalies || []).length === 0 ? (
                <EmptyState title="Nessuna anomalia telemetry aperta" />
              ) : (
                <div style={{ display: "grid", gap: 8 }}>
                  {(dashboard.telemetry_anomalies || []).slice(0, 6).map((insight) => (
                    <TelemetryInsightCard
                      key={insight.id}
                      insight={insight}
                      onOpen={(row) => {
                        if (row.unit_id) {
                          navigate(`/smart-units/${row.unit_id}`);
                          return;
                        }
                        if (row.device_id) {
                          navigate(`/smart-devices/${row.device_id}`);
                        }
                      }}
                    />
                  ))}
                </div>
              )}
            </AppCard>

            <AppCard>
              <h3 style={{ marginBottom: 8 }}>Esecuzioni recenti</h3>
              {(dashboard.recent_executions || []).length === 0 ? (
                <EmptyState title="Nessuna esecuzione recente" />
              ) : (
                <div style={{ display: "grid", gap: 8 }}>
                  {(dashboard.recent_executions || []).map((item) => (
                    <ActivityCard key={item.id} title={item.title} subtitle={item.subtitle || ""} severity={item.severity} timestamp={item.occurred_at} />
                  ))}
                </div>
              )}
            </AppCard>
          </div>

          <AppCard style={{ marginBottom: 12 }}>
            <h3 style={{ marginBottom: 8 }}>Recent abnormal readings</h3>
            {(dashboard.recent_abnormal_readings || []).length === 0 ? (
              <EmptyState title="Nessuna lettura anomala recente" />
            ) : (
              <div style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))" }}>
                {(dashboard.recent_abnormal_readings || []).slice(0, 8).map((insight) => (
                  <TelemetryInsightCard
                    key={`reading-${insight.id}`}
                    insight={insight}
                    onOpen={(row) => {
                      if (row.device_id) navigate(`/smart-devices/${row.device_id}`);
                    }}
                  />
                ))}
              </div>
            )}
          </AppCard>

          <AppCard style={{ marginBottom: 12 }}>
            <h3 style={{ marginBottom: 10 }}>Stato connessioni provider</h3>
            {(dashboard.provider_statuses || []).length === 0 ? (
              <EmptyState title="Nessuna connessione provider" description="Configura un provider da Properties o Setup Wizard" />
            ) : (
              <div style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))" }}>
                {dashboard.provider_statuses.map((item) => (
                  <div key={item.connection_id} style={{ border: "1px solid #e2e8f0", borderRadius: 10, padding: 10 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                      <strong>{item.provider_name}</strong>
                      <StatusBadge status={item.status || "offline"} />
                    </div>
                    <div style={{ marginTop: 6, fontSize: 12, color: "#64748b" }}>
                      property #{item.property_id} · attiva {item.is_active ? "sì" : "no"}
                    </div>
                    <div style={{ marginTop: 4, fontSize: 12, color: "#64748b" }}>
                      ultimo sync: {item.last_sync_at ? new Date(item.last_sync_at).toLocaleString() : "n/d"}
                    </div>
                    {item.last_error ? (
                      <div style={{ marginTop: 4, fontSize: 12, color: "#b91c1c" }}>{item.last_error}</div>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </AppCard>

          <AppCard>
            <h3 style={{ marginBottom: 10 }}>Pacchetti scenario</h3>
            {!propertyId ? <EmptyState title="Seleziona una property per abilitare un pacchetto" /> : null}
            <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))" }}>
              {packDefs.map((pack) => {
                const enabled = enabledPacks.find((p) => p.pack_key === pack.key);
                return (
                  <MotionDiv
                    key={pack.key}
                    whileHover={{ y: -2 }}
                    style={{ border: "1px solid #e2e8f0", borderRadius: 12, padding: 10, background: "#f8fafc" }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                      <strong>{pack.name}</strong>
                      <StatusBadge status={enabled ? "healthy" : "offline"} />
                    </div>
                    <p style={{ margin: "6px 0", fontSize: 13, color: "#64748b" }}>{pack.description}</p>
                    <div style={{ fontSize: 12, color: "#64748b" }}>Include: {(pack.includes || []).join(", ")}</div>
                    <button
                      type="button"
                      onClick={() => handleEnablePack(pack.key)}
                      disabled={!propertyId || busyPack === pack.key}
                      style={{ marginTop: 8 }}
                    >
                      {busyPack === pack.key ? "Applicazione..." : enabled ? "Riapplica pacchetto" : "Abilita pacchetto"}
                    </button>
                  </MotionDiv>
                );
              })}
            </div>
          </AppCard>
        </>
      ) : null}
    </MotionDiv>
  );
}

export default SmartDashboard;
