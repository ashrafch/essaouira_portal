import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getSmartOverview, getUnits } from "../services/api";

function StatCard({ label, value }) {
  return (
    <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 14, background: "#fff" }}>
      <div style={{ fontSize: 12, color: "#6b7280" }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 700, marginTop: 6 }}>{value}</div>
    </div>
  );
}

function SmartOverview() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [overview, setOverview] = useState(null);
  const [units, setUnits] = useState([]);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError("");
      try {
        const [overviewData, unitsData] = await Promise.all([getSmartOverview(), getUnits()]);
        setOverview(overviewData);
        setUnits(unitsData || []);
      } catch (err) {
        setError(err.message || "Errore caricamento Smart Overview");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  return (
    <div>
      <h1 style={{ marginTop: 0 }}>Smart Overview</h1>
      <p style={{ color: "#6b7280" }}>Stato globale dispositivi, alert e accesso rapido alle unità smart.</p>

      {loading && <p>Caricamento...</p>}
      {error && <p style={{ color: "#b91c1c" }}>{error}</p>}

      {!loading && !error && overview && (
        <>
          <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", marginBottom: 18 }}>
            <StatCard label="Dispositivi totali" value={overview.total_devices} />
            <StatCard label="Online" value={overview.online_devices} />
            <StatCard label="Offline" value={overview.offline_devices} />
            <StatCard label="Alert aperti" value={overview.open_alerts} />
            <StatCard label="Alert critici" value={overview.critical_alerts} />
            <StatCard label="Visti ultime 12h" value={overview.recently_seen_devices} />
          </div>

          <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, background: "#fff", padding: 14 }}>
            <h3 style={{ marginTop: 0 }}>Unità</h3>
            {units.length === 0 ? (
              <p style={{ color: "#6b7280" }}>Nessuna unità trovata.</p>
            ) : (
              <div style={{ display: "grid", gap: 8 }}>
                {units.map((u) => (
                  <Link key={u.id} to={`/smart-units/${u.id}`} style={{ textDecoration: "none", color: "#0f766e", fontWeight: 600 }}>
                    {u.name} - dettaglio smart
                  </Link>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

export default SmartOverview;
