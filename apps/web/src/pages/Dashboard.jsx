import { useEffect, useState, useMemo } from "react";
import useIsMobile from "../hooks/useIsMobile";
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
import {
  getMonthPnL,
  getStaffTasks,
  getBookings,
  getAdvancedKpis,
  getTodayAlerts,
} from "../services/api";
import PageInfoHelp from "../components/PageInfoHelp";

const COLORS = ["#0088FE", "#00C49F", "#FFBB28", "#FF8042"];

function toSafeNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function formatCurrency(value) {
  return `EUR ${toSafeNumber(value).toLocaleString("it-IT", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}`;
}

function Dashboard() {
  const isMobile = useIsMobile(900);
  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);

  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1);

  const [pnl, setPnl] = useState(null);
  const [todaysTasks, setTodaysTasks] = useState([]);
  const [todaysArrivals, setTodaysArrivals] = useState([]);
  const [advancedKpis, setAdvancedKpis] = useState(null);
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    async function loadAll() {
      setLoading(true);
      setError(null);
      try {
        // Carichiamo in parallelo: Analisi Finanziaria, Task di oggi, Prenotazioni
        const [pnlData, tasksData, bookingsData, advancedData, alertsData] = await Promise.all([
          getMonthPnL(year, month),
          getStaffTasks({ date: todayStr }),
          getBookings(),
          getAdvancedKpis(year, month),
          getTodayAlerts(),
        ]);

        setPnl(pnlData);
        setTodaysTasks(tasksData || []);
        setAdvancedKpis(advancedData);
        setAlerts(alertsData || []);

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
  const pageStyle = { display: "flex", flexDirection: "column", gap: 20 };
  
  const headerStyle = {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 14,
    background: "linear-gradient(180deg,#fff 0%,#f8fafc 100%)",
    border: "1px solid #e2e8f0",
    borderRadius: 16,
    padding: "14px 16px",
    boxShadow: "0 8px 20px rgba(15,23,42,0.05)",
  };
  
  const gridKPI = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12 };
  
  const kpiCard = (borderLeftColor) => ({
    background: "linear-gradient(180deg,#fff 0%,#f8fafc 100%)",
    borderRadius: 16,
    padding: 16,
    boxShadow: "0 8px 20px rgba(15,23,42,0.05)",
    border: "1px solid #e2e8f0",
    borderLeft: `5px solid ${borderLeftColor}`,
    display: "flex", flexDirection: "column", justifyContent: "space-between"
  });

  const gridCharts = { display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fit, minmax(360px, 1fr))", gap: 16 };
  
  const chartCard = {
    background: "linear-gradient(180deg,#fff 0%,#f8fafc 100%)", borderRadius: 16, padding: 18,
    boxShadow: "0 8px 20px rgba(15,23,42,0.05)", border: "1px solid #e2e8f0",
    minHeight: "350px", minWidth: 0, display: "flex", flexDirection: "column"
  };

  const operationCard = {
    background: "linear-gradient(180deg,#fff 0%,#f8fafc 100%)", borderRadius: 16, padding: 18,
    border: "1px solid #e2e8f0", flex: 1, boxShadow: "0 8px 20px rgba(15,23,42,0.05)"
  };

  const selectStyle = {
    padding: "8px 12px", borderRadius: 10, border: "1px solid #cbd5e1",
    fontSize: "14px", cursor: "pointer", backgroundColor: "white"
  };

  if (loading) return <div style={{ padding: 20 }}>Caricamento Dashboard...</div>;
  if (error) return <div style={{ padding: 20, color: "#dc2626" }}>{error}</div>;

  return (
    <div style={pageStyle}>
      
      {/* HEADER */}
      <div style={headerStyle}>
        <div>
          <h1 style={{ margin: 0, fontSize: "24px", fontWeight: "700", color: "#111827" }}>
            Dashboard
          </h1>
          <p style={{ margin: "4px 0 0", color: "#6b7280", fontSize: "14px" }}>
            Panoramica di {new Date(year, month - 1).toLocaleDateString("it-IT", { month: 'long', year: 'numeric' })}
          </p>
        </div>
        
        <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
          <PageInfoHelp title="Come usare Dashboard">
            <p>Dashboard unisce KPI finanziari, operativi e alert della giornata.</p>
            <ol style={{ margin: 0, paddingLeft: 18, display: "grid", gap: 4 }}>
              <li>Seleziona mese/anno per analisi economica.</li>
              <li>Controlla alert e arrivi oggi per priorita operative.</li>
              <li>Usa revpar, share direct e pipeline per decisioni prezzo/canali.</li>
            </ol>
          </PageInfoHelp>
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
        </div>
      </div>

      <div style={gridKPI}>
        <div style={kpiCard("#1d4ed8")}>
          <div style={{ fontSize: "12px", fontWeight: "600", color: "#6b7280", textTransform: "uppercase" }}>RevPAR</div>
          <div style={{ fontSize: "24px", fontWeight: "700", color: "#111827", marginTop: "8px" }}>
            {formatCurrency(advancedKpis?.revpar)}
          </div>
        </div>
        <div style={kpiCard("#0ea5e9")}>
          <div style={{ fontSize: "12px", fontWeight: "600", color: "#6b7280", textTransform: "uppercase" }}>Share Direct</div>
          <div style={{ fontSize: "24px", fontWeight: "700", color: "#111827", marginTop: "8px" }}>
            {toSafeNumber(advancedKpis?.direct_share_percent).toFixed(2)}%
          </div>
        </div>
        <div style={kpiCard("#7c3aed")}>
          <div style={{ fontSize: "12px", fontWeight: "600", color: "#6b7280", textTransform: "uppercase" }}>Pipeline 30g</div>
          <div style={{ fontSize: "24px", fontWeight: "700", color: "#111827", marginTop: "8px" }}>
            {formatCurrency(advancedKpis?.pipeline_revenue_next_30_days)}
          </div>
        </div>
        <div style={kpiCard("#f97316")}>
          <div style={{ fontSize: "12px", fontWeight: "600", color: "#6b7280", textTransform: "uppercase" }}>Alert operativi</div>
          <div style={{ marginTop: "8px", fontSize: 13, color: "#111827" }}>
            {alerts.length === 0
              ? "Nessun alert attivo"
              : `${alerts.length} alert da verificare`}
          </div>
        </div>
      </div>

      {alerts.length > 0 && (
        <div style={{ ...chartCard, minHeight: "auto" }}>
          <h3 style={{ fontSize: "16px", fontWeight: 600, marginBottom: 12, color: "#374151" }}>
            Alert Oggi
          </h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {alerts.map((alert) => (
              <div key={alert.code} style={{ border: "1px solid #e2e8f0", borderRadius: 10, padding: 10, background: "#fff" }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{alert.title} ({alert.count})</div>
                <div style={{ fontSize: 12, color: "#6b7280" }}>{alert.details}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 1. KPI FINANZIARI */}
      <div style={gridKPI}>
        <div style={kpiCard("#0f766e")}>
          <div style={{ fontSize: "12px", fontWeight: "600", color: "#6b7280", textTransform: "uppercase" }}>Ricavi Totali</div>
          <div style={{ fontSize: "28px", fontWeight: "700", color: "#111827", marginTop: "8px" }}>
            EUR {pnl?.revenue_total.toLocaleString()}
          </div>
        </div>
        <div style={kpiCard("#dc2626")}>
          <div style={{ fontSize: "12px", fontWeight: "600", color: "#6b7280", textTransform: "uppercase" }}>Costi Totali</div>
          <div style={{ fontSize: "28px", fontWeight: "700", color: "#111827", marginTop: "8px" }}>
            EUR {pnl?.costs_total.toLocaleString()}
          </div>
        </div>
        <div style={kpiCard(pnl?.profit >= 0 ? "#16a34a" : "#dc2626")}>
          <div style={{ fontSize: "12px", fontWeight: "600", color: "#6b7280", textTransform: "uppercase" }}>Profitto Netto</div>
          <div style={{ fontSize: "28px", fontWeight: "700", color: pnl?.profit >= 0 ? "#16a34a" : "#dc2626", marginTop: "8px" }}>
            EUR {pnl?.profit.toLocaleString()}
          </div>
        </div>
        <div style={kpiCard("#f59e0b")}>
          <div style={{ fontSize: "12px", fontWeight: "600", color: "#6b7280", textTransform: "uppercase" }}>Occupazione & ADR</div>
          <div style={{ display: "flex", alignItems: "baseline", gap: "8px", marginTop: "8px" }}>
             <span style={{ fontSize: "28px", fontWeight: "700", color: "#111827" }}>{pnl?.occupancy_rate.toFixed(0)}%</span>
             <span style={{ fontSize: "14px", color: "#6b7280" }}>
               (EUR {pnl?.adr ? pnl.adr.toFixed(0) : 0}/notte)
             </span>
          </div>
        </div>
      </div>

      {/* 2. GRAFICI */}
      <div style={gridCharts}>
        {/* Grafico a Torta: Fonti */}
        <div style={chartCard}>
          <h3 style={{ fontSize: "16px", fontWeight: "600", marginBottom: "20px", color: "#374151" }}>
            Provenienza Ricavi
          </h3>
          <div style={{ height: isMobile ? 260 : 290, minWidth: 0 }}>
            {sourceData.length > 0 ? (
              <ResponsiveContainer width="100%" height={isMobile ? 250 : 280}>
                <PieChart>
                  <Pie
                    data={sourceData}
                    cx="50%" cy="50%"
                    innerRadius={60} outerRadius={90}
                    paddingAngle={5}
                    dataKey="value"
                  >
                    {sourceData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value) => `EUR ${value.toLocaleString()}`} />
                  <Legend verticalAlign="bottom" height={36}/>
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div style={{ display: "flex", height: "100%", alignItems: "center", justifyContent: "center", color: "#9ca3af" }}>Nessun dato</div>
            )}
          </div>
        </div>

        {/* Grafico a Barre: Costi */}
        <div style={chartCard}>
          <h3 style={{ fontSize: "16px", fontWeight: "600", marginBottom: "20px", color: "#374151" }}>
            Top 5 Categorie di Spesa
          </h3>
          <div style={{ height: isMobile ? 260 : 290, minWidth: 0 }}>
            {costData.length > 0 ? (
              <ResponsiveContainer width="100%" height={isMobile ? 250 : 280}>
                <BarChart data={costData} layout="vertical" margin={{ top: 5, right: 30, left: 40, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                  <XAxis type="number" hide />
                  <YAxis type="category" dataKey="name" width={100} tick={{fontSize: 12}} />
                  <Tooltip cursor={{ fill: "transparent" }} formatter={(value) => `EUR ${value.toLocaleString()}`} />
                  <Bar dataKey="Importo" fill="#dc2626" radius={[0, 4, 4, 0]} barSize={20} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div style={{ display: "flex", height: "100%", alignItems: "center", justifyContent: "center", color: "#9ca3af" }}>Nessun costo</div>
            )}
          </div>
        </div>
      </div>

      {/* 3. SEZIONE OPERATIVA OGGI */}
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fit, minmax(300px, 1fr))", gap: "24px" }}>
        
        {/* Arrivi di Oggi */}
        <div style={operationCard}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
            <h3 style={{ margin: 0, fontSize: "16px", fontWeight: "600" }}>Arrivi di Oggi</h3>
            <span style={{ backgroundColor: "#dbeafe", color: "#1e40af", padding: "2px 8px", borderRadius: "99px", fontSize: "12px", fontWeight: "600" }}>
              {todayStr}
            </span>
          </div>
          
          {todaysArrivals.length === 0 ? (
            <p style={{ color: "#9ca3af", fontSize: "14px", fontStyle: "italic" }}>Nessun check-in previsto per oggi.</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              {todaysArrivals.map(booking => (
                <div key={booking.id} style={{ display: "flex", alignItems: "center", gap: "12px", paddingBottom: "12px", borderBottom: "1px solid #f3f4f6" }}>
                  <div style={{ width: "40px", height: "40px", borderRadius: "50%", backgroundColor: "#ecfdf5", color: "#047857", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: "700", fontSize: "14px" }}>
                    IN
                  </div>
                  <div>
                    <div style={{ fontWeight: "600", fontSize: "14px", color: "#111827" }}>{booking.guest_name}</div>
                    <div style={{ fontSize: "12px", color: "#6b7280" }}>Unit #{booking.unit_id} - {booking.num_adults} pax</div>
                  </div>
                  <div style={{ marginLeft: "auto", fontSize: "12px", fontWeight: "600", color: "#0f766e" }}>
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
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "13px", marginBottom: "6px", color: "#4b5563" }}>
              <span>Task completati</span>
              <strong>{tasksCompleted} / {tasksTotal}</strong>
            </div>
            <div style={{ width: "100%", height: "10px", backgroundColor: "#f3f4f6", borderRadius: "99px", overflow: "hidden" }}>
              <div style={{ width: `${taskProgress}%`, height: "100%", backgroundColor: taskProgress === 100 ? "#16a34a" : "#0f766e", transition: "width 0.5s ease" }}></div>
            </div>
          </div>

          {tasksTotal > 0 && tasksCompleted < tasksTotal ? (
            <div style={{ fontSize: "13px", color: "#d97706", backgroundColor: "#fffbeb", padding: "10px", borderRadius: "8px", border: "1px solid #fcd34d" }}>
              Attenzione: ci sono ancora <strong>{tasksTotal - tasksCompleted}</strong> attivita da completare oggi.
            </div>
          ) : tasksTotal > 0 ? (
            <div style={{ fontSize: "13px", color: "#047857", backgroundColor: "#ecfdf5", padding: "10px", borderRadius: "8px", border: "1px solid #6ee7b7" }}>
              OK. Ottimo lavoro! Tutte le attivita di oggi sono completate.
            </div>
          ) : (
            <div style={{ fontSize: "13px", color: "#6b7280" }}>Nessun task programmato per oggi.</div>
          )}
        </div>

      </div>
    </div>
  );
}

export default Dashboard;




