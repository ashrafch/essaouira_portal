import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { AlertTriangle, Rocket } from "lucide-react";
import { AppCard, EmptyState, LoadingSkeleton, SectionHeader, StatCard } from "../components/ui";
import ActivityCard from "../components/dashboard/ActivityCard";
import DeviceCard from "../components/smart/DeviceCard";
import TimelineItem from "../components/smart/TimelineItem";
import {
  getSmartUnitDetail,
  getSmartUnitDeviceHealth,
  getSmartUnitTimeline,
} from "../services/api";

function SmartUnitDetail() {
  const { unitId } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [detail, setDetail] = useState(null);
  const [timeline, setTimeline] = useState([]);
  const [health, setHealth] = useState(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
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
        setError(err.message || "Errore caricamento unit smart");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [unitId]);

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

  if (loading) return <LoadingSkeleton rows={8} height={28} />;
  if (error) return <p style={{ color: "#b91c1c" }}>{error}</p>;
  if (!detail || !summary) return <EmptyState title="Nessun dato unit smart" />;

  return (
    <div>
      <SectionHeader
        title={`Smart Unit · ${detail.unit.name}`}
        subtitle="Control center operativo della singola unità: salute device, alert e timeline eventi"
        right={
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button type="button" onClick={() => navigate("/smart-automation")}>Open automation</button>
            <button type="button" onClick={() => navigate("/smart-alerts")}>Create / manage alerts</button>
          </div>
        }
      />

      <div className="ui-grid-cards" style={{ marginBottom: 12 }}>
        <StatCard label="Devices" value={summary.total_devices} />
        <StatCard label="Online" value={healthSummary?.online_devices ?? summary.online_devices} tone="success" />
        <StatCard label="Offline" value={healthSummary?.offline_devices ?? summary.offline_devices} tone="danger" />
        <StatCard label="Warning" value={healthSummary?.warning_devices ?? summary.warning_devices ?? 0} tone="warning" />
        <StatCard label="Critical" value={healthSummary?.critical_devices ?? summary.critical_devices ?? 0} tone="danger" />
        <StatCard label="Open alerts" value={summary.open_alerts} icon={<AlertTriangle size={15} />} tone="warning" />
      </div>

      <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", marginBottom: 12 }}>
        <AppCard>
          <h3 style={{ marginBottom: 10 }}>Open alerts</h3>
          {detail.alerts_open?.length ? (
            <div style={{ display: "grid", gap: 8 }}>
              {detail.alerts_open.slice(0, 6).map((a) => (
                <ActivityCard
                  key={a.id}
                  title={a.title}
                  subtitle={`${a.alert_type} · status ${a.status}`}
                  severity={a.severity}
                  timestamp={a.last_seen_at || a.first_seen_at}
                />
              ))}
            </div>
          ) : (
            <EmptyState title="Nessun alert aperto" description="La unità non ha allarmi aperti" />
          )}
        </AppCard>

        <AppCard>
          <h3 style={{ marginBottom: 10 }}>Quick actions</h3>
          <div style={{ display: "grid", gap: 10 }}>
            <button type="button" onClick={() => navigate("/smart-automation")}>
              <Rocket size={14} style={{ marginRight: 6 }} />
              Trigger scene / rule
            </button>
            <button type="button" onClick={() => navigate("/smart-devices")}>Manage bound devices</button>
            <button type="button" onClick={() => navigate("/smart-dashboard")}>Go to smart dashboard</button>
          </div>
        </AppCard>
      </div>

      <AppCard style={{ marginBottom: 12 }}>
        <h3 style={{ marginBottom: 10 }}>Devices bound to unit</h3>
        {devicesWithHealth.length === 0 ? (
          <EmptyState title="Nessun device assegnato" description="Assegna dispositivi dalla Setup Wizard o dalla pagina Devices" />
        ) : (
          <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))" }}>
            {devicesWithHealth.map((device) => (
              <DeviceCard key={device.device_id} device={device} />
            ))}
          </div>
        )}
      </AppCard>

      <AppCard>
        <h3 style={{ marginBottom: 10 }}>Timeline attività</h3>
        {timeline.length === 0 ? (
          <EmptyState title="Nessun evento recente" description="La timeline mostrerà eventi smart e operativi legati a questa unità" />
        ) : (
          <div style={{ display: "grid", gap: 12 }}>
            {timeline.map((item) => (
              <TimelineItem key={item.timeline_id} item={item} />
            ))}
          </div>
        )}
      </AppCard>
    </div>
  );
}

export default SmartUnitDetail;

