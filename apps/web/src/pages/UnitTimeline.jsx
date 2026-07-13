import { useEffect, useMemo, useState } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import { CalendarRange, Cpu } from "lucide-react";
import { PageHeader } from "../components/ui";
import { getUnitSchedule } from "../services/api";

const MS_PER_DAY = 1000 * 60 * 60 * 24;

/**
 * Sub-navigation shared by the two unit views (PMS timeline / smart detail):
 * makes /units/:id/timeline and /smart-units/:id feel like one unit page
 * with two tabs. Real links (middle-click friendly), tokens only.
 */
function UnitViewTabs({ unitId, active }) {
  const tabs = [
    { key: "timeline", label: "Timeline PMS", to: `/units/${unitId}/timeline`, icon: CalendarRange },
    { key: "smart", label: "Smart & dispositivi", to: `/smart-units/${unitId}`, icon: Cpu },
  ];
  return (
    <nav className="ui-tablist" aria-label="Viste unità">
      {tabs.map((tab) => {
        const Icon = tab.icon;
        const isActive = tab.key === active;
        return (
          <Link
            key={tab.key}
            to={tab.to}
            className={isActive ? "ui-tab is-active" : "ui-tab"}
            aria-current={isActive ? "page" : undefined}
            style={{ textDecoration: "none" }}
          >
            <Icon size={14} aria-hidden="true" />
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}

function UnitTimeline() {
  const { unitId } = useParams();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [unitName, setUnitName] = useState("");
  const [items, setItems] = useState([]);

  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  // filtri vista
  const [viewMode, setViewMode] = useState("both"); // both | bookings | staff
  const [taskTypeFilter, setTaskTypeFilter] = useState("all"); // all | cleaning | checkin | ...

  // modali
  const [selectedBooking, setSelectedBooking] = useState(null);
  const [selectedCluster, setSelectedCluster] = useState(null); // cluster di task per giorno

  function parseDate(value) {
    if (!value) return null;
    const d = new Date(value);
    return isNaN(d.getTime()) ? null : d;
  }

  async function load(params = {}) {
    if (!unitId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await getUnitSchedule(unitId, params);
      setUnitName(data.unit_name || `Unit #${unitId}`);
      setItems(Array.isArray(data.items) ? data.items : []);
      setFromDate(data.from_date || "");
      setToDate(data.to_date || "");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  // primo caricamento
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unitId]);

  // ricarica quando cambi range
  useEffect(() => {
    if (!fromDate || !toDate) return;
    load({ from_date: fromDate, to_date: toDate });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fromDate, toDate]);

  const rangeStart = useMemo(() => parseDate(fromDate), [fromDate]);
  const rangeEnd = useMemo(() => parseDate(toDate), [toDate]);

  const totalDays = useMemo(() => {
    if (!rangeStart || !rangeEnd) return 0;
    return Math.max(1, Math.round((rangeEnd - rangeStart) / MS_PER_DAY));
  }, [rangeStart, rangeEnd]);

  // normalizzazione elementi in booking / task
  const normalized = useMemo(() => {
    if (!rangeStart || !rangeEnd) return [];

    return items
      .map((item) => {
        if (item.kind === "booking") {
          const start = parseDate(item.start_date);
          const end = parseDate(item.end_date);
          return {
            ...item,
            kind: "booking",
            startDate: start,
            endDate: end,
          };
        } else {
          const d = parseDate(item.date);
          return {
            ...item,
            kind: "staff_task",
            startDate: d,
            endDate: d,
          };
        }
      })
      .filter((i) => i.startDate);
  }, [items, rangeStart, rangeEnd]);

  const bookings = useMemo(
    () => normalized.filter((i) => i.kind === "booking"),
    [normalized]
  );
  const staffTasks = useMemo(
    () => normalized.filter((i) => i.kind === "staff_task"),
    [normalized]
  );

  function formatDate(d) {
    if (!d) return "—";
    return d.toLocaleDateString("it-IT");
  }

  function calcBar(startDate, endDate) {
    if (!rangeStart || !totalDays || !startDate) {
      return { left: "0%", width: "0%" };
    }

    const startDiff = Math.max(
      0,
      Math.round((startDate - rangeStart) / MS_PER_DAY)
    );
    const endDiff = endDate
      ? Math.min(totalDays, Math.round((endDate - rangeStart) / MS_PER_DAY))
      : startDiff;

    const left = (startDiff / totalDays) * 100;
    const days = Math.max(1, endDiff - startDiff || 1);
    const width = (days / totalDays) * 100;

    return {
      left: `${left}%`,
      width: `${width}%`,
    };
  }

  // --- colori meta per task staff ---

  function taskTypeMeta(type) {
    switch (type) {
      case "cleaning":
        return {
          label: "Pulizie",
          color: "var(--color-primary)",
          shadow: "0 0 0 3px color-mix(in srgb, var(--color-primary) 45%, transparent)",
        };
      case "checkin":
        return {
          label: "Check-in",
          color: "var(--color-info)",
          shadow: "0 0 0 3px color-mix(in srgb, var(--color-info) 45%, transparent)",
        };
      case "checkout":
        return {
          label: "Check-out",
          color: "var(--color-warning-strong)",
          shadow: "0 0 0 3px color-mix(in srgb, var(--color-warning) 50%, transparent)",
        };
      case "breakfast":
        return {
          label: "Colazioni",
          color: "var(--color-warning-strong)",
          shadow: "0 0 0 3px color-mix(in srgb, var(--color-warning) 45%, transparent)",
        };
      case "maintenance":
        return {
          label: "Manutenzione",
          color: "var(--color-danger)",
          shadow: "0 0 0 3px color-mix(in srgb, var(--color-danger) 50%, transparent)",
        };
      default:
        return {
          label: "Altro",
          color: "var(--color-text-muted)",
          shadow: "0 0 0 3px color-mix(in srgb, var(--color-text-muted) 50%, transparent)",
        };
    }
  }

  // staff filtrati per tipo
  const staffFiltered = useMemo(() => {
    return staffTasks.filter((t) => {
      const typeKey = t.task_type || t.type || "other";
      if (taskTypeFilter !== "all" && typeKey !== taskTypeFilter) return false;
      return true;
    });
  }, [staffTasks, taskTypeFilter]);

  // cluster per giorno per i task staff (per evitare dot sovrapposti)
  const staffClusters = useMemo(() => {
    const map = new Map();
    staffFiltered.forEach((t) => {
      if (!t.startDate) return;
      const key = t.startDate.toISOString().slice(0, 10);
      if (!map.has(key)) {
        map.set(key, { date: t.startDate, tasks: [] });
      }
      map.get(key).tasks.push(t);
    });

    return Array.from(map.values()).sort((a, b) => a.date - b.date);
  }, [staffFiltered]);

  // legenda staff (solo per quelli filtrati)
  const staffLegend = useMemo(() => {
    const counts = {};
    staffFiltered.forEach((t) => {
      const typeKey = t.task_type || t.type || "other";
      counts[typeKey] = (counts[typeKey] || 0) + 1;
    });

    return Object.entries(counts).map(([type, count]) => {
      const meta = taskTypeMeta(type);
      return { type, count, meta };
    });
  }, [staffFiltered]);

  // --- KPI mini dashboard ---

  const kpi = useMemo(() => {
    if (!rangeStart || !rangeEnd) {
      return {
        nightsTotal: 0,
        nightsOccupied: 0,
        occupancyRate: 0,
        revenue: 0,
        staffCount: 0,
        staffCost: 0,
      };
    }

    const nightsTotal = totalDays; // singola unità
    let nightsOccupied = 0;
    let revenue = 0;

    bookings.forEach((b) => {
      const start = b.startDate < rangeStart ? rangeStart : b.startDate;
      const end =
        !b.endDate || b.endDate > rangeEnd ? rangeEnd : b.endDate;
      const n = Math.max(0, Math.round((end - start) / MS_PER_DAY));
      nightsOccupied += n;

      let bookingRevenue = 0;
      if (b.total_price != null) {
        bookingRevenue = Number(b.total_price);
      } else if (b.nightly_rate != null) {
        bookingRevenue = Number(b.nightly_rate) * n;
      }
      revenue += bookingRevenue;
    });

    const staffCount = staffFiltered.length;
    const staffCost = staffFiltered.reduce(
      (sum, t) => sum + (t.cost || 0),
      0
    );

    const occupancyRate =
      nightsTotal > 0 ? (nightsOccupied / nightsTotal) * 100 : 0;

    return {
      nightsTotal,
      nightsOccupied,
      occupancyRate,
      revenue,
      staffCount,
      staffCost,
    };
  }, [bookings, staffFiltered, rangeStart, rangeEnd, totalDays]);

  // --- styles ---

  const wrapper = {
    display: "flex",
    flexDirection: "column",
    gap: 16,
  };

  const pill = {
    fontSize: 11,
    padding: "3px 10px",
    borderRadius: 999,
    background: "var(--color-info-soft)",
    color: "var(--color-primary)",
    border: "1px solid var(--color-info)",
  };

  const card = {
    backgroundColor: "var(--color-surface)",
    borderRadius: "14px",
    padding: "16px 18px",
    boxShadow: "var(--shadow-sm)",
    border: "1px solid var(--color-border)",
  };

  const rangeControls = {
    display: "flex",
    gap: 8,
    alignItems: "center",
    fontSize: 12,
  };

  const input = {
    borderRadius: 8,
    border: "1px solid var(--color-border-strong)",
    padding: "6px 8px",
    fontSize: 13,
  };

  const timelineRow = {
    display: "grid",
    gridTemplateColumns: "130px 1fr 120px",
    alignItems: "center",
    gap: 12,
    fontSize: 13,
    padding: "6px 0",
  };

  const tag = (bg, color) => ({
    display: "inline-flex",
    alignItems: "center",
    padding: "3px 10px",
    borderRadius: 999,
    fontSize: 12,
    fontWeight: 500,
    backgroundColor: bg,
    color,
  });

  const track = {
    position: "relative",
    height: 26,
    borderRadius: 999,
    backgroundColor: "var(--color-surface-soft)",
    overflow: "hidden",
  };

  const bookingBarBase = {
    position: "absolute",
    top: 4,
    bottom: 4,
    borderRadius: 999,
    background:
      "linear-gradient(90deg, color-mix(in srgb, var(--color-success) 15%, transparent), color-mix(in srgb, var(--color-success) 45%, transparent))",
    border: "1px solid color-mix(in srgb, var(--color-success) 50%, transparent)",
    display: "flex",
    alignItems: "center",
    paddingLeft: 8,
    paddingRight: 8,
    fontSize: 12,
    color: "var(--color-success-strong)",
    overflow: "hidden",
    whiteSpace: "nowrap",
    textOverflow: "ellipsis",
    cursor: "pointer",
  };

  const dotBase = {
    position: "absolute",
    top: 5,
    bottom: 5,
    width: 18,
    marginLeft: -9,
    borderRadius: 999,
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 10,
    color: "var(--color-on-primary)",
  };

  const legendRow = {
    display: "flex",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 10,
    fontSize: 11,
    color: "var(--color-text-muted)",
  };

  const kpiGrid = {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
    gap: 10,
    marginBottom: 10,
  };

  const kpiCard = {
    background: "var(--color-surface-soft)",
    borderRadius: "12px",
    padding: "10px 12px",
  };

  const filtersBar = {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 10,
    marginBottom: 8,
    flexWrap: "wrap",
    fontSize: 12,
  };

  const segmentBtn = (active) => ({
    borderRadius: 999,
    border: active ? "1px solid var(--color-primary)" : "1px solid var(--color-border-strong)",
    padding: "4px 10px",
    fontSize: 12,
    backgroundColor: active ? "var(--color-primary)" : "var(--color-surface)",
    color: active ? "var(--color-on-primary)" : "var(--color-text)",
    cursor: "pointer",
  });

  // --- Modal riutilizzabile ---

  const modalOverlay = {
    position: "fixed",
    inset: 0,
    backgroundColor: "var(--color-overlay)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 50,
  };

  const modalCard = {
    backgroundColor: "var(--color-surface)",
    borderRadius: 16,
    padding: "18px 20px",
    width: "100%",
    maxWidth: 420,
    boxShadow: "var(--shadow-lg)",
    border: "1px solid var(--color-border)",
  };

  function Modal({ title, onClose, children }) {
    return (
      <div style={modalOverlay} onClick={onClose}>
        <div style={modalCard} onClick={(e) => e.stopPropagation()}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 8,
            }}
          >
            <h2 style={{ fontSize: 16, margin: 0 }}>{title}</h2>
            <button
              style={{
                borderRadius: 999,
                border: "1px solid var(--color-border)",
                padding: "4px 8px",
                background: "var(--color-surface-soft)",
                cursor: "pointer",
                fontSize: 14,
                color: "var(--color-text-muted)",
              }}
              onClick={onClose}
            >
              ×
            </button>
          </div>
          {children}
        </div>
      </div>
    );
  }

  // tooltip testuale per cluster
  function buildClusterTooltip(cluster) {
    const { date, tasks } = cluster;
    const counts = {};
    tasks.forEach((t) => {
      const key = t.task_type || t.type || "other";
      const meta = taskTypeMeta(key);
      const label = meta.label;
      counts[label] = (counts[label] || 0) + 1;
    });
    const parts = Object.entries(counts).map(
      ([label, count]) => `${label}: ${count}`
    );
    const dateStr = formatDate(date);
    return `${dateStr} – ${tasks.length} task\n${parts.join(" · ")}`;
  }

  return (
    <div style={wrapper}>
      <PageHeader
        title={unitName || `Unità #${unitId}`}
        subtitle="Timeline PMS: vista orizzontale delle prenotazioni e dei task staff per questa unità."
        breadcrumb={[
          { label: "Appartamenti", href: "/units" },
          { label: unitName || `Unità #${unitId}` },
        ]}
        actions={
          <div>
            <div style={{ marginBottom: 4, fontSize: 12, color: "var(--color-text-muted)" }}>
              Intervallo visualizzato
            </div>
            <div style={rangeControls}>
              <input
                type="date"
                style={input}
                value={fromDate || ""}
                onChange={(e) => setFromDate(e.target.value)}
              />
              <span>→</span>
              <input
                type="date"
                style={input}
                value={toDate || ""}
                onChange={(e) => setToDate(e.target.value)}
              />
            </div>
            <div style={{ textAlign: "right", marginTop: 4 }}>
              <span style={pill}>
                Giorni nel range: <strong>{totalDays || "—"}</strong>
              </span>
            </div>
          </div>
        }
      />

      <UnitViewTabs unitId={unitId} active="timeline" />

      {error && (
        <p style={{ color: "var(--color-danger)", fontSize: 12 }}>Errore: {error}</p>
      )}

      {loading ? (
        <p>Caricamento timeline...</p>
      ) : (
        <div style={card}>
          {/* KPI unità */}
          <div style={kpiGrid}>
            <div style={kpiCard}>
              <div style={{ fontSize: 11, color: "var(--color-text-muted)" }}>
                Occupazione nel periodo
              </div>
              <div
                style={{ fontSize: 20, fontWeight: 700, marginTop: 2 }}
              >
                {kpi.nightsOccupied}/{kpi.nightsTotal} notti
              </div>
              <div style={{ fontSize: 11, color: "var(--color-text-subtle)" }}>
                {kpi.nightsTotal > 0
                  ? `${kpi.occupancyRate.toFixed(1)}% occupazione`
                  : "Nessuna notte nel range"}
              </div>
            </div>

            <div style={kpiCard}>
              <div style={{ fontSize: 11, color: "var(--color-text-muted)" }}>
                Revenue stimato unità
              </div>
              <div
                style={{ fontSize: 20, fontWeight: 700, marginTop: 2 }}
              >
                € {kpi.revenue.toFixed(2)}
              </div>
              <div style={{ fontSize: 11, color: "var(--color-text-subtle)" }}>
                Calcolato da total_price o nightly_rate
              </div>
            </div>

            <div style={kpiCard}>
              <div style={{ fontSize: 11, color: "var(--color-text-muted)" }}>
                Task staff per l&apos;unità
              </div>
              <div
                style={{ fontSize: 20, fontWeight: 700, marginTop: 2 }}
              >
                {kpi.staffCount} task
              </div>
              <div style={{ fontSize: 11, color: "var(--color-text-subtle)" }}>
                Costo stimato: € {kpi.staffCost.toFixed(2)}
              </div>
            </div>
          </div>

          {/* Filtri veloci */}
          <div style={filtersBar}>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              <button
                type="button"
                style={segmentBtn(viewMode === "both")}
                onClick={() => setViewMode("both")}
              >
                Prenotazioni + task
              </button>
              <button
                type="button"
                style={segmentBtn(viewMode === "bookings")}
                onClick={() => setViewMode("bookings")}
              >
                Solo prenotazioni
              </button>
              <button
                type="button"
                style={segmentBtn(viewMode === "staff")}
                onClick={() => setViewMode("staff")}
              >
                Solo task staff
              </button>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
                Tipo task:
              </span>
              <select
                style={{ ...input, padding: "4px 8px" }}
                value={taskTypeFilter}
                onChange={(e) => setTaskTypeFilter(e.target.value)}
                disabled={viewMode === "bookings"}
              >
                <option value="all">Tutti</option>
                <option value="cleaning">Pulizie</option>
                <option value="checkin">Check-in</option>
                <option value="checkout">Check-out</option>
                <option value="breakfast">Colazioni</option>
                <option value="maintenance">Manutenzione</option>
                <option value="other">Altro</option>
              </select>
            </div>
          </div>

          {/* Riga prenotazioni */}
          {(viewMode === "both" || viewMode === "bookings") && (
            <div style={timelineRow}>
              <div>
                <span style={tag("var(--color-success-soft)", "var(--color-success-strong)")}>Prenotazioni</span>
              </div>
              <div style={track}>
                {bookings.map((b) => {
                  const { left, width } = calcBar(
                    b.startDate,
                    b.endDate
                  );
                  return (
                    <div
                      key={`booking-${b.id}`}
                      style={{ ...bookingBarBase, left, width }}
                      title={`${b.label || ""} ${formatDate(
                        b.startDate
                      )} → ${formatDate(b.endDate)}`}
                      onClick={() => setSelectedBooking(b)}
                    >
                      {b.label || `Booking #${b.id}`}
                    </div>
                  );
                })}
              </div>
              <div
                style={{
                  textAlign: "right",
                  fontSize: 12,
                  color: "var(--color-text-muted)",
                }}
              >
                {rangeStart && rangeEnd
                  ? `${formatDate(rangeStart)} → ${formatDate(
                      rangeEnd
                    )}`
                  : "—"}
              </div>
            </div>
          )}

          {/* Riga task staff (cluster per giorno) */}
          {(viewMode === "both" || viewMode === "staff") && (
            <div style={{ ...timelineRow, marginTop: 10 }}>
              <div>
                <span style={tag("var(--color-info-soft)", "var(--color-info-strong)")}>Task staff</span>
              </div>
              <div style={track}>
                {staffClusters.map((cluster) => {
                  const { date, tasks } = cluster;
                  const { left } = calcBar(date, date);

                  // tipo "dominante" nel cluster (per colore del dot)
                  const typeCounts = {};
                  tasks.forEach((t) => {
                    const typeKey = t.task_type || t.type || "other";
                    typeCounts[typeKey] =
                      (typeCounts[typeKey] || 0) + 1;
                  });
                  const dominantType =
                    Object.entries(typeCounts).sort(
                      (a, b) => b[1] - a[1]
                    )[0]?.[0] || "other";
                  const meta = taskTypeMeta(dominantType);

                  return (
                    <div
                      key={date.toISOString()}
                      style={{
                        ...dotBase,
                        left,
                        backgroundColor: meta.color,
                        boxShadow: meta.shadow,
                      }}
                      title={buildClusterTooltip(cluster)}
                      onClick={() => setSelectedCluster(cluster)}
                    >
                      {tasks.length > 1 ? tasks.length : ""}
                    </div>
                  );
                })}
              </div>
              <div
                style={{
                  textAlign: "right",
                  fontSize: 12,
                  color: "var(--color-text-muted)",
                }}
              >
                {staffFiltered.length > 0
                  ? `${staffFiltered.length} task nel range`
                  : "Nessun task staff nel range"}
              </div>
            </div>
          )}

          {/* Legenda tipi task */}
          {staffLegend.length > 0 && viewMode !== "bookings" && (
            <div style={legendRow}>
              {staffLegend.map(({ type, count, meta }) => (
                <span
                  key={type}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "4px 8px",
                    borderRadius: 999,
                    backgroundColor: "var(--color-surface-soft)",
                    border: "1px solid var(--color-border)",
                  }}
                >
                  <span
                    style={{
                      width: 10,
                      height: 10,
                      borderRadius: 999,
                      backgroundColor: meta.color,
                      boxShadow: meta.shadow,
                    }}
                  />
                  <span>
                    {meta.label} · {count}
                  </span>
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Modale prenotazione */}
      {selectedBooking && (
        <Modal
          title="Dettaglio prenotazione"
          onClose={() => setSelectedBooking(null)}
        >
          <div style={{ fontSize: 13, color: "var(--color-text)" }}>
            <div style={{ marginBottom: 6 }}>
              <strong>Ospite:</strong>{" "}
              {selectedBooking.guest_name || "—"}
            </div>
            <div style={{ marginBottom: 6 }}>
              <strong>Date:</strong>{" "}
              {formatDate(selectedBooking.startDate)} →{" "}
              {formatDate(selectedBooking.endDate)}
            </div>
            {selectedBooking.total_price != null && (
              <div style={{ marginBottom: 6 }}>
                <strong>Totale:</strong> €{" "}
                {Number(selectedBooking.total_price).toFixed(2)}
              </div>
            )}
            {selectedBooking.source && (
              <div style={{ marginBottom: 6 }}>
                <strong>Canale:</strong> {selectedBooking.source}
              </div>
            )}
            {selectedBooking.notes && (
              <div style={{ marginBottom: 6 }}>
                <strong>Note:</strong> {selectedBooking.notes}
              </div>
            )}
          </div>
          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              gap: 8,
              marginTop: 12,
              fontSize: 13,
            }}
          >
            <button
              type="button"
              style={{
                borderRadius: 999,
                border: "1px solid var(--color-border-strong)",
                padding: "6px 12px",
                background: "var(--color-surface)",
                color: "var(--color-text)",
                cursor: "pointer",
              }}
              onClick={() => setSelectedBooking(null)}
            >
              Chiudi
            </button>
            <button
              type="button"
              style={{
                borderRadius: 999,
                border: "none",
                padding: "6px 12px",
                background: "var(--color-primary)",
                color: "var(--color-on-primary)",
                cursor: "pointer",
              }}
              onClick={() => {
                navigate("/bookings");
                setSelectedBooking(null);
              }}
            >
              Apri in Prenotazioni
            </button>
          </div>
        </Modal>
      )}

      {/* Modale cluster task staff */}
      {selectedCluster && (
        <Modal
          title="Task staff in questo giorno"
          onClose={() => setSelectedCluster(null)}
        >
          <div style={{ fontSize: 13, color: "var(--color-text)" }}>
            <div style={{ marginBottom: 6 }}>
              <strong>Data:</strong> {formatDate(selectedCluster.date)}
            </div>
            <div style={{ marginBottom: 8 }}>
              <strong>Task totali:</strong> {selectedCluster.tasks.length}
            </div>
            <div
              style={{
                maxHeight: 260,
                overflowY: "auto",
                borderRadius: 10,
                border: "1px solid var(--color-border)",
                padding: "6px 8px",
                background: "var(--color-surface-soft)",
              }}
            >
              {selectedCluster.tasks.map((t) => {
                const typeKey = t.task_type || t.type || "other";
                const meta = taskTypeMeta(typeKey);
                return (
                  <div
                    key={t.id}
                    style={{
                      padding: "6px 4px",
                      borderBottom: "1px solid var(--color-border)",
                      fontSize: 12,
                      display: "flex",
                      flexDirection: "column",
                      gap: 2,
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        gap: 8,
                      }}
                    >
                      <span
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 6,
                        }}
                      >
                        <span
                          style={{
                            width: 8,
                            height: 8,
                            borderRadius: 999,
                            backgroundColor: meta.color,
                            boxShadow: meta.shadow,
                          }}
                        />
                        <strong>{meta.label}</strong>
                      </span>
                      {t.status && (
                        <span
                          style={{
                            fontSize: 11,
                            padding: "2px 8px",
                            borderRadius: 999,
                            border: "1px solid var(--color-border-strong)",
                            background: "var(--color-surface)",
                          }}
                        >
                          {t.status}
                        </span>
                      )}
                    </div>
                    {t.assignee_name && (
                      <div>
                        <strong>Staff:</strong> {t.assignee_name}
                      </div>
                    )}
                    {t.cost != null && (
                      <div>
                        <strong>Costo:</strong> {t.currency || "EUR"}{" "}
                        {Number(t.cost).toFixed(2)}
                      </div>
                    )}
                    {t.notes && (
                      <div
                        style={{ color: "var(--color-text-muted)", fontSize: 11 }}
                        title={t.notes}
                      >
                        {t.notes}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              gap: 8,
              marginTop: 12,
              fontSize: 13,
            }}
          >
            <button
              type="button"
              style={{
                borderRadius: 999,
                border: "1px solid var(--color-border-strong)",
                padding: "6px 12px",
                background: "var(--color-surface)",
                color: "var(--color-text)",
                cursor: "pointer",
              }}
              onClick={() => setSelectedCluster(null)}
            >
              Chiudi
            </button>
            <button
              type="button"
              style={{
                borderRadius: 999,
                border: "none",
                padding: "6px 12px",
                background: "var(--color-primary)",
                color: "var(--color-on-primary)",
                cursor: "pointer",
              }}
              onClick={() => {
                navigate("/staff");
                setSelectedCluster(null);
              }}
            >
              Apri in Staff
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

export default UnitTimeline;
