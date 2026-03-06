import { useEffect, useMemo, useState } from "react";
import PageInfoHelp from "../components/PageInfoHelp";
import useIsMobile from "../hooks/useIsMobile";
import {
  getDeviceState,
  getDevices,
  getSmartProviderDebug,
  simulateDeviceSync,
  syncSmartProvider,
} from "../services/api";

function toDateTime(value) {
  if (!value) return "n/d";
  return new Date(value).toLocaleString("it-IT");
}

function pill(bg, color, border = "transparent") {
  return {
    display: "inline-flex",
    alignItems: "center",
    borderRadius: 999,
    padding: "3px 9px",
    fontSize: 11,
    fontWeight: 600,
    background: bg,
    color,
    border: `1px solid ${border}`,
    whiteSpace: "nowrap",
  };
}

function Devices() {
  const isMobile = useIsMobile(900);
  const [devices, setDevices] = useState([]);
  const [stateMap, setStateMap] = useState({});
  const [providerDebug, setProviderDebug] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [syncingProvider, setSyncingProvider] = useState(false);
  const [syncingDeviceId, setSyncingDeviceId] = useState(null);
  const [query, setQuery] = useState("");
  const [providerFilter, setProviderFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [onlineFilter, setOnlineFilter] = useState("all");

  async function loadAll() {
    setLoading(true);
    setError("");
    try {
      const [deviceList, debug] = await Promise.all([getDevices(), getSmartProviderDebug("mock")]);
      setDevices(deviceList || []);
      setProviderDebug(debug || null);

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
      setError(err.message || "Errore caricando device inventory");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAll();
  }, []);

  const providers = useMemo(
    () => ["all", ...Array.from(new Set(devices.map((d) => d.provider))).sort()],
    [devices]
  );
  const categories = useMemo(
    () => ["all", ...Array.from(new Set(devices.map((d) => d.category))).sort()],
    [devices]
  );

  const filtered = useMemo(() => {
    return devices.filter((d) => {
      if (providerFilter !== "all" && d.provider !== providerFilter) return false;
      if (categoryFilter !== "all" && d.category !== categoryFilter) return false;
      if (query.trim()) {
        const q = query.trim().toLowerCase();
        const hay = `${d.name} ${d.external_id} ${d.zone_name || ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (onlineFilter !== "all") {
        const online = stateMap[d.id]?.online;
        if (onlineFilter === "online" && online !== true) return false;
        if (onlineFilter === "offline" && online !== false) return false;
        if (onlineFilter === "unknown" && online != null) return false;
      }
      return true;
    });
  }, [devices, providerFilter, categoryFilter, query, onlineFilter, stateMap]);

  async function handleProviderSync() {
    setSyncingProvider(true);
    try {
      await syncSmartProvider("mock");
      await loadAll();
    } catch (err) {
      alert(`Errore sync provider: ${err.message}`);
    } finally {
      setSyncingProvider(false);
    }
  }

  async function handleDeviceSync(deviceId) {
    setSyncingDeviceId(deviceId);
    try {
      await simulateDeviceSync(deviceId);
      await loadAll();
    } catch (err) {
      alert(`Errore sync device: ${err.message}`);
    } finally {
      setSyncingDeviceId(null);
    }
  }

  const card = {
    background: "linear-gradient(180deg,#fff 0%,#f8fafc 100%)",
    borderRadius: 16,
    padding: 14,
    border: "1px solid #e2e8f0",
    boxShadow: "0 8px 20px rgba(15,23,42,0.05)",
  };

  const onlineCount = filtered.filter((d) => stateMap[d.id]?.online === true).length;
  const offlineCount = filtered.filter((d) => stateMap[d.id]?.online === false).length;
  const unknownCount = filtered.length - onlineCount - offlineCount;

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ margin: 0 }}>Device Inventory</h1>
          <p style={{ margin: "4px 0 0", fontSize: 13, color: "#64748b" }}>
            Inventario dispositivi smart con stato live/simulato per tenant.
          </p>
        </div>
        <PageInfoHelp title="Come usare Devices">
          <p>Usa \"Sync provider\" per importare catalogo mock e aggiornare stati iniziali.</p>
          <p>Usa \"Simula sync\" su una riga per aggiornare solo quel device.</p>
        </PageInfoHelp>
      </div>

      <div style={card}>
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(4, minmax(160px, 1fr))", gap: 10 }}>
          <div>
            <div style={{ fontSize: 11, color: "#64748b", textTransform: "uppercase" }}>Filtrati</div>
            <div style={{ fontSize: 24, fontWeight: 700 }}>{filtered.length}</div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: "#64748b", textTransform: "uppercase" }}>Online</div>
            <div style={{ fontSize: 24, fontWeight: 700, color: "#15803d" }}>{onlineCount}</div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: "#64748b", textTransform: "uppercase" }}>Offline</div>
            <div style={{ fontSize: 24, fontWeight: 700, color: "#b91c1c" }}>{offlineCount}</div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: "#64748b", textTransform: "uppercase" }}>Stato sconosciuto</div>
            <div style={{ fontSize: 24, fontWeight: 700, color: "#334155" }}>{unknownCount}</div>
          </div>
        </div>
      </div>

      <div style={card}>
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1.2fr 1fr 1fr 1fr auto auto", gap: 8, alignItems: "end" }}>
          <div>
            <label style={{ fontSize: 12, color: "#64748b" }}>Cerca</label>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Nome, external id, zona"
              style={{ width: "100%", borderRadius: 8, border: "1px solid #d1d5db", padding: "6px 8px", fontSize: 13 }}
            />
          </div>
          <div>
            <label style={{ fontSize: 12, color: "#64748b" }}>Provider</label>
            <select value={providerFilter} onChange={(e) => setProviderFilter(e.target.value)} style={{ width: "100%", borderRadius: 8, border: "1px solid #d1d5db", padding: "6px 8px", fontSize: 13 }}>
              {providers.map((p) => (
                <option key={p} value={p}>{p === "all" ? "Tutti" : p}</option>
              ))}
            </select>
          </div>
          <div>
            <label style={{ fontSize: 12, color: "#64748b" }}>Categoria</label>
            <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} style={{ width: "100%", borderRadius: 8, border: "1px solid #d1d5db", padding: "6px 8px", fontSize: 13 }}>
              {categories.map((c) => (
                <option key={c} value={c}>{c === "all" ? "Tutte" : c}</option>
              ))}
            </select>
          </div>
          <div>
            <label style={{ fontSize: 12, color: "#64748b" }}>Connettivita</label>
            <select value={onlineFilter} onChange={(e) => setOnlineFilter(e.target.value)} style={{ width: "100%", borderRadius: 8, border: "1px solid #d1d5db", padding: "6px 8px", fontSize: 13 }}>
              <option value="all">Tutti</option>
              <option value="online">Online</option>
              <option value="offline">Offline</option>
              <option value="unknown">Sconosciuto</option>
            </select>
          </div>
          <button
            type="button"
            onClick={loadAll}
            style={{ borderRadius: 999, border: "1px solid #d1d5db", padding: "7px 12px", fontSize: 12, background: "white", cursor: "pointer" }}
          >
            Aggiorna
          </button>
          <button
            type="button"
            onClick={handleProviderSync}
            disabled={syncingProvider}
            style={{ borderRadius: 999, border: "1px solid #0f766e", padding: "7px 12px", fontSize: 12, background: "#0f766e", color: "white", cursor: "pointer" }}
          >
            {syncingProvider ? "Sync..." : "Sync provider"}
          </button>
        </div>
        {providerDebug ? (
          <div style={{ marginTop: 10, fontSize: 12, color: "#64748b" }}>
            Provider `{providerDebug.provider_name}` · catalog sync: {String(providerDebug.supports_catalog_sync)} · webhook ingest: {String(providerDebug.supports_webhook_ingest)}
          </div>
        ) : null}
      </div>

      {loading ? <div style={card}>Caricamento devices...</div> : null}
      {error ? <div style={{ ...card, color: "#b91c1c" }}>{error}</div> : null}

      {!loading && !error && filtered.length === 0 ? (
        <div style={card}>Nessun device trovato con i filtri attivi.</div>
      ) : null}

      {!loading && !error && filtered.length > 0 ? (
        isMobile ? (
          <div style={{ display: "grid", gap: 10 }}>
            {filtered.map((d) => {
              const st = stateMap[d.id];
              const online = st?.online;
              return (
                <div key={d.id} style={card}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                    <div>
                      <div style={{ fontWeight: 700 }}>{d.name}</div>
                      <div style={{ fontSize: 12, color: "#64748b" }}>{d.external_id}</div>
                    </div>
                    <span style={online === true ? pill("#dcfce7", "#166534", "#86efac") : online === false ? pill("#fee2e2", "#991b1b", "#fca5a5") : pill("#e2e8f0", "#334155", "#cbd5e1")}>
                      {online === true ? "online" : online === false ? "offline" : "unknown"}
                    </span>
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
                    <span style={pill("#eef2ff", "#3730a3", "#c7d2fe")}>{d.provider}</span>
                    <span style={pill("#f8fafc", "#334155", "#cbd5e1")}>{d.category}</span>
                    <span style={pill("#fff7ed", "#9a3412", "#fed7aa")}>health {d.health_status}</span>
                    <span style={pill("#ecfeff", "#0e7490", "#a5f3fc")}>battery {d.battery_level ?? "n/d"}%</span>
                  </div>
                  <div style={{ fontSize: 12, color: "#64748b", marginTop: 8 }}>
                    zona: {d.zone_name || "n/d"} · last seen: {toDateTime(d.last_seen_at)}
                  </div>
                  <div style={{ marginTop: 10 }}>
                    <button
                      type="button"
                      onClick={() => handleDeviceSync(d.id)}
                      disabled={syncingDeviceId === d.id}
                      style={{ borderRadius: 999, border: "1px solid #d1d5db", padding: "5px 10px", fontSize: 12, background: "white", cursor: "pointer" }}
                    >
                      {syncingDeviceId === d.id ? "Sync..." : "Simula sync"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div style={{ ...card, overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr>
                  <th style={{ textAlign: "left", borderBottom: "1px solid #e5e7eb", padding: "6px 4px" }}>Device</th>
                  <th style={{ textAlign: "left", borderBottom: "1px solid #e5e7eb", padding: "6px 4px" }}>Stato</th>
                  <th style={{ textAlign: "left", borderBottom: "1px solid #e5e7eb", padding: "6px 4px" }}>Badges</th>
                  <th style={{ textAlign: "left", borderBottom: "1px solid #e5e7eb", padding: "6px 4px" }}>Zona</th>
                  <th style={{ textAlign: "left", borderBottom: "1px solid #e5e7eb", padding: "6px 4px" }}>Last seen</th>
                  <th style={{ textAlign: "left", borderBottom: "1px solid #e5e7eb", padding: "6px 4px" }}>Azione</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((d) => {
                  const st = stateMap[d.id];
                  const online = st?.online;
                  return (
                    <tr key={d.id}>
                      <td style={{ borderBottom: "1px solid #f1f5f9", padding: "8px 4px" }}>
                        <div style={{ fontWeight: 700 }}>{d.name}</div>
                        <div style={{ fontSize: 11, color: "#64748b" }}>{d.external_id}</div>
                      </td>
                      <td style={{ borderBottom: "1px solid #f1f5f9", padding: "8px 4px" }}>
                        <span style={online === true ? pill("#dcfce7", "#166534", "#86efac") : online === false ? pill("#fee2e2", "#991b1b", "#fca5a5") : pill("#e2e8f0", "#334155", "#cbd5e1")}>
                          {online === true ? "online" : online === false ? "offline" : "unknown"}
                        </span>
                      </td>
                      <td style={{ borderBottom: "1px solid #f1f5f9", padding: "8px 4px" }}>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                          <span style={pill("#eef2ff", "#3730a3", "#c7d2fe")}>{d.provider}</span>
                          <span style={pill("#f8fafc", "#334155", "#cbd5e1")}>{d.category}</span>
                          <span style={pill("#fff7ed", "#9a3412", "#fed7aa")}>health {d.health_status}</span>
                          <span style={pill("#ecfeff", "#0e7490", "#a5f3fc")}>battery {d.battery_level ?? "n/d"}%</span>
                        </div>
                      </td>
                      <td style={{ borderBottom: "1px solid #f1f5f9", padding: "8px 4px" }}>{d.zone_name || "n/d"}</td>
                      <td style={{ borderBottom: "1px solid #f1f5f9", padding: "8px 4px" }}>{toDateTime(d.last_seen_at)}</td>
                      <td style={{ borderBottom: "1px solid #f1f5f9", padding: "8px 4px" }}>
                        <button
                          type="button"
                          onClick={() => handleDeviceSync(d.id)}
                          disabled={syncingDeviceId === d.id}
                          style={{ borderRadius: 999, border: "1px solid #d1d5db", padding: "4px 10px", fontSize: 12, background: "white", cursor: "pointer" }}
                        >
                          {syncingDeviceId === d.id ? "Sync..." : "Simula sync"}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )
      ) : null}
    </div>
  );
}

export default Devices;

