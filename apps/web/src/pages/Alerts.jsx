import { useEffect, useState } from "react";
import PageInfoHelp from "../components/PageInfoHelp";
import { acknowledgeSmartAlert, getSmartAlerts } from "../services/api";

function Alerts() {
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [savingId, setSavingId] = useState(null);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const data = await getSmartAlerts();
      setAlerts(data || []);
    } catch (err) {
      setError(err.message || "Errore caricando smart alerts");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function handleAcknowledge(alertId) {
    setSavingId(alertId);
    try {
      await acknowledgeSmartAlert(alertId);
      await load();
    } catch (err) {
      alert(`Errore acknowledge: ${err.message}`);
    } finally {
      setSavingId(null);
    }
  }

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
          <h1 style={{ margin: 0 }}>Smart Alerts</h1>
          <p style={{ margin: "4px 0 0", fontSize: 13, color: "#64748b" }}>
            Alert tecnici da dominio Smart Building (foundation).
          </p>
        </div>
        <PageInfoHelp title="Come usare Smart Alerts">
          <p>Gli alert sono separati dagli alert operativi PMS e sono tenant-scoped.</p>
          <p>In Phase 1 possono arrivare anche da simulazioni mock.</p>
        </PageInfoHelp>
      </div>

      {loading ? <div style={card}>Caricamento smart alerts...</div> : null}
      {error ? <div style={{ ...card, color: "#b91c1c" }}>{error}</div> : null}

      {!loading && !error ? (
        alerts.length === 0 ? (
          <div style={card}>Nessun alert smart presente.</div>
        ) : (
          <div style={{ display: "grid", gap: 10 }}>
            {alerts.map((a) => (
              <div key={a.id} style={card}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                  <div>
                    <div style={{ fontWeight: 700 }}>{a.title}</div>
                    <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>
                      {a.alert_type} · severity {a.severity} · status {a.status}
                    </div>
                    {a.description ? (
                      <div style={{ fontSize: 12, color: "#334155", marginTop: 6 }}>{a.description}</div>
                    ) : null}
                  </div>
                  {a.status === "open" ? (
                    <button
                      type="button"
                      onClick={() => handleAcknowledge(a.id)}
                      disabled={savingId === a.id}
                      style={{
                        borderRadius: 999,
                        border: "1px solid #d1d5db",
                        padding: "6px 12px",
                        fontSize: 12,
                        background: "white",
                        cursor: "pointer",
                        height: 32,
                      }}
                    >
                      {savingId === a.id ? "Salvataggio..." : "Acknowledge"}
                    </button>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        )
      ) : null}
    </div>
  );
}

export default Alerts;

