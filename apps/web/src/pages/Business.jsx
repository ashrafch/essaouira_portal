import { useEffect, useMemo, useState } from "react";
import { Download } from "lucide-react";
import {
  Bar,
  BarChart,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  downloadMonthCostLinesCsv,
  getMonthPnL,
  getMonthCostLines,
  getUnits,
} from "../services/api";
import { PageHeader, Button, StatCard, useToast } from "../components/ui";
import { formatCurrency, formatPercent } from "../utils/format";

// Booking-source tones, consistent with the Calendar legend and the Dashboard.
const SOURCE_COLORS = {
  direct: "var(--color-success)",
  airbnb: "var(--color-warning)",
  booking: "var(--color-info)",
};
const CHART_FALLBACK = [
  "var(--color-primary)",
  "var(--color-accent)",
  "var(--color-info)",
  "var(--color-warning)",
];

function pad2(n) {
  return n < 10 ? `0${n}` : String(n);
}

function formatDate(d) {
  if (!d) return "";
  return new Date(d).toLocaleDateString("it-IT");
}

function Business() {
  const toast = useToast();
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1); // 1-12

  const [pnl, setPnl] = useState(null);
  const [costLines, setCostLines] = useState([]);
  const [units, setUnits] = useState([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [exporting, setExporting] = useState(false);

  const [selectedCostCategory, setSelectedCostCategory] = useState("all");

  const unitMap = useMemo(
    () =>
      units.reduce((acc, u) => {
        acc[u.id] = u;
        return acc;
      }, {}),
    [units]
  );

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [pnlResp, costLinesResp, unitsResp] = await Promise.all([
          getMonthPnL(year, month),
          getMonthCostLines(year, month),
          getUnits(),
        ]);
        setPnl(pnlResp);
        setCostLines(costLinesResp);
        setUnits(unitsResp);
      } catch (err) {
        setError(err.message || "Errore caricando i dati business");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [year, month]);

  const monthInputValue = `${year}-${pad2(month)}`;

  const sourceChart = useMemo(() => {
    if (!pnl?.revenue_by_source) return [];
    return Object.entries(pnl.revenue_by_source)
      .map(([key, value]) => ({
        name: key === "direct" ? "Diretta" : key.charAt(0).toUpperCase() + key.slice(1),
        source: key,
        value,
      }))
      .filter((d) => d.value > 0);
  }, [pnl]);

  const unitChart = useMemo(() => {
    if (!pnl?.revenue_by_unit) return [];
    return pnl.revenue_by_unit
      .map((u) => ({ name: u.unit_name, revenue: u.revenue }))
      .filter((d) => d.revenue > 0);
  }, [pnl]);

  const visibleCostLines = useMemo(
    () =>
      costLines.filter((c) =>
        selectedCostCategory === "all" ? true : c.category === selectedCostCategory
      ),
    [costLines, selectedCostCategory]
  );

  const selectedCategoryTotal = useMemo(() => {
    if (!pnl || selectedCostCategory === "all") return null;
    const found = pnl.costs_by_category.find((c) => c.category === selectedCostCategory);
    return found ? found.total : null;
  }, [pnl, selectedCostCategory]);

  const selectedCategoryPerc = useMemo(() => {
    if (!pnl || selectedCostCategory === "all") return null;
    if (!pnl.costs_total || pnl.costs_total <= 0) return null;
    const found = pnl.costs_by_category.find((c) => c.category === selectedCostCategory);
    if (!found) return null;
    return (found.total / pnl.costs_total) * 100;
  }, [pnl, selectedCostCategory]);

  function getOriginLabel(line) {
    switch (line.origin) {
      case "manual":
        return "Manuale";
      case "booking_cleaning_fee":
        return "Booking · Cleaning fee";
      case "booking_channel_fee":
        return "Booking · Channel fee";
      case "booking_city_tax":
        return "Booking · City tax";
      case "staff_task":
        return "Staff task";
      default:
        return line.origin || "Altro";
    }
  }

  async function handleExportCsv() {
    setExporting(true);
    try {
      const blob = await downloadMonthCostLinesCsv(year, month);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `month_cost_lines_${year}_${pad2(month)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      toast.error(`Errore export CSV: ${err.message}`);
    } finally {
      setExporting(false);
    }
  }

  const card = {
    background: "var(--color-surface)",
    borderRadius: 14,
    padding: 14,
    boxShadow: "var(--shadow-sm)",
    border: "1px solid var(--color-border)",
  };
  const sectionTitle = {
    fontSize: 13,
    fontWeight: 600,
    marginBottom: 8,
    color: "var(--color-text)",
  };
  const table = { width: "100%", borderCollapse: "collapse", fontSize: 12 };
  const th = {
    textAlign: "left",
    borderBottom: "1px solid var(--color-border)",
    padding: "6px 4px",
    color: "var(--color-text-muted)",
    fontSize: 11,
  };
  const td = {
    borderBottom: "1px solid var(--color-border)",
    padding: "6px 4px",
    verticalAlign: "top",
  };
  const clickableRow = (active) => ({
    cursor: "pointer",
    backgroundColor: active ? "var(--color-primary-soft)" : "transparent",
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <PageHeader
        title="Business & Analytics"
        subtitle="Ricavi, costi e performance degli appartamenti, mese per mese."
        actions={
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <input
              type="month"
              aria-label="Mese di riferimento"
              value={monthInputValue}
              onChange={(e) => {
                const [y, m] = e.target.value.split("-").map(Number);
                setYear(y);
                setMonth(m);
              }}
              style={{ width: "auto" }}
            />
            <Button
              variant="secondary"
              size="sm"
              icon={<Download size={15} />}
              onClick={handleExportCsv}
              loading={exporting}
            >
              Export costi CSV
            </Button>
          </div>
        }
      />

      {error && <p style={{ color: "var(--color-danger)", fontSize: 12 }}>{error}</p>}

      {loading || !pnl ? (
        <p style={{ fontSize: 13, color: "var(--color-text-muted)" }}>Caricamento dati business…</p>
      ) : (
        <>
          {/* KPI */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
              gap: 12,
            }}
          >
            <StatCard
              label="Occupazione"
              value={formatPercent(pnl.occupancy_rate, { decimals: 1 })}
              hint={`${pnl.nights_occupied} notti su ${pnl.nights_total} disponibili`}
            />
            <StatCard
              label="Ricavi totali"
              value={formatCurrency(pnl.revenue_total)}
              hint={`ADR ${pnl.adr != null ? formatCurrency(pnl.adr) : "—"}`}
              tone="success"
            />
            <StatCard
              label="Costi totali"
              value={formatCurrency(pnl.costs_total)}
              hint="Booking, staff e costi manuali"
              tone="danger"
            />
            <StatCard
              label="Profitto del mese"
              value={formatCurrency(pnl.profit)}
              hint="Ricavi − Costi"
              tone={pnl.profit >= 0 ? "success" : "danger"}
            />
          </div>

          {/* CHARTS */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
              gap: 12,
            }}
          >
            <div style={card}>
              <div style={sectionTitle}>Provenienza ricavi</div>
              <div style={{ height: 240 }}>
                {sourceChart.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={sourceChart}
                        cx="50%"
                        cy="50%"
                        innerRadius={55}
                        outerRadius={85}
                        paddingAngle={4}
                        dataKey="value"
                        nameKey="name"
                      >
                        {sourceChart.map((entry, i) => (
                          <Cell
                            key={entry.source}
                            fill={SOURCE_COLORS[entry.source] || CHART_FALLBACK[i % CHART_FALLBACK.length]}
                          />
                        ))}
                      </Pie>
                      <Tooltip formatter={(v) => formatCurrency(v)} />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <EmptyChart label="Nessun ricavo nel mese" />
                )}
              </div>
            </div>

            <div style={card}>
              <div style={sectionTitle}>Ricavi per unità</div>
              <div style={{ height: 240 }}>
                {unitChart.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={unitChart} layout="vertical" margin={{ left: 20, right: 16 }}>
                      <XAxis type="number" hide />
                      <YAxis
                        type="category"
                        dataKey="name"
                        width={90}
                        tick={{ fontSize: 12, fill: "var(--color-text-muted)" }}
                      />
                      <Tooltip formatter={(v) => formatCurrency(v)} cursor={{ fill: "transparent" }} />
                      <Bar dataKey="revenue" fill="var(--color-primary)" radius={[0, 4, 4, 0]} barSize={18} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <EmptyChart label="Nessuna prenotazione nel mese" />
                )}
              </div>
            </div>
          </div>

          {/* COSTS BY CATEGORY (clickable filter) */}
          <div style={card}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 8,
                marginBottom: 6,
                flexWrap: "wrap",
              }}
            >
              <div style={sectionTitle}>Costi per categoria</div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSelectedCostCategory("all")}
                disabled={selectedCostCategory === "all"}
              >
                Mostra tutte
              </Button>
            </div>
            {pnl.costs_by_category.length === 0 ? (
              <p style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
                Nessun costo registrato nel mese selezionato.
              </p>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table className="ui-table-cards" style={table}>
                  <thead>
                    <tr>
                      <th style={th}>Categoria</th>
                      <th style={{ ...th, textAlign: "right" }}>Totale (mese)</th>
                      <th style={{ ...th, textAlign: "right" }}>% sul totale</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pnl.costs_by_category.map((c) => {
                      const active = selectedCostCategory === c.category;
                      const perc = pnl.costs_total > 0 ? (c.total / pnl.costs_total) * 100 : 0;
                      return (
                        <tr
                          key={c.category}
                          style={clickableRow(active)}
                          onClick={() => setSelectedCostCategory(active ? "all" : c.category)}
                        >
                          <td style={td} data-label="Categoria">{c.category}</td>
                          <td
                            style={{ ...td, textAlign: "right", fontWeight: active ? 600 : 400 }}
                            data-label="Totale (mese)"
                          >
                            {formatCurrency(c.total)}
                          </td>
                          <td
                            style={{
                              ...td,
                              textAlign: "right",
                              fontSize: 11,
                              color: "var(--color-text-muted)",
                            }}
                            data-label="% sul totale"
                          >
                            {perc.toFixed(1)}%
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* COST DETAIL */}
          <div style={card}>
            <div style={sectionTitle}>Dettaglio costi del mese</div>
            <p style={{ fontSize: 11, color: "var(--color-text-muted)", marginBottom: 8 }}>
              Filtro:{" "}
              <strong>
                {selectedCostCategory === "all" ? "tutte le categorie" : selectedCostCategory}
              </strong>
              {selectedCostCategory !== "all" && selectedCategoryTotal != null && (
                <>
                  {" "}· Totale <strong>{formatCurrency(selectedCategoryTotal)}</strong>
                  {selectedCategoryPerc != null && (
                    <> (<strong>{selectedCategoryPerc.toFixed(1)}%</strong> dei costi)</>
                  )}
                </>
              )}
              .
            </p>
            {visibleCostLines.length === 0 ? (
              <p style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
                Nessun costo per il filtro selezionato.
              </p>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table className="ui-table-cards" style={table}>
                  <thead>
                    <tr>
                      <th style={th}>Data</th>
                      <th style={th}>Categoria</th>
                      <th style={th}>Origine</th>
                      <th style={th}>Riferimento</th>
                      <th style={th}>Descrizione</th>
                      <th style={th}>Unità</th>
                      <th style={{ ...th, textAlign: "right" }}>Importo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleCostLines.map((c, idx) => (
                      <tr
                        key={c.id ?? `${c.origin}-${c.booking_id || ""}-${c.staff_task_id || ""}-${idx}`}
                      >
                        <td style={td} data-label="Data">{formatDate(c.date)}</td>
                        <td style={td} data-label="Categoria">{c.category}</td>
                        <td style={td} data-label="Origine">{getOriginLabel(c)}</td>
                        <td style={td} data-label="Riferimento">
                          {c.booking_id
                            ? `Booking #${c.booking_id}`
                            : c.staff_task_id
                            ? `Task #${c.staff_task_id}`
                            : "—"}
                        </td>
                        <td style={td} data-label="Descrizione">{c.description || "—"}</td>
                        <td style={td} data-label="Unità">
                          {c.unit_id ? unitMap[c.unit_id]?.name || `Unit #${c.unit_id}` : "—"}
                        </td>
                        <td style={{ ...td, textAlign: "right" }} data-label="Importo">
                          {formatCurrency(c.amount, c.currency || "EUR")}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function EmptyChart({ label }) {
  return (
    <div
      style={{
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "var(--color-text-subtle)",
        fontSize: 13,
      }}
    >
      {label}
    </div>
  );
}

export default Business;
