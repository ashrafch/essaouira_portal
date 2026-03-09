import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import {
  getSmartUnitDetail,
  getSmartUnitDeviceHealth,
  getSmartUnitTimeline,
} from "../services/api";

function SmartUnitDetail() {
  const { unitId } = useParams();
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
          getSmartUnitDetail(unitId, { events_limit: 25 }),
          getSmartUnitTimeline(unitId, { limit: 25 }),
          getSmartUnitDeviceHealth(unitId),
        ]);
        setDetail(d);
        setTimeline(t?.items || []);
        setHealth(h);
      } catch (err) {
        setError(err.message || "Errore caricamento unita smart");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [unitId]);

  if (loading) return <p>Caricamento...</p>;
  if (error) return <p style={{ color: "#b91c1c" }}>{error}</p>;
  if (!detail) return <p style={{ color: "#6b7280" }}>Nessun dato unita smart.</p>;

  const s = detail.summary;
  const hs = health?.summary;
  const problematic = (health?.devices || []).filter((d) => d.needs_attention);

  return (
    <div>
      <h1 style={{ marginTop: 0 }}>Smart Unit: {detail.unit.name}</h1>
      <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", marginBottom: 16 }}>
        <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, background: "#fff", padding: 10 }}>Devices: <strong>{s.total_devices}</strong></div>
        <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, background: "#fff", padding: 10 }}>Online: <strong>{hs?.online_devices ?? s.online_devices}</strong></div>
        <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, background: "#fff", padding: 10 }}>Offline: <strong>{hs?.offline_devices ?? s.offline_devices}</strong></div>
        <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, background: "#fff", padding: 10 }}>Warning: <strong>{hs?.warning_devices ?? s.warning_devices ?? 0}</strong></div>
        <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, background: "#fff", padding: 10 }}>Critical: <strong>{hs?.critical_devices ?? s.critical_devices ?? 0}</strong></div>
        <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, background: "#fff", padding: 10 }}>Open Alerts: <strong>{s.open_alerts}</strong></div>
      </div>

      <div style={{ display: "grid", gap: 12, gridTemplateColumns: "1fr 1fr" }}>
        <section style={{ border: "1px solid #e5e7eb", borderRadius: 12, background: "#fff", padding: 12 }}>
          <h3 style={{ marginTop: 0 }}>Device health</h3>
          {problematic.length === 0 ? (
            <p style={{ color: "#6b7280" }}>Nessun device problematico.</p>
          ) : (
            <div style={{ display: "grid", gap: 8 }}>
              {problematic.map((d) => (
                <div key={d.device_id} style={{ border: "1px solid #eef2f7", borderRadius: 8, padding: 8 }}>
                  <div style={{ fontWeight: 700 }}>{d.name}</div>
                  <div style={{ fontSize: 12, color: "#6b7280" }}>
                    {d.connectivity_status} · {d.health_status} · battery {d.battery_level ?? "-"}% · rssi {d.signal_strength ?? "-"}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section style={{ border: "1px solid #e5e7eb", borderRadius: 12, background: "#fff", padding: 12 }}>
          <h3 style={{ marginTop: 0 }}>Alerts aperti</h3>
          {(detail.alerts_open || []).length === 0 ? <p style={{ color: "#6b7280" }}>Nessun alert aperto.</p> : (
            <ul style={{ margin: 0, paddingLeft: 18 }}>
              {detail.alerts_open.map((a) => <li key={a.id}>{a.title} ({a.severity})</li>)}
            </ul>
          )}
        </section>
      </div>

      <section style={{ border: "1px solid #e5e7eb", borderRadius: 12, background: "#fff", padding: 12, marginTop: 12 }}>
        <h3 style={{ marginTop: 0 }}>Timeline recente</h3>
        {timeline.length === 0 ? (
          <p style={{ color: "#6b7280" }}>Nessun evento.</p>
        ) : (
          <div style={{ display: "grid", gap: 8 }}>
            {timeline.map((i) => (
              <div key={i.timeline_id} style={{ border: "1px solid #eef2f7", borderRadius: 8, padding: 8 }}>
                <div style={{ fontWeight: 600 }}>{i.title}</div>
                <div style={{ fontSize: 12, color: "#6b7280" }}>
                  {i.event_type} · {i.source} · {new Date(i.occurred_at).toLocaleString()}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

export default SmartUnitDetail;
