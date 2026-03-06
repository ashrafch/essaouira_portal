import { useCallback, useEffect, useMemo, useState } from "react";
import PageInfoHelp from "../components/PageInfoHelp";
import useIsMobile from "../hooks/useIsMobile";
import { acknowledgeSmartAlert, getSmartAlerts } from "../services/api";

function chip(bg, color, border) {
  return {
    display: "inline-flex",
    alignItems: "center",
    borderRadius: 999,
    padding: "3px 8px",
    fontSize: 11,
    fontWeight: 600,
    background: bg,
    color,
    border: `1px solid ${border}`,
  };
}

function severityChip(severity) {
  if (severity === "critical") return chip("#fee2e2", "#991b1b", "#fca5a5");
  if (severity === "warning") return chip("#fff7ed", "#9a3412", "#fed7aa");
  return chip("#e2e8f0", "#334155", "#cbd5e1");
}

function statusChip(status) {
  if (status === "open") return chip("#fee2e2", "#991b1b", "#fca5a5");
  if (status === "acknowledged") return chip("#fef9c3", "#854d0e", "#fde68a");
  return chip("#dcfce7", "#166534", "#86efac");
}

function Alerts() {
  const isMobile = useIsMobile(900);
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [savingId, setSavingId] = useState(null);
  const [statusFilter, setStatusFilter] = useState("all");
  const [severityFilter, setSeverityFilter] = useState("all");
  const [query, setQuery] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await getSmartAlerts(statusFilter === "all" ? {} : { status: statusFilter });
      setAlerts(data || []);
    } catch (err) {
      setError(err.message || "Errore caricando smart alerts");
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    return alerts.filter((a) => {
      if (severityFilter !== "all" && a.severity !== severityFilter) return false;
      if (query.trim()) {
        const q = query.trim().toLowerCase();
        const hay = `${a.title} ${a.alert_type} ${a.description || ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [alerts, severityFilter, query]);

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

  const openCount = filtered.filter((a) => a.status === "open").length;
  const criticalCount = filtered.filter((a) => a.severity === "critical").length;

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ margin: 0 }}>Smart Alerts</h1>
          <p style={{ margin: "4px 0 0", fontSize: 13, color: "#64748b" }}>
            Lista alert tecnici per monitoraggio smart building.
          </p>
        </div>
        <PageInfoHelp title="Come usare Smart Alerts">
          <p>Filtra per stato e severita per priorizzare le azioni operative.</p>
          <p>Gli alert open possono essere messi in acknowledged direttamente da questa pagina.</p>
        </PageInfoHelp>
      </div>

      <div style={card}>
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(3, minmax(140px, 1fr))", gap: 10 }}>
          <div>
            <div style={{ fontSize: 11, color: "#64748b", textTransform: "uppercase" }}>Alert filtrati</div>
            <div style={{ fontSize: 24, fontWeight: 700 }}>{filtered.length}</div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: "#64748b", textTransform: "uppercase" }}>Open</div>
            <div style={{ fontSize: 24, fontWeight: 700, color: "#b91c1c" }}>{openCount}</div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: "#64748b", textTransform: "uppercase" }}>Critical</div>
            <div style={{ fontSize: 24, fontWeight: 700, color: "#b45309" }}>{criticalCount}</div>
          </div>
        </div>
      </div>

      <div style={card}>
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1.3fr 1fr 1fr auto", gap: 8, alignItems: "end" }}>
          <div>
            <label style={{ fontSize: 12, color: "#64748b" }}>Cerca</label>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Titolo, tipo, descrizione"
              style={{ width: "100%", borderRadius: 8, border: "1px solid #d1d5db", padding: "6px 8px", fontSize: 13 }}
            />
          </div>
          <div>
            <label style={{ fontSize: 12, color: "#64748b" }}>Stato</label>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={{ width: "100%", borderRadius: 8, border: "1px solid #d1d5db", padding: "6px 8px", fontSize: 13 }}>
              <option value="all">Tutti</option>
              <option value="open">Open</option>
              <option value="acknowledged">Acknowledged</option>
              <option value="resolved">Resolved</option>
            </select>
          </div>
          <div>
            <label style={{ fontSize: 12, color: "#64748b" }}>Severita</label>
            <select value={severityFilter} onChange={(e) => setSeverityFilter(e.target.value)} style={{ width: "100%", borderRadius: 8, border: "1px solid #d1d5db", padding: "6px 8px", fontSize: 13 }}>
              <option value="all">Tutte</option>
              <option value="critical">Critical</option>
              <option value="warning">Warning</option>
              <option value="info">Info</option>
            </select>
          </div>
          <button
            type="button"
            onClick={load}
            style={{ borderRadius: 999, border: "1px solid #d1d5db", padding: "7px 12px", fontSize: 12, background: "white", cursor: "pointer" }}
          >
            Aggiorna
          </button>
        </div>
      </div>

      {loading ? <div style={card}>Caricamento smart alerts...</div> : null}
      {error ? <div style={{ ...card, color: "#b91c1c" }}>{error}</div> : null}

      {!loading && !error && filtered.length === 0 ? (
        <div style={card}>Nessun alert trovato con i filtri selezionati.</div>
      ) : null}

      {!loading && !error && filtered.length > 0 ? (
        <div style={{ display: "grid", gap: 10 }}>
          {filtered.map((a) => (
            <div key={a.id} style={card}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                <div style={{ minWidth: 240 }}>
                  <div style={{ fontWeight: 700 }}>{a.title}</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 6 }}>
                    <span style={chip("#eef2ff", "#3730a3", "#c7d2fe")}>{a.alert_type}</span>
                    <span style={severityChip(a.severity)}>{a.severity}</span>
                    <span style={statusChip(a.status)}>{a.status}</span>
                  </div>
                  {a.description ? (
                    <div style={{ fontSize: 12, color: "#334155", marginTop: 8 }}>{a.description}</div>
                  ) : null}
                  <div style={{ fontSize: 11, color: "#64748b", marginTop: 8 }}>
                    first seen: {a.first_seen_at ? new Date(a.first_seen_at).toLocaleString("it-IT") : "n/d"} · last seen: {a.last_seen_at ? new Date(a.last_seen_at).toLocaleString("it-IT") : "n/d"}
                  </div>
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
      ) : null}
    </div>
  );
}

export default Alerts;
