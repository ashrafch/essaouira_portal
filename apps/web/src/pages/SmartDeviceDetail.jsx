import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
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
  SectionHeader,
  StatusBadge,
} from "../components/ui";
import useAutoRefresh from "../hooks/useAutoRefresh";
import {
  getSingleSmartDeviceHealth,
  getSmartDevice,
  getSmartDeviceTelemetry,
} from "../services/api";

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
  return (data?.series || []).find((series) => series.metric_type === metricType) || null;
}

function mapPoints(series) {
  if (!series) return [];
  return (series.points || []).map((point) => ({
    label: new Date(point.recorded_at).toLocaleString(),
    value: Number(point.value),
  }));
}

function TelemetryLineCard({ title, unit, color, points }) {
  return (
    <AppCard>
      <h3 style={{ marginBottom: 8 }}>{title}</h3>
      {points.length === 0 ? (
        <EmptyState title="Nessun dato nel periodo" />
      ) : (
        <div style={{ height: 230 }}>
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

function SmartDeviceDetail() {
  const { deviceId } = useParams();
  const navigate = useNavigate();
  const [range, setRange] = useState("24h");
  const [loading, setLoading] = useState(true);
  const [telemetryLoading, setTelemetryLoading] = useState(true);
  const [error, setError] = useState("");
  const [device, setDevice] = useState(null);
  const [health, setHealth] = useState(null);
  const [telemetry, setTelemetry] = useState(null);

  async function loadCore(silent = false) {
    if (!silent) setLoading(true);
    setError("");
    try {
      const [deviceData, healthData] = await Promise.all([
        getSmartDevice(deviceId),
        getSingleSmartDeviceHealth(deviceId),
      ]);
      setDevice(deviceData);
      setHealth(healthData);
    } catch (err) {
      setError(err.message || "Errore caricamento dettaglio dispositivo");
    } finally {
      if (!silent) setLoading(false);
    }
  }

  async function loadTelemetry(silent = false) {
    if (!silent) setTelemetryLoading(true);
    try {
      const params = buildDateRange(range);
      const data = await getSmartDeviceTelemetry(deviceId, params);
      setTelemetry(data);
    } catch (err) {
      setError(err.message || "Errore caricamento telemetria");
    } finally {
      if (!silent) setTelemetryLoading(false);
    }
  }

  useEffect(() => {
    loadCore();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deviceId]);

  useEffect(() => {
    loadTelemetry();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deviceId, range]);

  const { isRefreshing, lastRefreshAt, refreshNow } = useAutoRefresh({
    onRefresh: async () => {
      await Promise.all([loadCore(true), loadTelemetry(true)]);
    },
    intervalMs: 15000,
    enabled: !loading && !error,
    immediate: false,
  });

  const temperatureSeries = useMemo(() => mapPoints(pickSeries(telemetry, "temperature")), [telemetry]);
  const humiditySeries = useMemo(() => mapPoints(pickSeries(telemetry, "humidity")), [telemetry]);
  const powerSeries = useMemo(() => mapPoints(pickSeries(telemetry, "power")), [telemetry]);
  const energySeries = useMemo(() => mapPoints(pickSeries(telemetry, "energy")), [telemetry]);

  if (loading) return <LoadingSkeleton rows={7} height={28} />;
  if (error) return <p style={{ color: "#b91c1c" }}>{error}</p>;
  if (!device || !health) return <EmptyState title="Dispositivo non trovato" />;

  return (
    <div>
      <SectionHeader
        title={`Dispositivo · ${device.name}`}
        subtitle={`${device.provider} · ${device.category}`}
        right={(
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <LiveStatusDot active={!document.hidden} title="Auto refresh 15s" />
              <LastUpdatedIndicator value={lastRefreshAt || telemetry?.last_updated_at || health?.last_updated_at} label="Refresh" />
              <FreshnessBadge status={telemetry?.data_freshness_status || health?.data_freshness_status} />
            </span>
            <button type="button" onClick={refreshNow} disabled={isRefreshing}>
              {isRefreshing ? "Aggiorno..." : "Aggiorna ora"}
            </button>
            <button type="button" onClick={() => navigate("/smart-devices")}>Torna ai dispositivi</button>
            <button type="button" onClick={() => navigate("/smart-dashboard")}>Apri dashboard</button>
          </div>
        )}
      />

      <div className="ui-grid-cards" style={{ marginBottom: 12 }}>
        <AppCard>
          <div style={{ fontSize: 12, color: "#64748b" }}>Connettività</div>
          <StatusBadge status={health.connectivity_status} />
        </AppCard>
        <AppCard>
          <div style={{ fontSize: 12, color: "#64748b" }}>Salute</div>
          <StatusBadge status={health.health_status} />
        </AppCard>
        <AppCard>
          <div style={{ fontSize: 12, color: "#64748b" }}>Freshness</div>
          <FreshnessBadge status={health.data_freshness_status || telemetry?.data_freshness_status} />
        </AppCard>
        <AppCard>
          <div style={{ fontSize: 12, color: "#64748b" }}>Batteria</div>
          <strong>{health.battery_level ?? "n/d"}%</strong>
        </AppCard>
        <AppCard>
          <div style={{ fontSize: 12, color: "#64748b" }}>Segnale</div>
          <strong>{health.signal_strength ?? "n/d"} dBm</strong>
        </AppCard>
      </div>

      <AppCard style={{ marginBottom: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <h3 style={{ margin: 0 }}>Trend telemetria</h3>
          <div style={{ display: "flex", gap: 8 }}>
            {Object.keys(RANGE_OPTIONS).map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setRange(item)}
                style={item === range ? { borderColor: "#0f766e", color: "#0f766e" } : undefined}
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

export default SmartDeviceDetail;
