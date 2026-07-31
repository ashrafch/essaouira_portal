import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { AlertTriangle, CalendarRange, Cpu, Rocket } from "lucide-react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  AppCard,
  EmptyState,
  FreshnessBadge,
  LastUpdatedIndicator,
  LiveStatusDot,
  LoadingSkeleton,
  PageHeader,
  StatCard,
} from "../components/ui";
import ActivityCard from "../components/dashboard/ActivityCard";
import DeviceCard from "../components/smart/DeviceCard";
import EnergySummaryCard from "../components/smart/EnergySummaryCard";
import EnvironmentSummaryCard from "../components/smart/EnvironmentSummaryCard";
import TelemetryInsightCard from "../components/smart/TelemetryInsightCard";
import TimelineItem from "../components/smart/TimelineItem";
import UnitReadinessPanel from "../components/smart/UnitReadinessPanel";
import UnitWorkflowPanel from "../components/smart/UnitWorkflowPanel";
import useAutoRefresh from "../hooks/useAutoRefresh";
import {
  getSmartUnitDetail,
  getSmartUnitDeviceHealth,
  getSmartUnitTelemetry,
  getSmartUnitTimeline,
} from "../services/api";

/**
 * Sub-navigation shared by the two unit views (PMS timeline / smart detail):
 * makes /units/:id/timeline and /smart-units/:id feel like one unit page
 * with two tabs. Real links (middle-click friendly), tokens only.
 */
function UnitViewTabs({ unitId, active }) {
  const tabs = [
    { key: "timeline", label: "Timeline PMS", to: `/units/${unitId}/timeline`, icon: CalendarRange },
    { key: "smart", label: "Smart & dispositivi", to: `/smart-units/${unitId}`, icon: Cpu },
  ];
  return (
    <nav className="ui-tablist" aria-label="Viste unità" style={{ marginBottom: 16 }}>
      {tabs.map((tab) => {
        const Icon = tab.icon;
        const isActive = tab.key === active;
        return (
          <Link
            key={tab.key}
            to={tab.to}
            className={isActive ? "ui-tab is-active" : "ui-tab"}
            aria-current={isActive ? "page" : undefined}
            style={{ textDecoration: "none" }}
          >
            <Icon size={14} aria-hidden="true" />
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}

const RANGE_OPTIONS = {
  "24h": { hours: 24, interval: "15m" },
  "7d": { days: 7, interval: "1h" },
  "30d": { days: 30, interval: "6h" },
};

function buildDateRange(rangeKey) {
  const now = new Date();
  const cfg = RANGE_OPTIONS[rangeKey] || RANGE_OPTIONS["24h"];
  const from = new Date(now);
  if (cfg.hours) from.setHours(from.getHours() - cfg.hours);
  if (cfg.days) from.setDate(from.getDate() - cfg.days);
  return {
    from: from.toISOString(),
    to: now.toISOString(),
    interval: cfg.interval,
  };
}

function pickSeries(data, metricType) {
  return (data?.series || []).find((s) => s.metric_type === metricType) || null;
}

function mapPoints(series) {
  if (!series) return [];
  return (series.points || []).map((p) => ({
    label: new Date(p.recorded_at).toLocaleString(),
    value: Number(p.value),
  }));
}

function TelemetryLineCard({ title, unit, color, points }) {
  return (
    <AppCard>
      <h3 style={{ marginBottom: 8 }}>{title}</h3>
      {points.length === 0 ? (
        <EmptyState title="Nessun dato nel periodo" />
      ) : (
        <div style={{ height: 220 }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={points}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="label" minTickGap={28} tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip formatter={(value) => [`${value}${unit ? ` ${unit}` : ""}`, "Valore"]} />
              <Line type="monotone" dataKey="value" stroke={color} strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </AppCard>
  );
}

function SmartUnitDetail() {
  const { unitId } = useParams();
  const navigate = useNavigate();
  const [range, setRange] = useState("24h");
  const [loading, setLoading] = useState(true);
  const [telemetryLoading, setTelemetryLoading] = useState(true);
  const [error, setError] = useState("");
  const [detail, setDetail] = useState(null);
  const [timeline, setTimeline] = useState([]);
  const [health, setHealth] = useState(null);
  const [telemetry, setTelemetry] = useState(null);

  async function loadCore(silent = false) {
    if (!silent) {
      setLoading(true);
    }
    setError("");
    try {
      const [d, t, h] = await Promise.all([
        getSmartUnitDetail(unitId, { events_limit: 30 }),
        getSmartUnitTimeline(unitId, { limit: 30 }),
        getSmartUnitDeviceHealth(unitId),
      ]);
      setDetail(d);
      setTimeline(t?.items || []);
      setHealth(h);
    } catch (err) {
      setError(err.message || "Errore caricamento unità smart");
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  }

  async function loadTelemetry(silent = false) {
    if (!silent) {
      setTelemetryLoading(true);
    }
    try {
      const params = buildDateRange(range);
      const data = await getSmartUnitTelemetry(unitId, params);
      setTelemetry(data);
    } catch (err) {
      setError(err.message || "Errore caricamento telemetria unità");
    } finally {
      if (!silent) {
        setTelemetryLoading(false);
      }
    }
  }

  useEffect(() => {
    loadCore();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unitId]);

  useEffect(() => {
    loadTelemetry();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unitId, range]);

  const { isRefreshing, lastRefreshAt, refreshNow } = useAutoRefresh({
    onRefresh: async () => {
      await Promise.all([loadCore(true), loadTelemetry(true)]);
    },
    intervalMs: 15000,
    enabled: !loading && !error,
    immediate: false,
  });

  const summary = detail?.summary;
  const healthSummary = health?.summary;
  const devicesWithHealth = useMemo(() => {
    if (!detail?.devices) return [];
    const healthByDevice = new Map((health?.devices || []).map((d) => [d.device_id, d]));
    return detail.devices.map((d) => {
      const hd = healthByDevice.get(d.id);
      return {
        device_id: d.id,
        id: d.id,
        name: d.name,
        provider: d.provider,
        category: d.category,
        connectivity_status: hd?.connectivity_status || d.connectivity_status,
        health_status: hd?.health_status || d.health_status,
        battery_level: hd?.battery_level ?? d.battery_level,
        signal_strength: hd?.signal_strength ?? d.signal_strength,
        last_seen_at: d.last_seen_at,
        needs_attention: hd?.needs_attention || false,
      };
    });
  }, [detail, health]);

  const temperatureSeries = useMemo(() => mapPoints(pickSeries(telemetry, "temperature")), [telemetry]);
  const humiditySeries = useMemo(() => mapPoints(pickSeries(telemetry, "humidity")), [telemetry]);
  const powerSeries = useMemo(() => mapPoints(pickSeries(telemetry, "power")), [telemetry]);
  const energySeries = useMemo(() => mapPoints(pickSeries(telemetry, "energy")), [telemetry]);

  if (loading) return <LoadingSkeleton rows={8} height={28} />;
  if (error)
    return (
      <div>
        <UnitViewTabs unitId={unitId} active="smart" />
        <p style={{ color: "var(--color-danger)" }}>{error}</p>
      </div>
    );
  if (!detail || !summary)
    return (
      <div>
        <UnitViewTabs unitId={unitId} active="smart" />
        <EmptyState title="Nessun dato unità smart" />
      </div>
    );

  const unitLabel = detail.unit?.name || `Unità #${unitId}`;

  return (
    <div>
      <PageHeader
        title={unitLabel}
        subtitle="Smart & dispositivi: salute dispositivi, telemetria, alert e timeline operativa dell'unità"
        breadcrumb={[
          { label: "Appartamenti", href: "/units" },
          { label: unitLabel },
        ]}
        actions={
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <LiveStatusDot active={!document.hidden} title="Auto refresh 15s" />
              <LastUpdatedIndicator value={lastRefreshAt || detail?.last_updated_at} label="Refresh" />
              <FreshnessBadge status={detail?.data_freshness_status} />
            </span>
            <button type="button" onClick={refreshNow} disabled={isRefreshing}>
              {isRefreshing ? "Aggiorno..." : "Aggiorna ora"}
            </button>
            <button type="button" onClick={() => navigate("/smart-alerts")}>Nuovo alert</button>
            <button type="button" onClick={() => navigate("/smart-automation")}>Automazioni unità</button>
          </div>
        }
      />

      <UnitViewTabs unitId={unitId} active="smart" />

      <div className="ui-grid-cards" style={{ marginBottom: 12 }}>
        <StatCard label="Dispositivi" value={summary.total_devices} />
        <StatCard label="Online" value={healthSummary?.online_devices ?? summary.online_devices} tone="success" />
        <StatCard label="Offline" value={healthSummary?.offline_devices ?? summary.offline_devices} tone="danger" />
        <StatCard label="Warning" value={healthSummary?.warning_devices ?? summary.warning_devices ?? 0} tone="warning" />
        <StatCard label="Critical" value={healthSummary?.critical_devices ?? summary.critical_devices ?? 0} tone="danger" />
        <StatCard label="Alert aperti" value={summary.open_alerts} icon={<AlertTriangle size={15} />} tone="warning" />
      </div>

      <div style={{ marginBottom: 12 }}>
        <UnitWorkflowPanel unitId={Number(unitId)} />
      </div>

      <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", marginBottom: 12 }}>
        <EnvironmentSummaryCard summary={detail.environment_summary} title="Environment unit summary (24h)" />
        <EnergySummaryCard summary={detail.energy_summary} title="Energy unit summary (24h)" />
      </div>

      <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", marginBottom: 12 }}>
        <UnitReadinessPanel readiness={detail.guest_readiness} />

        <AppCard>
          <h3 style={{ marginBottom: 10 }}>Alert aperti</h3>
          {detail.alerts_open?.length ? (
            <div style={{ display: "grid", gap: 8 }}>
              {detail.alerts_open.slice(0, 6).map((a) => (
                <ActivityCard
                  key={a.id}
                  title={a.title}
                  subtitle={`${a.alert_type} · stato ${a.status}`}
                  severity={a.severity}
                  timestamp={a.last_seen_at || a.first_seen_at}
                />
              ))}
            </div>
          ) : (
            <EmptyState title="Nessun alert aperto" description="Questa unità non ha allarmi aperti" />
          )}
        </AppCard>

        <AppCard>
          <h3 style={{ marginBottom: 10 }}>Azioni rapide</h3>
          <div style={{ display: "grid", gap: 10 }}>
            <button type="button" onClick={() => navigate("/smart-automation")}>
              <Rocket size={14} style={{ marginRight: 6 }} />
              Esegui scena o regola
            </button>
            <button type="button" onClick={() => navigate("/smart-devices")}>Gestisci dispositivi associati</button>
            <button type="button" onClick={() => navigate("/smart-dashboard")}>Torna alla dashboard smart</button>
          </div>
        </AppCard>
      </div>

      <AppCard style={{ marginBottom: 12 }}>
        <h3 style={{ marginBottom: 10 }}>Telemetry insights attivi</h3>
        {detail.telemetry_insights_active?.length ? (
          <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))" }}>
            {detail.telemetry_insights_active.slice(0, 8).map((insight) => (
              <TelemetryInsightCard
                key={insight.id}
                insight={insight}
                onOpen={(row) => {
                  if (row.device_id) navigate(`/smart-devices/${row.device_id}`);
                }}
              />
            ))}
          </div>
        ) : (
          <EmptyState title="Nessun insight telemetry attivo" />
        )}
      </AppCard>

      <AppCard style={{ marginBottom: 12 }}>
        <h3 style={{ marginBottom: 10 }}>Dispositivi associati all'unità</h3>
        {devicesWithHealth.length === 0 ? (
          <EmptyState title="Nessun dispositivo associato" description="Assegna dispositivi dal Setup Wizard o dalla pagina Dispositivi" />
        ) : (
          <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))" }}>
            {devicesWithHealth.map((device) => (
              <DeviceCard
                key={device.device_id}
                device={device}
                onOpenDetail={(id) => navigate(`/smart-devices/${id}`)}
              />
            ))}
          </div>
        )}
      </AppCard>

      <AppCard>
        <h3 style={{ marginBottom: 10 }}>Timeline attività</h3>
        {timeline.length === 0 ? (
          <EmptyState title="Nessun evento recente" description="Qui vedrai eventi smart e operativi legati a questa unità" />
        ) : (
          <div style={{ display: "grid", gap: 12 }}>
            {timeline.map((item) => (
              <TimelineItem key={item.timeline_id} item={item} />
            ))}
          </div>
        )}
      </AppCard>

      <AppCard style={{ marginTop: 12, marginBottom: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <h3 style={{ margin: 0 }}>Trend telemetria unità</h3>
          <div style={{ display: "flex", gap: 8 }}>
            {Object.keys(RANGE_OPTIONS).map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setRange(item)}
                style={item === range ? { borderColor: "var(--color-primary)", color: "var(--color-primary)" } : undefined}
              >
                {item}
              </button>
            ))}
          </div>
        </div>
      </AppCard>

      {telemetryLoading ? <LoadingSkeleton rows={6} height={26} /> : null}

      {!telemetryLoading ? (
        <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))" }}>
          <TelemetryLineCard title="Temperatura" unit="C" color="#0ea5e9" points={temperatureSeries} />
          <TelemetryLineCard title="Umidità" unit="%" color="#22c55e" points={humiditySeries} />
          <TelemetryLineCard title="Potenza" unit="W" color="#f59e0b" points={powerSeries} />
          <TelemetryLineCard title="Energia" unit="kWh" color="#8b5cf6" points={energySeries} />
        </div>
      ) : null}
    </div>
  );
}

export default SmartUnitDetail;
