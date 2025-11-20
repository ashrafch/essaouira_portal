import { useEffect, useState, useMemo } from "react";
import { getMonthPnlSummary } from "../services/api";

function Business() {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1);

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await getMonthPnlSummary(year, month);
        setData(res);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [year, month]);

  const monthLabel = useMemo(() => {
    const d = new Date(year, month - 1, 1);
    return d.toLocaleDateString("it-IT", { month: "long", year: "numeric" });
  }, [year, month]);

  // ---- DERIVED / INSIGHTS ----
  const derived = useMemo(() => {
    if (!data) {
      return {
        profitMargin: null,
        mainChannel: null,
        mainChannelShare: null,
        bestUnit: null,
        bestUnitRevenue: null,
        topCostCategory: null,
      };
    }

    const profitMargin =
      data.revenue_total > 0 ? (data.profit / data.revenue_total) * 100 : null;

    let mainChannel = null;
    let mainChannelShare = null;
    if (data.revenue_by_source && Object.keys(data.revenue_by_source).length) {
      const entries = Object.entries(data.revenue_by_source);
      entries.sort((a, b) => b[1] - a[1]);
      const [topSource, topValue] = entries[0];
      mainChannel = topSource;
      mainChannelShare =
        data.revenue_total > 0 ? (topValue / data.revenue_total) * 100 : null;
    }

    let bestUnit = null;
    let bestUnitRevenue = null;
    if (data.revenue_by_unit && data.revenue_by_unit.length > 0) {
      const sorted = [...data.revenue_by_unit].sort(
        (a, b) => b.revenue - a.revenue
      );
      bestUnit = sorted[0].unit_name;
      bestUnitRevenue = sorted[0].revenue;
    }

    let topCostCategory = null;
    if (data.costs_by_category && data.costs_by_category.length > 0) {
      const sorted = [...data.costs_by_category].sort(
        (a, b) => b.total - a.total
      );
      topCostCategory = sorted[0];
    }

    return {
      profitMargin,
      mainChannel,
      mainChannelShare,
      bestUnit,
      bestUnitRevenue,
      topCostCategory,
    };
  }, [data]);

  const layoutHeader = {
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

  const select = {
    borderRadius: 999,
    border: "1px solid #d1d5db",
    padding: "6px 10px",
    fontSize: 13,
    backgroundColor: "white",
  };

  const kpiGrid = {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
    gap: 12,
    marginBottom: 16,
  };

  const kpiCard = {
    background: "#f9fafb",
    borderRadius: "12px",
    padding: "10px 12px",
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
    verticalAlign: "middle",
  };

  const pill = {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: "4px 10px",
    borderRadius: 999,
    fontSize: 11,
    border: "1px solid #e5e7eb",
    backgroundColor: "#f9fafb",
    color: "#374151",
  };

  const pillDot = (color) => ({
    width: 8,
    height: 8,
    borderRadius: 999,
    backgroundColor: color,
  });

  const miniBarContainer = {
    position: "relative",
    width: "100%",
    height: 7,
    borderRadius: 999,
    backgroundColor: "#f3f4f6",
    overflow: "hidden",
  };

  const miniBar = (ratio, color) => ({
    position: "absolute",
    inset: 0,
    width: `${Math.max(5, Math.min(100, ratio * 100))}%`,
    borderRadius: 999,
    backgroundColor: color,
  });

  const revenueBySourceArray = useMemo(() => {
    if (!data?.revenue_by_source) return [];
    return Object.entries(data.revenue_by_source).map(([src, val]) => ({
      source: src,
      amount: val,
    }));
  }, [data]);

  const monthOptions = Array.from({ length: 12 }).map((_, i) => ({
    value: i + 1,
    label: new Date(2024, i, 1).toLocaleDateString("it-IT", {
      month: "short",
    }),
  }));

  const yearOptions = [];
  for (let y = today.getFullYear() - 2; y <= today.getFullYear() + 2; y++) {
    yearOptions.push(y);
  }

  // max per mini-bar
  const maxRevenueUnit =
    data?.revenue_by_unit && data.revenue_by_unit.length > 0
      ? Math.max(...data.revenue_by_unit.map((u) => u.revenue))
      : 0;

  const maxCostCategory =
    data?.costs_by_category && data.costs_by_category.length > 0
      ? Math.max(...data.costs_by_category.map((c) => c.total))
      : 0;

  const maxRevenueChannel =
    revenueBySourceArray.length > 0
      ? Math.max(...revenueBySourceArray.map((r) => r.amount))
      : 0;

  return (
    <div>
      <div style={layoutHeader}>
        <div>
          <h1 style={{ marginBottom: 4 }}>Business & Finanze</h1>
          <p style={{ fontSize: 13, color: "#6b7280" }}>
            Pannello P&amp;L mensile: ricavi, costi, profitto e performance per
            appartamento.
          </p>
        </div>

        <div
          style={{
            display: "flex",
            gap: 8,
            alignItems: "center",
            fontSize: 13,
          }}
        >
          <span style={{ color: "#6b7280", fontSize: 12 }}>Periodo</span>
          <select
            style={select}
            value={month}
            onChange={(e) => setMonth(Number(e.target.value))}
          >
            {monthOptions.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
          <select
            style={select}
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
          >
            {yearOptions.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </div>
      </div>

      {error && (
        <p style={{ color: "red", fontSize: 12, marginBottom: 8 }}>{error}</p>
      )}

      {loading || !data ? (
        <p>Caricamento dati business...</p>
      ) : (
        <>
          {/* KPI principali */}
          <div style={kpiGrid}>
            <div style={kpiCard}>
              <div style={{ fontSize: 11, color: "#6b7280" }}>
                Periodo selezionato
              </div>
              <div style={{ fontSize: 18, fontWeight: 700, marginTop: 2 }}>
                {monthLabel}
              </div>
              <div style={{ fontSize: 11, color: "#9ca3af" }}>
                Notti disponibili: {data.nights_total} · Occupate:{" "}
                {data.nights_occupied}
              </div>
            </div>

            <div style={kpiCard}>
              <div style={{ fontSize: 11, color: "#6b7280" }}>
                Ricavi totali
              </div>
              <div style={{ fontSize: 20, fontWeight: 700, marginTop: 2 }}>
                € {data.revenue_total.toFixed(2)}
              </div>
              <div style={{ fontSize: 11, color: "#9ca3af" }}>
                ADR:{" "}
                {data.adr != null ? `€ ${data.adr.toFixed(2)}` : "n/d"}
              </div>
            </div>

            <div style={kpiCard}>
              <div style={{ fontSize: 11, color: "#6b7280" }}>
                Costi totali
              </div>
              <div style={{ fontSize: 20, fontWeight: 700, marginTop: 2 }}>
                € {data.costs_total.toFixed(2)}
              </div>
              <div style={{ fontSize: 11, color: "#9ca3af" }}>
                Somma di tutte le voci costi del mese
              </div>
            </div>

            <div style={kpiCard}>
              <div style={{ fontSize: 11, color: "#6b7280" }}>
                Margine (profitto)
              </div>
              <div
                style={{
                  fontSize: 20,
                  fontWeight: 700,
                  marginTop: 2,
                  color: data.profit >= 0 ? "#15803d" : "#b91c1c",
                }}
              >
                € {data.profit.toFixed(2)}
              </div>
              <div style={{ fontSize: 11, color: "#9ca3af" }}>
                Ricavi - Costi nel periodo
              </div>
            </div>

            <div style={kpiCard}>
              <div style={{ fontSize: 11, color: "#6b7280" }}>
                Occupazione media
              </div>
              <div style={{ fontSize: 20, fontWeight: 700, marginTop: 2 }}>
                {data.occupancy_rate.toFixed(2)}%
              </div>
              <div style={{ fontSize: 11, color: "#9ca3af" }}>
                Calcolata su tutte le unità
              </div>
            </div>

            <div style={kpiCard}>
              <div style={{ fontSize: 11, color: "#6b7280" }}>
                Profit margin
              </div>
              <div style={{ fontSize: 20, fontWeight: 700, marginTop: 2 }}>
                {derived.profitMargin != null
                  ? `${derived.profitMargin.toFixed(1)}%`
                  : "n/d"}
              </div>
              <div style={{ fontSize: 11, color: "#9ca3af" }}>
                Profitto / Ricavi
              </div>
            </div>
          </div>

          {/* Insight strip */}
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 8,
              marginBottom: 14,
            }}
          >
            <span style={pill}>
              <span style={pillDot(data.profit >= 0 ? "#22c55e" : "#ef4444")} />
              {data.profit > 0
                ? "Mese in utile"
                : data.profit < 0
                ? "Mese in perdita"
                : "Break-even"}
            </span>

            {derived.mainChannel && (
              <span style={pill}>
                <span style={pillDot("#3b82f6")} />
                Canale principale: <strong>{derived.mainChannel}</strong>
                {derived.mainChannelShare != null &&
                  ` · ${derived.mainChannelShare.toFixed(1)}% dei ricavi`}
              </span>
            )}

            {derived.bestUnit && (
              <span style={pill}>
                <span style={pillDot("#22c55e")} />
                Miglior appartamento:{" "}
                <strong>{derived.bestUnit}</strong> · €
                {derived.bestUnitRevenue.toFixed(2)}
              </span>
            )}

            {derived.topCostCategory && (
              <span style={pill}>
                <span style={pillDot("#f97316")} />
                Costo principale:{" "}
                <strong>{derived.topCostCategory.category}</strong> · €
                {derived.topCostCategory.total.toFixed(2)}
              </span>
            )}
          </div>

          {/* Layout 2 colonne: Ricavi vs Costi */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "minmax(260px, 1.5fr) minmax(260px, 1fr)",
              gap: 16,
              alignItems: "flex-start",
            }}
          >
            {/* Ricavi per unità */}
            <div style={card}>
              <h2 style={{ fontSize: 14, marginBottom: 8 }}>
                Ricavi per appartamento
              </h2>
              {(!data.revenue_by_unit ||
                data.revenue_by_unit.length === 0) ? (
                <p style={{ fontSize: 13, color: "#6b7280" }}>
                  Nessun ricavo per questo mese.
                </p>
              ) : (
                <div style={{ overflowX: "auto" }}>
                  <table style={table}>
                    <thead>
                      <tr>
                        <th style={th}>Unità</th>
                        <th style={th}>Notti occupate</th>
                        <th style={th}>Ricavo</th>
                        <th style={th}>RevPAR approx</th>
                        <th style={th}>Peso</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.revenue_by_unit.map((u) => {
                        const revPar =
                          u.nights_occupied > 0
                            ? u.revenue / u.nights_occupied
                            : 0;
                        const ratio =
                          maxRevenueUnit > 0
                            ? u.revenue / maxRevenueUnit
                            : 0;
                        return (
                          <tr key={u.unit_id}>
                            <td style={td}>{u.unit_name}</td>
                            <td style={td}>{u.nights_occupied}</td>
                            <td style={td}>€ {u.revenue.toFixed(2)}</td>
                            <td style={td}>€ {revPar.toFixed(2)}</td>
                            <td style={td}>
                              <div style={miniBarContainer}>
                                <div
                                  style={miniBar(
                                    ratio,
                                    "#22c55e"
                                  )}
                                />
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Costi + ricavi per canale */}
            <div style={card}>
              <h2 style={{ fontSize: 14, marginBottom: 8 }}>
                Costi per categoria
              </h2>
              {(!data.costs_by_category ||
                data.costs_by_category.length === 0) ? (
                <p style={{ fontSize: 13, color: "#6b7280" }}>
                  Nessun costo registrato per questo mese.
                </p>
              ) : (
                <table style={table}>
                  <thead>
                    <tr>
                      <th style={th}>Categoria</th>
                      <th style={th}>Totale</th>
                      <th style={th}>Peso</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.costs_by_category.map((c) => {
                      const ratio =
                        maxCostCategory > 0 ? c.total / maxCostCategory : 0;
                      return (
                        <tr key={c.category}>
                          <td style={td}>{c.category}</td>
                          <td style={td}>€ {c.total.toFixed(2)}</td>
                          <td style={td}>
                            <div style={miniBarContainer}>
                              <div
                                style={miniBar(
                                  ratio,
                                  "#f97316"
                                )}
                              />
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}

              <div
                style={{
                  marginTop: 14,
                  borderTop: "1px dashed #e5e7eb",
                  paddingTop: 10,
                }}
              >
                <h3 style={{ fontSize: 13, marginBottom: 4 }}>
                  Ricavi per canale
                </h3>
                {revenueBySourceArray.length === 0 ? (
                  <p style={{ fontSize: 12, color: "#6b7280" }}>
                    Nessun dato per canale sorgente.
                  </p>
                ) : (
                  <table style={table}>
                    <thead>
                      <tr>
                        <th style={th}>Canale</th>
                        <th style={th}>Ricavo</th>
                        <th style={th}>Peso</th>
                      </tr>
                    </thead>
                    <tbody>
                      {revenueBySourceArray.map((r) => {
                        const ratio =
                          maxRevenueChannel > 0
                            ? r.amount / maxRevenueChannel
                            : 0;
                        return (
                          <tr key={r.source}>
                            <td style={td}>{r.source}</td>
                            <td style={td}>€ {r.amount.toFixed(2)}</td>
                            <td style={td}>
                              <div style={miniBarContainer}>
                                <div
                                  style={miniBar(
                                    ratio,
                                    "#3b82f6"
                                  )}
                                />
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default Business;
