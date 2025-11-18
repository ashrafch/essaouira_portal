import { useEffect, useState } from "react";
import { getMonthSummary } from "../services/api";

function Dashboard() {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1); // 1-12

  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const data = await getMonthSummary(year, month);
        setSummary(data);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [year, month]);

  const pageHeader = {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-end",
    gap: 12,
    marginBottom: 20,
    flexWrap: "wrap",
  };

  const card = {
    backgroundColor: "white",
    borderRadius: "14px",
    padding: "16px 18px",
    boxShadow: "0 1px 3px rgba(15, 23, 42, 0.08)",
    border: "1px solid #e5e7eb",
  };

  const statGrid = {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
    gap: 12,
    marginBottom: 16,
  };

  const statCard = {
    background: "#f9fafb",
    borderRadius: "12px",
    padding: "10px 12px",
  };

  const sectionTitle = {
    fontSize: 14,
    fontWeight: 600,
    marginBottom: 8,
  };

  const table = {
    width: "100%",
    borderCollapse: "collapse",
    fontSize: 13,
  };

  const th = {
    textAlign: "left",
    borderBottom: "1px solid #e5e7eb",
    padding: "6px 4px",
    color: "#6b7280",
    fontSize: 12,
  };

  const td = {
    padding: "6px 4px",
    borderBottom: "1px solid #f3f4f6",
  };

  const selectStyle = {
    padding: "4px 8px",
    borderRadius: 8,
    border: "1px solid #d1d5db",
    fontSize: 13,
  };

  const monthLabel = new Date(year, month - 1, 1).toLocaleDateString("it-IT", {
    month: "long",
    year: "numeric",
  });

  return (
    <div>
      <div style={pageHeader}>
        <div>
          <h1 style={{ marginBottom: 4 }}>Dashboard</h1>
          <p style={{ fontSize: 13, color: "#6b7280" }}>
            Panoramica delle performance del B&amp;B di Essaouira.
          </p>
        </div>

        <div style={{ fontSize: 12, color: "#6b7280" }}>
          <div style={{ marginBottom: 4 }}>Periodo di analisi</div>
          <div style={{ display: "flex", gap: 8 }}>
            <select
              style={selectStyle}
              value={month}
              onChange={(e) => setMonth(Number(e.target.value))}
            >
              {Array.from({ length: 12 }, (_, i) => (
                <option key={i + 1} value={i + 1}>
                  {new Date(2000, i, 1).toLocaleDateString("it-IT", {
                    month: "long",
                  })}
                </option>
              ))}
            </select>
            <select
              style={selectStyle}
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
            >
              {Array.from({ length: 5 }, (_, i) => {
                const y = today.getFullYear() - 2 + i;
                return (
                  <option key={y} value={y}>
                    {y}
                  </option>
                );
              })}
            </select>
          </div>
        </div>
      </div>

      <div style={card}>
        {loading ? (
          <p>Caricamento dati business...</p>
        ) : error ? (
          <p style={{ color: "red", fontSize: 13 }}>{error}</p>
        ) : !summary ? (
          <p style={{ fontSize: 13, color: "#6b7280" }}>
            Nessun dato disponibile per il periodo selezionato.
          </p>
        ) : (
          <>
            <div style={{ marginBottom: 12 }}>
              <strong>{monthLabel}</strong>{" "}
              <span style={{ fontSize: 12, color: "#6b7280" }}>
                · {summary.nights_occupied} notti occupate su{" "}
                {summary.nights_total} disponibili
              </span>
            </div>

            {/* STATISTICHE PRINCIPALI */}
            <div style={statGrid}>
              <div style={statCard}>
                <div style={{ fontSize: 11, color: "#6b7280" }}>
                  Tasso di occupazione
                </div>
                <div
                  style={{
                    fontSize: 24,
                    fontWeight: 700,
                    marginTop: 2,
                    color:
                      summary.occupancy_rate >= 70
                        ? "#16a34a"
                        : summary.occupancy_rate >= 40
                        ? "#f59e0b"
                        : "#dc2626",
                  }}
                >
                  {summary.occupancy_rate}%
                </div>
                <div style={{ fontSize: 11, color: "#9ca3af" }}>
                  Obiettivo tipico: 60–70% in stagione
                </div>
              </div>

              <div style={statCard}>
                <div style={{ fontSize: 11, color: "#6b7280" }}>
                  Entrate totali
                </div>
                <div
                  style={{
                    fontSize: 24,
                    fontWeight: 700,
                    marginTop: 2,
                  }}
                >
                  € {summary.revenue_total.toFixed(2)}
                </div>
                <div style={{ fontSize: 11, color: "#9ca3af" }}>
                  Include solo le prenotazioni con prezzo stimato o inserito
                </div>
              </div>

              <div style={statCard}>
                <div style={{ fontSize: 11, color: "#6b7280" }}>
                  ADR (Average Daily Rate)
                </div>
                <div
                  style={{
                    fontSize: 24,
                    fontWeight: 700,
                    marginTop: 2,
                  }}
                >
                  {summary.adr != null ? `€ ${summary.adr.toFixed(2)}` : "—"}
                </div>
                <div style={{ fontSize: 11, color: "#9ca3af" }}>
                  Ricavo medio per notte venduta
                </div>
              </div>
            </div>

            {/* ENTRATE PER FONTE */}
            <div style={{ marginTop: 12, marginBottom: 16 }}>
              <div style={sectionTitle}>Entrate per canale</div>
              {Object.keys(summary.revenue_by_source).length === 0 ? (
                <p style={{ fontSize: 12, color: "#6b7280" }}>
                  Nessuna entrata registrata per questo periodo.
                </p>
              ) : (
                <table style={table}>
                  <thead>
                    <tr>
                      <th style={th}>Canale</th>
                      <th style={th}>Entrate</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(summary.revenue_by_source).map(
                      ([src, val]) => (
                        <tr key={src}>
                          <td style={td}>
                            {src === "direct"
                              ? "Diretta"
                              : src === "airbnb"
                              ? "Airbnb"
                              : src === "booking"
                              ? "Booking.com"
                              : src}
                          </td>
                          <td style={td}>€ {val.toFixed(2)}</td>
                        </tr>
                      )
                    )}
                  </tbody>
                </table>
              )}
            </div>

            {/* ENTRATE PER APPARTAMENTO */}
            <div>
              <div style={sectionTitle}>Performance per appartamento</div>
              {summary.revenue_by_unit.length === 0 ? (
                <p style={{ fontSize: 12, color: "#6b7280" }}>
                  Nessuna prenotazione per questo mese.
                </p>
              ) : (
                <table style={table}>
                  <thead>
                    <tr>
                      <th style={th}>Unità</th>
                      <th style={th}>Notti occupate</th>
                      <th style={th}>Entrate</th>
                      <th style={th}>ADR</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary.revenue_by_unit.map((u) => (
                      <tr key={u.unit_id}>
                        <td style={td}>{u.unit_name}</td>
                        <td style={td}>{u.nights_occupied}</td>
                        <td style={td}>€ {u.revenue.toFixed(2)}</td>
                        <td style={td}>
                          {u.nights_occupied > 0
                            ? `€ ${(u.revenue / u.nights_occupied).toFixed(2)}`
                            : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default Dashboard;
