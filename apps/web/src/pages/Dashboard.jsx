import { useEffect, useState, useMemo } from "react";
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
import { getMonthPnL, getStaffTasks, getBookings, getUnits } from "../services/api";

const COLORS = ["#0088FE", "#00C49F", "#FFBB28", "#FF8042"];

function formatDate(d) {
  return new Date(d).toLocaleDateString("it-IT", {
    day: "numeric",
    month: "short",
  });
}

function Dashboard() {
  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);

  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1);

  const [pnl, setPnl] = useState(null);
  const [todaysTasks, setTodaysTasks] = useState([]);
  const [todaysArrivals, setTodaysArrivals] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [units, setUnits] = useState([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    async function loadAll() {
      setLoading(true);
      setError(null);
      try {
        // Carichiamo in parallelo: Analisi Finanziaria, Task di oggi, Prenotazioni, Unità
        const [pnlData, tasksData, bookingsData, unitsData] = await Promise.all([
          getMonthPnL(year, month),
          getStaffTasks({ date: todayStr }),
          getBookings(),
          getUnits(),
        ]);

        setPnl(pnlData || null);
        setTodaysTasks(tasksData || []);
        setBookings(bookingsData || []);
        setUnits(unitsData || []);

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

  // --- NUMERI SAFE PER PNL (evitiamo crash su null/undefined) ---
  const revenueTotal = Number(pnl?.revenue_total || 0);
  const costsTotal = Number(pnl?.costs_total || 0);
  const profit = Number(pnl?.profit || 0);
  const occupancyRate = Number(pnl?.occupancy_rate || 0);
  const adr = Number(pnl?.adr || 0);

  // --- PREPARAZIONE DATI GRAFICI ---

  // 1. Fonti di Prenotazione (Pie Chart)
  const sourceData = useMemo(() => {
    const revenueBySource = pnl?.revenue_by_source || {};
    return Object.entries(revenueBySource)
      .map(([key, value]) => ({
        name: key === "direct" ? "Diretta" : key.charAt(0).toUpperCase() + key.slice(1),
        value: Number(value || 0),
      }))
      .filter((item) => item.value > 0);
  }, [pnl]);

  // 2. Costi per Categoria (Bar Chart)
  const costData = useMemo(() => {
    const costsByCategory = pnl?.costs_by_category || [];
    return costsByCategory
      .slice(0, 5)
      .map((c) => ({
        name:
          c.category && c.category.length > 15
            ? c.category.slice(0, 12) + "..."
            : c.category || "Altro",
        Importo: Number(c.total || 0),
      }));
  }, [pnl]);

  // --- KPI OPERATIVI STAFF ---
  const tasksCompleted = todaysTasks.filter((t) => t.status === "done").length;
  const tasksTotal = todaysTasks.length;
  const taskProgress =
    tasksTotal > 0 ? Math.round((tasksCompleted / tasksTotal) * 100) : 0;

  // --- MAPPE DI SUPPORTO ---
  const unitMap = useMemo(
    () =>
      units.reduce((acc, u) => {
        acc[u.id] = u;
        return acc;
      }, {}),
    [units]
  );

  // --- ANALYTICS PRENOTAZIONI MENSILI ---
  const monthBookings = useMemo(() => {
    if (!bookings || bookings.length === 0) return [];
    return bookings.filter((b) => {
      if (!b.checkin_date) return false;
      const d = new Date(b.checkin_date);
      return d.getFullYear() === year && d.getMonth() + 1 === month;
    });
  }, [bookings, year, month]);

  const totalNights = useMemo(() => {
    return monthBookings.reduce((sum, b) => {
      if (!b.checkin_date || !b.checkout_date) return sum;
      const inDate = new Date(b.checkin_date);
      const outDate = new Date(b.checkout_date);
      const diffDays = (outDate - inDate) / (1000 * 60 * 60 * 24);
      if (isNaN(diffDays) || diffDays < 0) return sum;
      return sum + diffDays;
    }, 0);
  }, [monthBookings]);

  const avgLos = monthBookings.length > 0 ? totalNights / monthBookings.length : 0;

  // --- "AUTOMAZIONI" / SUGGERIMENTI OPERATIVI ---
  const unpaidArrivals = todaysArrivals.filter((b) => !b.is_paid).length;
  const pendingTasks = tasksTotal - tasksCompleted;

  // --- STILI ---
  const pageStyle = { display: "flex", flexDirection: "column", gap: "24px" };

  const headerStyle = {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    flexWrap: "wrap",
    gap: "16px",
  };

  const gridKPI = {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
    gap: "16px",
  };

  const kpiCard = (borderLeftColor) => ({
    backgroundColor: "white",
    borderRadius: "12px",
    padding: "20px",
    boxShadow: "0 2px 4px rgba(0,0,0,0.04)",
    border: "1px solid #e5e7eb",
    borderLeft: `5px solid ${borderLeftColor}`,
    display: "flex",
    flexDirection: "column",
    justifyContent: "space-between",
  });

  const gridCharts = {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(400px, 1fr))",
    gap: "24px",
  };

  const chartCard = {
    backgroundColor: "white",
    borderRadius: "16px",
    padding: "24px",
    boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1)",
    border: "1px solid #e5e7eb",
    minHeight: "350px",
    display: "flex",
    flexDirection: "column",
  };

  const operationCard = {
    backgroundColor: "white",
    borderRadius: "16px",
    padding: "24px",
    border: "1px solid #e5e7eb",
    flex: 1,
  };

  const selectStyle = {
    padding: "8px 12px",
    borderRadius: "8px",
    border: "1px solid #d1d5db",
    fontSize: "14px",
    cursor: "pointer",
    backgroundColor: "white",
  };

  if (loading) return <div style={{ padding: 20 }}>Caricamento Dashboard...</div>;
  if (error) return <div style={{ padding: 20, color: "#dc2626" }}>{error}</div>;

  return (
    <div style={pageStyle}>
      {/* HEADER */}
      <div style={headerStyle}>
        <div>
          <h1
            style={{
              margin: 0,
              fontSize: "24px",
              fontWeight: "700",
              color: "#111827",
            }}
          >
            Dashboard
          </h1>
          <p
            style={{
              margin: "4px 0 0",
              color: "#6b7280",
              fontSize: "14px",
            }}
          >
            Panoramica di{" "}
            {new Date(year, month - 1).toLocaleDateString("it-IT", {
              month: "long",
              year: "numeric",
            })}
          </p>
        </div>

        <div style={{ display: "flex", gap: "12px" }}>
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
            {[2024, 2025, 2026].map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* 1. KPI FINANZIARI */}
      <div style={gridKPI}>
        <div style={kpiCard("#0f766e")}>
          <div
            style={{
              fontSize: "12px",
              fontWeight: "600",
              color: "#6b7280",
              textTransform: "uppercase",
            }}
          >
            Ricavi Totali
          </div>
          <div
            style={{
              fontSize: "28px",
              fontWeight: "700",
              color: "#111827",
              marginTop: "8px",
            }}
          >
            € {revenueTotal.toLocaleString()}
          </div>
        </div>
        <div style={kpiCard("#dc2626")}>
          <div
            style={{
              fontSize: "12px",
              fontWeight: "600",
              color: "#6b7280",
              textTransform: "uppercase",
            }}
          >
            Costi Totali
          </div>
          <div
            style={{
              fontSize: "28px",
              fontWeight: "700",
              color: "#111827",
              marginTop: "8px",
            }}
          >
            € {costsTotal.toLocaleString()}
          </div>
        </div>
        <div style={kpiCard(profit >= 0 ? "#16a34a" : "#dc2626")}>
          <div
            style={{
              fontSize: "12px",
              fontWeight: "600",
              color: "#6b7280",
              textTransform: "uppercase",
            }}
          >
            Profitto Netto
          </div>
          <div
            style={{
              fontSize: "28px",
              fontWeight: "700",
              color: profit >= 0 ? "#16a34a" : "#dc2626",
              marginTop: "8px",
            }}
          >
            € {profit.toLocaleString()}
          </div>
        </div>
        <div style={kpiCard("#f59e0b")}>
          <div
            style={{
              fontSize: "12px",
              fontWeight: "600",
              color: "#6b7280",
              textTransform: "uppercase",
            }}
          >
            Occupazione & ADR
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "baseline",
              gap: "8px",
              marginTop: "8px",
            }}
          >
            <span
              style={{
                fontSize: "28px",
                fontWeight: "700",
                color: "#111827",
              }}
            >
              {occupancyRate.toFixed(0)}%
            </span>
            <span style={{ fontSize: "14px", color: "#6b7280" }}>
              (€ {adr.toFixed(0)}/notte)
            </span>
          </div>
        </div>
      </div>

      {/* 1bis. ANALYTICS PRENOTAZIONI & SUGGERIMENTI OPERATIVI */}
      <div style={gridKPI}>
        <div style={kpiCard("#2563eb")}>
          <div
            style={{
              fontSize: "12px",
              fontWeight: "600",
              color: "#6b7280",
              textTransform: "uppercase",
            }}
          >
            Prenotazioni del Mese
          </div>
          <div
            style={{
              fontSize: "24px",
              fontWeight: "700",
              color: "#111827",
              marginTop: "8px",
            }}
          >
            {monthBookings.length}
          </div>
          <div
            style={{
              fontSize: "13px",
              color: "#6b7280",
              marginTop: "4px",
            }}
          >
            {totalNights.toFixed(0)} notti totali · LOS medio{" "}
            {avgLos.toFixed(1)} notti
          </div>
        </div>

        <div style={kpiCard("#10b981")}>
          <div
            style={{
              fontSize: "12px",
              fontWeight: "600",
              color: "#6b7280",
              textTransform: "uppercase",
            }}
          >
            Suggerimenti Operativi di Oggi
          </div>
          <div style={{ marginTop: "8px", fontSize: "13px", color: "#374151" }}>
            {unpaidArrivals === 0 && pendingTasks <= 0 ? (
              <span>✔️ Nessuna urgenza critica per oggi.</span>
            ) : (
              <ul style={{ paddingLeft: "18px", margin: 0 }}>
                {unpaidArrivals > 0 && (
                  <li>
                    {unpaidArrivals} arrivi di oggi risultano ancora{" "}
                    <strong>non incassati</strong>.
                  </li>
                )}
                {pendingTasks > 0 && (
                  <li>
                    Ci sono ancora{" "}
                    <strong>{pendingTasks} task staff</strong> da completare.
                  </li>
                )}
              </ul>
            )}
          </div>
        </div>
      </div>

      {/* 2. GRAFICI */}
      <div style={gridCharts}>
        {/* Grafico a Torta: Fonti */}
        <div style={chartCard}>
          <h3
            style={{
              fontSize: "16px",
              fontWeight: "600",
              marginBottom: "20px",
              color: "#374151",
            }}
          >
            Provenienza Ricavi
          </h3>
          <div style={{ flex: 1, minHeight: "250px" }}>
            {sourceData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={sourceData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={90}
                    paddingAngle={5}
                    dataKey="value"
                  >
                    {sourceData.map((entry, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={COLORS[index % COLORS.length]}
                      />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value) =>
                      `€ ${Number(value).toLocaleString()}`
                    }
                  />
                  <Legend verticalAlign="bottom" height={36} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div
                style={{
                  display: "flex",
                  height: "100%",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "#9ca3af",
                }}
              >
                Nessun dato
              </div>
            )}
          </div>
        </div>

        {/* Grafico a Barre: Costi */}
        <div style={chartCard}>
          <h3
            style={{
              fontSize: "16px",
              fontWeight: "600",
              marginBottom: "20px",
              color: "#374151",
            }}
          >
            Top 5 Categorie di Spesa
          </h3>
          <div style={{ flex: 1, minHeight: "250px" }}>
            {costData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={costData}
                  layout="vertical"
                  margin={{ top: 5, right: 30, left: 40, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                  <XAxis type="number" hide />
                  <YAxis
                    type="category"
                    dataKey="name"
                    width={100}
                    tick={{ fontSize: 12 }}
                  />
                  <Tooltip
                    cursor={{ fill: "transparent" }}
                    formatter={(value) =>
                      `€ ${Number(value).toLocaleString()}`
                    }
                  />
                  <Bar
                    dataKey="Importo"
                    fill="#dc2626"
                    radius={[0, 4, 4, 0]}
                    barSize={20}
                  />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div
                style={{
                  display: "flex",
                  height: "100%",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "#9ca3af",
                }}
              >
                Nessun costo
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 3. SEZIONE OPERATIVA OGGI */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
          gap: "24px",
        }}
      >
        {/* Arrivi di Oggi */}
        <div style={operationCard}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: "16px",
            }}
          >
            <h3
              style={{
                margin: 0,
                fontSize: "16px",
                fontWeight: "600",
              }}
            >
              Arrivi di Oggi
            </h3>
            <span
              style={{
                backgroundColor: "#dbeafe",
                color: "#1e40af",
                padding: "2px 8px",
                borderRadius: "99px",
                fontSize: "12px",
                fontWeight: "600",
              }}
            >
              {todayStr}
            </span>
          </div>

          {todaysArrivals.length === 0 ? (
            <p
              style={{
                color: "#9ca3af",
                fontSize: "14px",
                fontStyle: "italic",
              }}
            >
              Nessun check-in previsto per oggi.
            </p>
          ) : (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "12px",
              }}
            >
              {todaysArrivals.map((booking) => {
                const unit = unitMap[booking.unit_id];
                const adults =
                  booking.num_adults !== null && booking.num_adults !== undefined
                    ? booking.num_adults
                    : 1;
                const children = Number(booking.num_children || 0);
                const totalPax = adults + children;

                return (
                  <div
                    key={booking.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "12px",
                      paddingBottom: "12px",
                      borderBottom: "1px solid #f3f4f6",
                    }}
                  >
                    <div
                      style={{
                        width: "40px",
                        height: "40px",
                        borderRadius: "50%",
                        backgroundColor: "#ecfdf5",
                        color: "#047857",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontWeight: "700",
                        fontSize: "14px",
                      }}
                    >
                      IN
                    </div>
                    <div>
                      <div
                        style={{
                          fontWeight: "600",
                          fontSize: "14px",
                          color: "#111827",
                        }}
                      >
                        {booking.guest_name}
                      </div>
                      <div
                        style={{
                          fontSize: "12px",
                          color: "#6b7280",
                        }}
                      >
                        {unit ? unit.name : `Unit #${booking.unit_id}`} ·{" "}
                        {totalPax} pax
                      </div>
                    </div>
                    <div
                      style={{
                        marginLeft: "auto",
                        fontSize: "12px",
                        fontWeight: "600",
                        color: "#0f766e",
                      }}
                    >
                      {booking.estimated_arrival_time
                        ? booking.estimated_arrival_time.slice(0, 5)
                        : "Orario n/d"}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Stato Staff */}
        <div style={operationCard}>
          <h3
            style={{
              margin: "0 0 16px 0",
              fontSize: "16px",
              fontWeight: "600",
            }}
          >
            Avanzamento Staff
          </h3>

          <div style={{ marginBottom: "20px" }}>
            <div
              style={{
                display: "flex",
                justifyContent: "spaceBetween",
                fontSize: "13px",
                marginBottom: "6px",
                color: "#4b5563",
              }}
            >
              <span>Task completati</span>
              <strong>
                {tasksCompleted} / {tasksTotal}
              </strong>
            </div>
            <div
              style={{
                width: "100%",
                height: "10px",
                backgroundColor: "#f3f4f6",
                borderRadius: "99px",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  width: `${taskProgress}%`,
                  height: "100%",
                  backgroundColor: taskProgress === 100 ? "#16a34a" : "#0f766e",
                  transition: "width 0.5s ease",
                }}
              ></div>
            </div>
          </div>

          {tasksTotal > 0 && tasksCompleted < tasksTotal ? (
            <div
              style={{
                fontSize: "13px",
                color: "#d97706",
                backgroundColor: "#fffbeb",
                padding: "10px",
                borderRadius: "8px",
                border: "1px solid #fcd34d",
              }}
            >
              ⚠️ Ci sono ancora{" "}
              <strong>{tasksTotal - tasksCompleted}</strong> attività da
              completare oggi.
            </div>
          ) : tasksTotal > 0 ? (
            <div
              style={{
                fontSize: "13px",
                color: "#047857",
                backgroundColor: "#ecfdf5",
                padding: "10px",
                borderRadius: "8px",
                border: "1px solid #6ee7b7",
              }}
            >
              ✅ Ottimo lavoro! Tutte le attività di oggi sono completate.
            </div>
          ) : (
            <div style={{ fontSize: "13px", color: "#6b7280" }}>
              Nessun task programmato per oggi.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default Dashboard;
