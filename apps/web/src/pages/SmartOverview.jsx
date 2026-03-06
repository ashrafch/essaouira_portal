import { useEffect, useMemo, useState } from "react";
import PageInfoHelp from "../components/PageInfoHelp";
import useIsMobile from "../hooks/useIsMobile";
import { getDeviceState, getDevices, getSmartAlerts, getSmartOverview, getUnits } from "../services/api";

function SmartOverview() {
  const isMobile = useIsMobile(900);
  const [overview, setOverview] = useState(null);
  const [units, setUnits] = useState([]);
  const [devices, setDevices] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [stateMap, setStateMap] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const [ov, unitList, deviceList, alertList] = await Promise.all([
        getSmartOverview(),
        getUnits(),
        getDevices(),
        getSmartAlerts(),
      ]);
      setOverview(ov || null);
      setUnits(unitList || []);
      setDevices(deviceList || []);
      setAlerts(alertList || []);

      const pairs = await Promise.all(
        (deviceList || []).map(async (d) => {
          try {
            const state = await getDeviceState(d.id);
            return [d.id, state];
          } catch {
            return [d.id, null];
          }
        })
      );
      const next = {};
      pairs.forEach(([id, state]) => {
        next[id] = state;
      });
      setStateMap(next);
    } catch (err) {
      setError(err.message || "Errore caricando smart overview");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const unitMap = useMemo(() => {
    const map = {};
    units.forEach((u) => {
      map[u.id] = u;
    });
    return map;
  }, [units]);

  const summaryByUnit = useMemo(() => {
    const grouped = {};
    devices.forEach((d) => {
      const key = d.unit_id || 0;
      if (!grouped[key]) {
        grouped[key] = { unit_id: d.unit_id, name: d.unit_id ? unitMap[d.unit_id]?.name || `Unit #${d.unit_id}` : "Aree comuni", total: 0, online: 0, offline: 0, unknown: 0, open_alerts: 0 };
      }
      grouped[key].total += 1;
      const online = stateMap[d.id]?.online;
      if (online === true) grouped[key].online += 1;
      else if (online === false) grouped[key].offline += 1;
      else grouped[key].unknown += 1;
    });

    alerts.forEach((a) => {
      if (a.status !== "open") return;
      const key = a.unit_id || 0;
      if (!grouped[key]) {
        grouped[key] = { unit_id: a.unit_id, name: a.unit_id ? unitMap[a.unit_id]?.name || `Unit #${a.unit_id}` : "Aree comuni", total: 0, online: 0, offline: 0, unknown: 0, open_alerts: 0 };
      }
      grouped[key].open_alerts += 1;
    });

    return Object.values(grouped).sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
  }, [devices, alerts, stateMap, unitMap]);

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
            Panorama smart edificio: sintesi generale e stato per unita.
          </p>
        </div>
        <PageInfoHelp title="Come usare Smart Overview">
          <p>Questa pagina consolida KPI globali e indicatori per singola unita.</p>
          <p>Con hardware non installato, i dati sono testabili via provider mock.</p>
        </PageInfoHelp>
      </div>

      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <button
          type="button"
          onClick={load}
          style={{ borderRadius: 999, border: "1px solid #d1d5db", padding: "6px 12px", fontSize: 12, background: "white", cursor: "pointer" }}
        >
          Aggiorna overview
        </button>
      </div>

      {loading ? <div style={card}>Caricamento smart overview...</div> : null}
      {error ? <div style={{ ...card, color: "#b91c1c" }}>{error}</div> : null}

      {!loading && !error && overview ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
          <div style={card}>
            <div style={{ fontSize: 11, color: "#64748b", textTransform: "uppercase" }}>Device totali</div>
            <div style={{ fontSize: 24, fontWeight: 700 }}>{overview.total_devices}</div>
          </div>
          <div style={card}>
            <div style={{ fontSize: 11, color: "#64748b", textTransform: "uppercase" }}>Online</div>
            <div style={{ fontSize: 24, fontWeight: 700, color: "#15803d" }}>{overview.online_devices}</div>
          </div>
          <div style={card}>
            <div style={{ fontSize: 11, color: "#64748b", textTransform: "uppercase" }}>Offline</div>
            <div style={{ fontSize: 24, fontWeight: 700, color: "#b91c1c" }}>{overview.offline_devices}</div>
          </div>
          <div style={card}>
            <div style={{ fontSize: 11, color: "#64748b", textTransform: "uppercase" }}>Alert aperti</div>
            <div style={{ fontSize: 24, fontWeight: 700, color: "#b91c1c" }}>{overview.open_alerts}</div>
          </div>
          <div style={card}>
            <div style={{ fontSize: 11, color: "#64748b", textTransform: "uppercase" }}>Alert critici</div>
            <div style={{ fontSize: 24, fontWeight: 700, color: "#b45309" }}>{overview.critical_alerts}</div>
          </div>
          <div style={card}>
            <div style={{ fontSize: 11, color: "#64748b", textTransform: "uppercase" }}>Seen 12h</div>
            <div style={{ fontSize: 24, fontWeight: 700, color: "#1d4ed8" }}>{overview.recently_seen_devices}</div>
          </div>
        </div>
      ) : null}

      {!loading && !error ? (
        summaryByUnit.length === 0 ? (
          <div style={card}>Nessun device configurato. Vai su Device Inventory e lancia \"Sync provider\".</div>
        ) : (
          <div style={card}>
            <h3 style={{ marginTop: 0, marginBottom: 10, fontSize: 15 }}>Stato smart per unita</h3>
            {isMobile ? (
              <div style={{ display: "grid", gap: 8 }}>
                {summaryByUnit.map((u) => (
                  <div key={`${u.unit_id || 0}-${u.name}`} style={{ border: "1px solid #e2e8f0", borderRadius: 12, padding: 10, background: "#fff" }}>
                    <div style={{ fontWeight: 700 }}>{u.name}</div>
                    <div style={{ fontSize: 12, color: "#64748b", marginTop: 4 }}>device: {u.total} · alert aperti: {u.open_alerts}</div>
                    <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
                      <span style={{ ...pill("#dcfce7", "#166534", "#86efac"), fontWeight: 600 }}>online {u.online}</span>
                      <span style={{ ...pill("#fee2e2", "#991b1b", "#fca5a5"), fontWeight: 600 }}>offline {u.offline}</span>
                      <span style={{ ...pill("#e2e8f0", "#334155", "#cbd5e1"), fontWeight: 600 }}>unknown {u.unknown}</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr>
                      <th style={{ textAlign: "left", borderBottom: "1px solid #e5e7eb", padding: "6px 4px" }}>Unita</th>
                      <th style={{ textAlign: "left", borderBottom: "1px solid #e5e7eb", padding: "6px 4px" }}>Device</th>
                      <th style={{ textAlign: "left", borderBottom: "1px solid #e5e7eb", padding: "6px 4px" }}>Online</th>
                      <th style={{ textAlign: "left", borderBottom: "1px solid #e5e7eb", padding: "6px 4px" }}>Offline</th>
                      <th style={{ textAlign: "left", borderBottom: "1px solid #e5e7eb", padding: "6px 4px" }}>Unknown</th>
                      <th style={{ textAlign: "left", borderBottom: "1px solid #e5e7eb", padding: "6px 4px" }}>Alert open</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summaryByUnit.map((u) => (
                      <tr key={`${u.unit_id || 0}-${u.name}`}>
                        <td style={{ borderBottom: "1px solid #f1f5f9", padding: "8px 4px", fontWeight: 600 }}>{u.name}</td>
                        <td style={{ borderBottom: "1px solid #f1f5f9", padding: "8px 4px" }}>{u.total}</td>
                        <td style={{ borderBottom: "1px solid #f1f5f9", padding: "8px 4px", color: "#15803d", fontWeight: 600 }}>{u.online}</td>
                        <td style={{ borderBottom: "1px solid #f1f5f9", padding: "8px 4px", color: "#b91c1c", fontWeight: 600 }}>{u.offline}</td>
                        <td style={{ borderBottom: "1px solid #f1f5f9", padding: "8px 4px", color: "#334155", fontWeight: 600 }}>{u.unknown}</td>
                        <td style={{ borderBottom: "1px solid #f1f5f9", padding: "8px 4px", color: u.open_alerts > 0 ? "#b91c1c" : "#334155", fontWeight: 700 }}>{u.open_alerts}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )
      ) : null}
    </div>
  );
}

function pill(bg, color, border) {
  return {
    display: "inline-flex",
    alignItems: "center",
    borderRadius: 999,
    padding: "3px 8px",
    fontSize: 11,
    background: bg,
    color,
    border: `1px solid ${border}`,
  };
}

export default SmartOverview;
