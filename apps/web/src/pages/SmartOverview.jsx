import { useEffect, useState } from "react";
import PageInfoHelp from "../components/PageInfoHelp";
import { getSmartOverview } from "../services/api";

function SmartOverview() {
  const [overview, setOverview] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError("");
      try {
        const data = await getSmartOverview();
        setOverview(data);
      } catch (err) {
        setError(err.message || "Errore caricando overview smart");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const card = {
    background: "linear-gradient(180deg,#fff 0%,#f8fafc 100%)",
    borderRadius: 16,
    padding: 14,
    border: "1px solid #e2e8f0",
    boxShadow: "0 8px 20px rgba(15,23,42,0.05)",
  };

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ margin: 0 }}>Smart Overview</h1>
          <p style={{ margin: "4px 0 0", fontSize: 13, color: "#64748b" }}>
            Fondazione Smart Building (Phase 1): inventario, stato e alert.
          </p>
        </div>
        <PageInfoHelp title="Come usare Smart Overview">
          <p>Questa sezione mostra i KPI tecnici Smart Building del tenant corrente.</p>
          <p>In questa fase i dati possono arrivare da provider mock/simulazione.</p>
        </PageInfoHelp>
      </div>

      {loading ? <div style={card}>Caricamento smart overview...</div> : null}
      {error ? <div style={{ ...card, color: "#b91c1c" }}>{error}</div> : null}

      {!loading && !error && overview ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 12 }}>
          <div style={card}>
            <div style={{ fontSize: 11, color: "#64748b", textTransform: "uppercase" }}>Device Totali</div>
            <div style={{ fontSize: 26, fontWeight: 700 }}>{overview.total_devices}</div>
          </div>
          <div style={card}>
            <div style={{ fontSize: 11, color: "#64748b", textTransform: "uppercase" }}>Online</div>
            <div style={{ fontSize: 26, fontWeight: 700, color: "#15803d" }}>{overview.online_devices}</div>
          </div>
          <div style={card}>
            <div style={{ fontSize: 11, color: "#64748b", textTransform: "uppercase" }}>Offline</div>
            <div style={{ fontSize: 26, fontWeight: 700, color: "#b45309" }}>{overview.offline_devices}</div>
          </div>
          <div style={card}>
            <div style={{ fontSize: 11, color: "#64748b", textTransform: "uppercase" }}>Alert Aperti</div>
            <div style={{ fontSize: 26, fontWeight: 700, color: "#b91c1c" }}>{overview.open_alerts}</div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default SmartOverview;

