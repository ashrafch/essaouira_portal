import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { AlertTriangle, CheckCircle2, PlugZap, ShieldAlert, Zap } from "lucide-react";
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
  ActionToolbar,
  AppCard,
  EmptyState,
  HealthIndicator,
  LoadingSkeleton,
  SectionHeader,
  StatCard,
  StatusBadge,
} from "../components/ui";
import {
  enableSmartScenarioPack,
  getEnabledSmartScenarioPacks,
  getProperties,
  getSmartDashboard,
  getSmartScenarioPacks,
  getUnits,
} from "../services/api";

const MotionDiv = motion.div;

function DashboardList({ title, items, emptyTitle, renderItem }) {
  return (
    <AppCard>
      <h3 style={{ marginBottom: 10 }}>{title}</h3>
      {items.length === 0 ? (
        <EmptyState title={emptyTitle} />
      ) : (
        <div style={{ display: "grid", gap: 8 }}>
          {items.map(renderItem)}
        </div>
      )}
    </AppCard>
  );
}

function SmartDashboard() {
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
      { label: "Exec oggi", value: dashboard.kpis.automation_executions_today },
      { label: "Exec fail", value: dashboard.kpis.automation_failures_today },
      { label: "Exec partial", value: dashboard.kpis.automation_partial_today },
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
      setActionError(err.message || "Errore abilitazione scenario pack");
    } finally {
      setBusyPack("");
    }
  }

  return (
    <MotionDiv initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.2 }}>
      <SectionHeader
        title="Smart Dashboard"
        subtitle="Vista operativa unificata per dispositivi, alert, automazioni e provider."
      />

      <ActionToolbar style={{ marginBottom: 12 }}>
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
      </ActionToolbar>

      {loading ? <LoadingSkeleton rows={8} height={30} /> : null}
      {error ? <p style={{ color: "#b91c1c" }}>{error}</p> : null}
      {actionError ? <p style={{ color: "#b91c1c" }}>{actionError}</p> : null}

      {!loading && !error && dashboard ? (
        <>
          <div className="ui-grid-cards" style={{ marginBottom: 12 }}>
            <StatCard label="Property" value={dashboard.kpis.total_properties} icon={<PlugZap size={16} />} />
            <StatCard label="Unità" value={dashboard.kpis.total_units} />
            <StatCard label="Dispositivi" value={dashboard.kpis.total_devices} />
            <StatCard label="Online" value={dashboard.kpis.online_devices} tone="success" icon={<CheckCircle2 size={16} />} />
            <StatCard label="Offline" value={dashboard.kpis.offline_devices} tone="danger" icon={<AlertTriangle size={16} />} />
            <StatCard label="Warning" value={dashboard.kpis.warning_devices} tone="warning" />
            <StatCard label="Critical" value={dashboard.kpis.critical_devices} tone="danger" icon={<ShieldAlert size={16} />} />
            <StatCard label="Alert aperti" value={dashboard.kpis.open_alerts} tone="warning" />
            <StatCard label="Exec oggi" value={dashboard.kpis.automation_executions_today} tone="info" icon={<Zap size={16} />} />
            <StatCard
              label="Fail / Partial"
              value={`${dashboard.kpis.automation_failures_today}/${dashboard.kpis.automation_partial_today}`}
              hint="failed/partial"
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
              <h3 style={{ marginBottom: 8 }}>Andamento operativo smart</h3>
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

          <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))" }}>
            <DashboardList
              title="Unità con criticità"
              items={dashboard.problematic_units || []}
              emptyTitle="Nessuna unità critica nel filtro attuale"
              renderItem={(item) => (
                <div key={`${item.unit_id || "na"}-${item.unit_name}`} style={{ border: "1px solid #e2e8f0", borderRadius: 10, padding: 10 }}>
                  <strong>{item.unit_name}</strong>
                  <div style={{ marginTop: 6, display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <StatusBadge status={item.offline_devices > 0 ? "offline" : "online"} />
                    <StatusBadge status={item.critical_devices > 0 ? "critical" : item.warning_devices > 0 ? "warning" : "healthy"} />
                  </div>
                </div>
              )}
            />

            <DashboardList
              title="Top device issues"
              items={dashboard.top_device_issues || []}
              emptyTitle="Nessun device con issue"
              renderItem={(item) => (
                <div key={item.device_id} style={{ border: "1px solid #e2e8f0", borderRadius: 10, padding: 10 }}>
                  <strong>{item.name}</strong>
                  <div style={{ fontSize: 12, color: "#64748b", margin: "4px 0 6px 0" }}>
                    {item.unit_name || "Unassigned"}
                  </div>
                  <HealthIndicator connectivity={item.connectivity_status} health={item.health_status} battery={item.battery_level} />
                </div>
              )}
            />

            <DashboardList
              title="Alert recenti"
              items={dashboard.recent_alerts || []}
              emptyTitle="Nessun alert recente"
              renderItem={(item) => (
                <div key={item.id} style={{ border: "1px solid #e2e8f0", borderRadius: 10, padding: 10 }}>
                  <strong>{item.title}</strong>
                  <div style={{ marginTop: 6 }}>
                    <StatusBadge status={item.severity || "warning"} />
                  </div>
                  {item.subtitle ? <div style={{ fontSize: 12, color: "#64748b", marginTop: 6 }}>{item.subtitle}</div> : null}
                </div>
              )}
            />

            <DashboardList
              title="Automation failures"
              items={dashboard.recent_automation_failures || []}
              emptyTitle="Nessun errore recente"
              renderItem={(item) => (
                <div key={item.id} style={{ border: "1px solid #e2e8f0", borderRadius: 10, padding: 10 }}>
                  <strong>{item.title}</strong>
                  <div style={{ marginTop: 6 }}>
                    <StatusBadge status={item.severity || "warning"} />
                  </div>
                  <div style={{ fontSize: 12, color: "#64748b", marginTop: 6 }}>{item.subtitle || "-"}</div>
                </div>
              )}
            />
          </div>

          <AppCard style={{ marginTop: 12 }}>
            <h3 style={{ marginBottom: 10 }}>Scenario Packs</h3>
            {!propertyId ? <EmptyState title="Seleziona una property per abilitare un pack" /> : null}
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
                      {busyPack === pack.key ? "Abilitazione..." : enabled ? "Reapply pack" : "Enable pack"}
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
