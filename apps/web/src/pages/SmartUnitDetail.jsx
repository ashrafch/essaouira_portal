import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { getSmartUnitDetail, getSmartUnitTimeline } from "../services/api";

function SmartUnitDetail() {
  const { unitId } = useParams();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [detail, setDetail] = useState(null);
  const [timeline, setTimeline] = useState([]);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError("");
      try {
        const [d, t] = await Promise.all([
          getSmartUnitDetail(unitId, { events_limit: 25 }),
          getSmartUnitTimeline(unitId, { limit: 25 }),
        ]);
        setDetail(d);
        setTimeline(t?.items || []);
      } catch (err) {
        setError(err.message || "Errore caricamento unità smart");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [unitId]);

  if (loading) return <p>Caricamento...</p>;
  if (error) return <p style={{ color: "#b91c1c" }}>{error}</p>;
  if (!detail) return <p style={{ color: "#6b7280" }}>Nessun dato unità smart.</p>;

  const s = detail.summary;
  return (
    <div>
      <h1 style={{ marginTop: 0 }}>Smart Unit: {detail.unit.name}</h1>
      <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", marginBottom: 16 }}>
        <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, background: "#fff", padding: 10 }}>Devices: <strong>{s.total_devices}</strong></div>
        <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, background: "#fff", padding: 10 }}>Online: <strong>{s.online_devices}</strong></div>
        <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, background: "#fff", padding: 10 }}>Offline: <strong>{s.offline_devices}</strong></div>
        <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, background: "#fff", padding: 10 }}>Open Alerts: <strong>{s.open_alerts}</strong></div>
      </div>

      <div style={{ display: "grid", gap: 12, gridTemplateColumns: "1fr 1fr" }}>
        <section style={{ border: "1px solid #e5e7eb", borderRadius: 12, background: "#fff", padding: 12 }}>
          <h3 style={{ marginTop: 0 }}>Devices</h3>
          {(detail.devices || []).length === 0 ? <p style={{ color: "#6b7280" }}>Nessun device associato.</p> : (
            <ul style={{ margin: 0, paddingLeft: 18 }}>
              {detail.devices.map((d) => <li key={d.id}>{d.name} ({d.category})</li>)}
            </ul>
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
