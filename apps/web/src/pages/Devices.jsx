import { useEffect, useState } from "react";
import PageInfoHelp from "../components/PageInfoHelp";
import { getDevices, simulateDeviceSync } from "../services/api";

function Devices() {
  const [items, setItems] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [syncingId, setSyncingId] = useState(null);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const data = await getDevices();
      setItems(data || []);
    } catch (err) {
      setError(err.message || "Errore caricando devices");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function handleSimulateSync(deviceId) {
    setSyncingId(deviceId);
    try {
      await simulateDeviceSync(deviceId);
      await load();
    } catch (err) {
      alert(`Errore simulazione: ${err.message}`);
    } finally {
      setSyncingId(null);
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
          <h1 style={{ margin: 0 }}>Device Inventory</h1>
          <p style={{ margin: "4px 0 0", fontSize: 13, color: "#64748b" }}>
            Registro device tenant-safe con supporto simulazione provider mock.
          </p>
        </div>
        <PageInfoHelp title="Come usare Devices">
          <p>In questa fase non ci sono integrazioni hardware reali.</p>
          <p>Usa \"Simula sync\" per testare lo stato device via provider mock.</p>
        </PageInfoHelp>
      </div>

      {loading ? <div style={card}>Caricamento devices...</div> : null}
      {error ? <div style={{ ...card, color: "#b91c1c" }}>{error}</div> : null}

      {!loading && !error ? (
        items.length === 0 ? (
          <div style={card}>Nessun device configurato per questo tenant.</div>
        ) : (
          <div style={{ ...card, overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr>
                  <th style={{ textAlign: "left", borderBottom: "1px solid #e5e7eb", padding: "6px 4px" }}>Nome</th>
                  <th style={{ textAlign: "left", borderBottom: "1px solid #e5e7eb", padding: "6px 4px" }}>Categoria</th>
                  <th style={{ textAlign: "left", borderBottom: "1px solid #e5e7eb", padding: "6px 4px" }}>Provider</th>
                  <th style={{ textAlign: "left", borderBottom: "1px solid #e5e7eb", padding: "6px 4px" }}>Health</th>
                  <th style={{ textAlign: "left", borderBottom: "1px solid #e5e7eb", padding: "6px 4px" }}>Last seen</th>
                  <th style={{ textAlign: "left", borderBottom: "1px solid #e5e7eb", padding: "6px 4px" }}>Azioni</th>
                </tr>
              </thead>
              <tbody>
                {items.map((d) => (
                  <tr key={d.id}>
                    <td style={{ borderBottom: "1px solid #f1f5f9", padding: "8px 4px" }}>{d.name}</td>
                    <td style={{ borderBottom: "1px solid #f1f5f9", padding: "8px 4px" }}>{d.category}</td>
                    <td style={{ borderBottom: "1px solid #f1f5f9", padding: "8px 4px" }}>{d.provider}</td>
                    <td style={{ borderBottom: "1px solid #f1f5f9", padding: "8px 4px" }}>{d.health_status}</td>
                    <td style={{ borderBottom: "1px solid #f1f5f9", padding: "8px 4px" }}>
                      {d.last_seen_at ? new Date(d.last_seen_at).toLocaleString("it-IT") : "n/d"}
                    </td>
                    <td style={{ borderBottom: "1px solid #f1f5f9", padding: "8px 4px" }}>
                      <button
                        type="button"
                        onClick={() => handleSimulateSync(d.id)}
                        disabled={syncingId === d.id}
                        style={{
                          borderRadius: 999,
                          border: "1px solid #d1d5db",
                          padding: "4px 10px",
                          fontSize: 12,
                          background: "white",
                          cursor: "pointer",
                        }}
                      >
                        {syncingId === d.id ? "Sync..." : "Simula sync"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      ) : null}
    </div>
  );
}

export default Devices;

