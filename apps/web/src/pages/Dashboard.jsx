import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import {
  getMonthPnL,
  getStaffTasks,
  getBookings,
  getAdvancedKpis,
  getTodayAlerts,
  getDashboardSummary,
  ownerMonthlyReportCsvUrl,
} from "../services/api";
import { formatCurrency } from "../utils/format";

// Theme-aware chart palette (CSS design tokens, not hardcoded hex).
// Booking sources reuse the same tones as the Calendar legend for consistency.
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

function Dashboard() {
  const navigate = useNavigate();
  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);

  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1);

  const [pnl, setPnl] = useState(null);
  const [todaysTasks, setTodaysTasks] = useState([]);
  const [todaysArrivals, setTodaysArrivals] = useState([]);
  const [advancedKpis, setAdvancedKpis] = useState(null);
  const [alerts, setAlerts] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    async function loadAll() {
      setLoading(true);
      setError(null);
      try {
        // Carichiamo in parallelo: Analisi Finanziaria, Task di oggi, Prenotazioni,
        // e il riepilogo operativo unificato (PMS + Smart).
        const [pnlData, tasksData, bookingsData, advancedData, alertsData, summaryData] = await Promise.all([
          getMonthPnL(year, month),
          getStaffTasks({ date: todayStr }),
          getBookings(),
          getAdvancedKpis(year, month),
          getTodayAlerts(),
          getDashboardSummary().catch(() => null),
        ]);

        setPnl(pnlData);
        setTodaysTasks(tasksData || []);
        setAdvancedKpis(advancedData);
        setAlerts(alertsData || []);
        setSummary(summaryData);

        // Filtra arrivi di oggi lato client
        const arrivals = (bookingsData || []).filter(
          (b) => b.checkin_date === todayStr
        );
        setTodaysArrivals(arrivals);
      } catch (err) {
        console.error(err);
        setError("Errore nel caricamento della dashboard.");
      } finally {
        setLoading(false);
      }
    }
    loadAll();
  }, [year, month, todayStr]);

  // --- PREPARAZIONE DATI GRAFICI ---

  // 1. Fonti di Prenotazione (Pie Chart)
  const sourceData = useMemo(() => {
    if (!pnl?.revenue_by_source) return [];
    return Object.entries(pnl.revenue_by_source).map(([key, value]) => ({
      name: key === "direct" ? "Diretta" : key.charAt(0).toUpperCase() + key.slice(1),
      source: key,
      value: value,
    })).filter(item => item.value > 0);
  }, [pnl]);

  // 2. Costi per Categoria (Bar Chart)
  const costData = useMemo(() => {
    if (!pnl?.costs_by_category) return [];
    // Prendi le top 5 categorie di costo
    return pnl.costs_by_category
      .slice(0, 5)
      .map((c) => ({
        name: c.category.length > 15 ? c.category.slice(0, 12) + "..." : c.category,
        Importo: c.total,
      }));
  }, [pnl]);

  // --- KPI OPERATIVI ---
  const tasksCompleted = todaysTasks.filter(t => t.status === 'done').length;
  const tasksTotal = todaysTasks.length;
  const taskProgress = tasksTotal > 0 ? Math.round((tasksCompleted / tasksTotal) * 100) : 0;

  // --- STILI ---
  const pageStyle = { display: "flex", flexDirection: "column", gap: "24px" };
  
  const headerStyle = { display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "16px" };
  
  const gridKPI = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "16px" };
  
  const kpiCard = (borderLeftColor) => ({
    backgroundColor: "var(--color-surface)",
    borderRadius: "12px",
    padding: "20px",
    boxShadow: "var(--shadow-sm)",
    border: "1px solid var(--color-border)",
    borderLeft: `5px solid ${borderLeftColor}`,
    display: "flex", flexDirection: "column", justifyContent: "space-between"
  });

  const gridCharts = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(400px, 1fr))", gap: "24px" };
  
  const chartCard = {
    backgroundColor: "var(--color-surface)", borderRadius: "16px", padding: "24px",
    boxShadow: "var(--shadow-sm)", border: "1px solid var(--color-border)",
    minHeight: "350px", display: "flex", flexDirection: "column"
  };

  const operationCard = {
    backgroundColor: "var(--color-surface)", borderRadius: "16px", padding: "24px",
    border: "1px solid var(--color-border)", flex: 1
  };

  const selectStyle = {
    padding: "8px 12px", borderRadius: "8px", border: "1px solid var(--color-border-strong)",
    fontSize: "14px", cursor: "pointer", backgroundColor: "var(--color-surface)"
  };

  if (loading) return <div style={{ padding: 20 }}>Caricamento Dashboard...</div>;
  if (error) return <div style={{ padding: 20, color: "var(--color-danger)" }}>{error}</div>;

  return (
    <div style={pageStyle}>
      
      {/* HEADER */}
      <div style={headerStyle}>
        <div>
          <h1 style={{ margin: 0, fontSize: "24px", fontWeight: "700", color: "var(--color-text)" }}>
            Dashboard
          </h1>
          <p style={{ margin: "4px 0 0", color: "var(--color-text-muted)", fontSize: "14px" }}>
            Panoramica di {new Date(year, month - 1).toLocaleDateString("it-IT", { month: 'long', year: 'numeric' })}
          </p>
        </div>
        
        <div style={{ display: "flex", gap: "12px" }}>
          <select style={selectStyle} value={month} onChange={(e) => setMonth(Number(e.target.value))}>
            {Array.from({ length: 12 }, (_, i) => (
              <option key={i + 1} value={i + 1}>
                {new Date(2000, i, 1).toLocaleDateString("it-IT", { month: "long" })}
              </option>
            ))}
          </select>
          <select style={selectStyle} value={year} onChange={(e) => setYear(Number(e.target.value))}>
            {[2024, 2025, 2026].map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <a
            href={ownerMonthlyReportCsvUrl(year, month)}
            style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              padding: "8px 14px", borderRadius: "8px", fontSize: "14px", fontWeight: 600,
              textDecoration: "none", cursor: "pointer",
              background: "var(--color-primary)", color: "var(--color-on-primary)",
            }}
          >
            Scarica report
          </a>
        </div>
      </div>

      {/* FASCIA OPERATIVA OGGI — ponte tra PMS/Ops e Smart, tessere cliccabili */}
      <div style={gridKPI}>
        {[
          { label: "Arrivi oggi", value: summary?.arrivals_today ?? todaysArrivals.length, to: "/operations", tone: "var(--color-info)" },
          { label: "Partenze oggi", value: summary?.departures_today ?? 0, to: "/operations", tone: "var(--color-info)" },
          { label: "In casa", value: summary?.in_house ?? 0, to: "/bookings", tone: "var(--color-primary)" },
          { label: "Task staff oggi", value: summary?.staff_tasks_today ?? tasksTotal, to: "/staff-planner", tone: "var(--color-primary)" },
          { label: "Manutenzioni aperte", value: summary?.maintenance_open ?? 0, to: "/maintenance", tone: (summary?.maintenance_open ?? 0) > 0 ? "var(--color-danger)" : "var(--color-border-strong)" },
          { label: "Alert smart aperti", value: summary?.smart?.alerts_open ?? 0, to: "/smart-alerts", tone: (summary?.smart?.alerts_open ?? 0) > 0 ? "var(--color-warning)" : "var(--color-border-strong)" },
          { label: "Unità da attenzionare", value: summary?.smart?.units_needing_attention ?? 0, to: "/smart-operations", tone: (summary?.smart?.units_needing_attention ?? 0) > 0 ? "var(--color-warning)" : "var(--color-border-strong)" },
          { label: "Dispositivi online", value: summary?.smart ? `${summary.smart.devices_online}/${summary.smart.devices_total}` : "—", to: "/smart-devices", tone: "var(--color-accent, var(--color-primary))" },
        ].map((tile) => (
          <button
            key={tile.label}
            type="button"
            onClick={() => navigate(tile.to)}
            style={{
              ...kpiCard(tile.tone),
              textAlign: "left", cursor: "pointer", font: "inherit", width: "100%",
            }}
          >
            <div style={{ fontSize: "12px", fontWeight: 600, color: "var(--color-text-muted)", textTransform: "uppercase", letterSpacing: "0.03em" }}>
              {tile.label}
            </div>
            <div className="tabular-nums" style={{ fontSize: "26px", fontWeight: 700, color: "var(--color-text)", marginTop: "8px" }}>
              {tile.value}
            </div>
          </button>
        ))}
      </div>

      <div style={gridKPI}>
        <div style={kpiCard("var(--color-info)")}>
          <div style={{ fontSize: "12px", fontWeight: "600", color: "var(--color-text-muted)", textTransform: "uppercase" }}>RevPAR</div>
          <div style={{ fontSize: "24px", fontWeight: "700", color: "var(--color-text)", marginTop: "8px" }}>
            {formatCurrency(advancedKpis?.revpar)}
          </div>
        </div>
        <div style={kpiCard("var(--color-info)")}>
          <div style={{ fontSize: "12px", fontWeight: "600", color: "var(--color-text-muted)", textTransform: "uppercase" }}>Share Direct</div>
          <div style={{ fontSize: "24px", fontWeight: "700", color: "var(--color-text)", marginTop: "8px" }}>
            {advancedKpis?.direct_share_percent ?? 0}%
          </div>
        </div>
        <div style={kpiCard("var(--color-info)")}>
          <div style={{ fontSize: "12px", fontWeight: "600", color: "var(--color-text-muted)", textTransform: "uppercase" }}>Pipeline 30g</div>
          <div style={{ fontSize: "24px", fontWeight: "700", color: "var(--color-text)", marginTop: "8px" }}>
            {formatCurrency(advancedKpis?.pipeline_revenue_next_30_days)}
          </div>
        </div>
        <div style={kpiCard("var(--color-warning)")}>
          <div style={{ fontSize: "12px", fontWeight: "600", color: "var(--color-text-muted)", textTransform: "uppercase" }}>Alert operativi</div>
          <div style={{ marginTop: "8px", fontSize: 13, color: "var(--color-text)" }}>
            {alerts.length === 0
              ? "Nessun alert attivo"
              : `${alerts.length} alert da verificare`}
          </div>
        </div>
      </div>

      {alerts.length > 0 && (
        <div style={{ ...chartCard, minHeight: "auto" }}>
          <h3 style={{ fontSize: "16px", fontWeight: 600, marginBottom: 12, color: "var(--color-text)" }}>
            Alert Oggi
          </h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {alerts.map((alert) => (
              <div key={alert.code} style={{ border: "1px solid var(--color-border)", borderRadius: 10, padding: 10, background: "var(--color-surface)" }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{alert.title} ({alert.count})</div>
                <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>{alert.details}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 1. KPI FINANZIARI */}
      <div style={gridKPI}>
        <div style={kpiCard("var(--color-primary)")}>
          <div style={{ fontSize: "12px", fontWeight: "600", color: "var(--color-text-muted)", textTransform: "uppercase" }}>Ricavi Totali</div>
          <div style={{ fontSize: "28px", fontWeight: "700", color: "var(--color-text)", marginTop: "8px" }}>
            {formatCurrency(pnl?.revenue_total)}
          </div>
        </div>
        <div style={kpiCard("var(--color-danger)")}>
          <div style={{ fontSize: "12px", fontWeight: "600", color: "var(--color-text-muted)", textTransform: "uppercase" }}>Costi Totali</div>
          <div style={{ fontSize: "28px", fontWeight: "700", color: "var(--color-text)", marginTop: "8px" }}>
            {formatCurrency(pnl?.costs_total)}
          </div>
        </div>
        <div style={kpiCard(pnl?.profit >= 0 ? "var(--color-success)" : "var(--color-danger)")}>
          <div style={{ fontSize: "12px", fontWeight: "600", color: "var(--color-text-muted)", textTransform: "uppercase" }}>Profitto Netto</div>
          <div style={{ fontSize: "28px", fontWeight: "700", color: pnl?.profit >= 0 ? "var(--color-success)" : "var(--color-danger)", marginTop: "8px" }}>
            {formatCurrency(pnl?.profit)}
          </div>
        </div>
        <div style={kpiCard("var(--color-warning)")}>
          <div style={{ fontSize: "12px", fontWeight: "600", color: "var(--color-text-muted)", textTransform: "uppercase" }}>Occupazione & ADR</div>
          <div style={{ display: "flex", alignItems: "baseline", gap: "8px", marginTop: "8px" }}>
             <span style={{ fontSize: "28px", fontWeight: "700", color: "var(--color-text)" }}>{pnl?.occupancy_rate.toFixed(0)}%</span>
             <span style={{ fontSize: "14px", color: "var(--color-text-muted)" }}>
               ({formatCurrency(pnl?.adr)}/notte)
             </span>
          </div>
        </div>
      </div>

      {/* 2. GRAFICI */}
      <div style={gridCharts}>
        {/* Grafico a Torta: Fonti */}
        <div style={chartCard}>
          <h3 style={{ fontSize: "16px", fontWeight: "600", marginBottom: "20px", color: "var(--color-text)" }}>
            Provenienza Ricavi
          </h3>
          <div style={{ flex: 1, minHeight: "250px" }}>
            {sourceData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={sourceData}
                    cx="50%" cy="50%"
                    innerRadius={60} outerRadius={90}
                    paddingAngle={5}
                    dataKey="value"
                  >
                    {sourceData.map((entry, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={SOURCE_COLORS[entry.source] || CHART_FALLBACK[index % CHART_FALLBACK.length]}
                      />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value) => formatCurrency(value)} />
                  <Legend verticalAlign="bottom" height={36}/>
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div style={{ display: "flex", height: "100%", alignItems: "center", justifyContent: "center", color: "var(--color-text-subtle)" }}>Nessun dato</div>
            )}
          </div>
        </div>

        {/* Grafico a Barre: Costi */}
        <div style={chartCard}>
          <h3 style={{ fontSize: "16px", fontWeight: "600", marginBottom: "20px", color: "var(--color-text)" }}>
            Top 5 Categorie di Spesa
          </h3>
          <div style={{ flex: 1, minHeight: "250px" }}>
            {costData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={costData} layout="vertical" margin={{ top: 5, right: 30, left: 40, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                  <XAxis type="number" hide />
                  <YAxis type="category" dataKey="name" width={100} tick={{fontSize: 12}} />
                  <Tooltip cursor={{fill: 'transparent'}} formatter={(value) => formatCurrency(value)} />
                  <Bar dataKey="Importo" fill="var(--color-danger)" radius={[0, 4, 4, 0]} barSize={20} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div style={{ display: "flex", height: "100%", alignItems: "center", justifyContent: "center", color: "var(--color-text-subtle)" }}>Nessun costo</div>
            )}
          </div>
        </div>
      </div>

      {/* 3. SEZIONE OPERATIVA OGGI */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: "24px" }}>
        
        {/* Arrivi di Oggi */}
        <div style={operationCard}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
            <h3 style={{ margin: 0, fontSize: "16px", fontWeight: "600" }}>Arrivi di Oggi</h3>
            <span style={{ backgroundColor: "var(--color-info-soft)", color: "var(--color-info-strong)", padding: "2px 8px", borderRadius: "99px", fontSize: "12px", fontWeight: "600" }}>
              {todayStr}
            </span>
          </div>
          
          {todaysArrivals.length === 0 ? (
            <p style={{ color: "var(--color-text-subtle)", fontSize: "14px", fontStyle: "italic" }}>Nessun check-in previsto per oggi.</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              {todaysArrivals.map(booking => (
                <div key={booking.id} style={{ display: "flex", alignItems: "center", gap: "12px", paddingBottom: "12px", borderBottom: "1px solid var(--color-border)" }}>
                  <div style={{ width: "40px", height: "40px", borderRadius: "50%", backgroundColor: "var(--color-success-soft)", color: "var(--color-success-strong)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: "700", fontSize: "14px" }}>
                    IN
                  </div>
                  <div>
                    <div style={{ fontWeight: "600", fontSize: "14px", color: "var(--color-text)" }}>{booking.guest_name}</div>
                    <div style={{ fontSize: "12px", color: "var(--color-text-muted)" }}>Unit #{booking.unit_id} · {booking.num_adults} pax</div>
                  </div>
                  <div style={{ marginLeft: "auto", fontSize: "12px", fontWeight: "600", color: "var(--color-primary)" }}>
                    {booking.estimated_arrival_time ? booking.estimated_arrival_time.slice(0,5) : "Orario n/d"}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Stato Staff */}
        <div style={operationCard}>
          <h3 style={{ margin: "0 0 16px 0", fontSize: "16px", fontWeight: "600" }}>Avanzamento Staff</h3>
          
          <div style={{ marginBottom: "20px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "13px", marginBottom: "6px", color: "var(--color-text-muted)" }}>
              <span>Task completati</span>
              <strong>{tasksCompleted} / {tasksTotal}</strong>
            </div>
            <div style={{ width: "100%", height: "10px", backgroundColor: "var(--color-surface-soft)", borderRadius: "99px", overflow: "hidden" }}>
              <div style={{ width: `${taskProgress}%`, height: "100%", backgroundColor: taskProgress === 100 ? "var(--color-success)" : "var(--color-primary)", transition: "width 0.5s ease" }}></div>
            </div>
          </div>

          {tasksTotal > 0 && tasksCompleted < tasksTotal ? (
            <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "13px", color: "var(--color-warning-strong)", backgroundColor: "var(--color-warning-soft)", padding: "10px", borderRadius: "8px", border: "1px solid var(--color-warning)" }}>
              <AlertTriangle size={16} aria-hidden="true" />
              <span>Ci sono ancora <strong>{tasksTotal - tasksCompleted}</strong> attività da completare oggi.</span>
            </div>
          ) : tasksTotal > 0 ? (
            <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "13px", color: "var(--color-success-strong)", backgroundColor: "var(--color-success-soft)", padding: "10px", borderRadius: "8px", border: "1px solid var(--color-success)" }}>
              <CheckCircle2 size={16} aria-hidden="true" />
              <span>Ottimo lavoro! Tutte le attività di oggi sono completate.</span>
            </div>
          ) : (
            <div style={{ fontSize: "13px", color: "var(--color-text-muted)" }}>Nessun task programmato per oggi.</div>
          )}
        </div>

      </div>
    </div>
  );
}

export default Dashboard;
