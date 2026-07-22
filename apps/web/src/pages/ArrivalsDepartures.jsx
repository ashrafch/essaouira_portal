import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  getBookings,
  getStaffTasks,
  getUnits,
  updateBooking,
  updateStaffTask,
} from "../services/api";
import MessageModal from "../components/MessageModal";
import { PageHeader, Button, useToast } from "../components/ui";
import {
  CalendarDays,
  ClipboardList,
  Wallet,
  Eye,
  Printer,
  Cpu,
  MessageCircle,
} from "lucide-react";

function formatDate(d) {
  if (!d) return "";
  return new Date(d).toLocaleDateString("it-IT");
}

function whatsappLink(phone) {
  if (!phone) return null;
  const clean = phone.replace(/[^0-9+]/g, "");
  return `https://wa.me/${clean}`;
}

function ArrivalsDepartures() {
  const todayStr = new Date().toISOString().slice(0, 10);
  const navigate = useNavigate();
  const toast = useToast();

  const STAFF_ROUTE = "/staff";

  const [selectedDate, setSelectedDate] = useState(todayStr);
  const [unitFilter, setUnitFilter] = useState("all");

  const [bookings, setBookings] = useState([]);
  const [staffTasks, setStaffTasks] = useState([]);
  const [units, setUnits] = useState([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [savingBookingId, setSavingBookingId] = useState(null);
  const [savingTaskId, setSavingTaskId] = useState(null);

  const [messageModalOpen, setMessageModalOpen] = useState(false);
  const [selectedBookingForMessage, setSelectedBookingForMessage] = useState(null);

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
        const [bookingsResp, tasksResp, unitsResp] = await Promise.all([
          getBookings(),
          getStaffTasks({ date: selectedDate }),
          getUnits(),
        ]);
        setBookings(bookingsResp || []);
        setStaffTasks(tasksResp || []);
        setUnits(unitsResp || []);
      } catch (err) {
        setError(err.message || "Errore caricando dati operativi");
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [selectedDate]);

  const arrivals = useMemo(
    () =>
      bookings.filter((b) => {
        const isDay = b.checkin_date === selectedDate;
        const matchUnit =
          unitFilter === "all" ? true : String(b.unit_id) === unitFilter;
        return isDay && matchUnit;
      }),
    [bookings, selectedDate, unitFilter]
  );

  const departures = useMemo(
    () =>
      bookings.filter((b) => {
        const isDay = b.checkout_date === selectedDate;
        const matchUnit =
          unitFilter === "all" ? true : String(b.unit_id) === unitFilter;
        return isDay && matchUnit;
      }),
    [bookings, selectedDate, unitFilter]
  );

  const visibleStaffTasks = useMemo(
    () =>
      staffTasks.filter((t) =>
        unitFilter === "all"
          ? true
          : t.unit_id != null && String(t.unit_id) === unitFilter
      ),
    [staffTasks, unitFilter]
  );

  const tasksByBookingId = useMemo(() => {
    const map = {};
    for (const t of staffTasks) {
      if (!t.booking_id) continue;
      if (!map[t.booking_id]) map[t.booking_id] = [];
      map[t.booking_id].push(t);
    }
    return map;
  }, [staffTasks]);

  function openMessageModal(b) {
    setSelectedBookingForMessage(b);
    setMessageModalOpen(true);
  }

  function openDocument(b) {
    // Apre la pagina di stampa in una nuova scheda
    window.open(`/bookings/${b.id}/document`, "_blank");
  }

  async function handleMarkPaid(b) {
    if (b.is_paid) return;
    setSavingBookingId(b.id);
    try {
      const payload = {
        unit_id: b.unit_id,
        guest_name: b.guest_name,
        guest_email: b.guest_email,
        guest_phone: b.guest_phone,
        num_adults: b.num_adults,
        num_children: b.num_children,
        estimated_arrival_time: b.estimated_arrival_time,
        
        source: b.source,
        checkin_date: b.checkin_date,
        checkout_date: b.checkout_date,
        notes: b.notes,
        nightly_rate: b.nightly_rate,
        total_price: b.total_price,
        cleaning_fee: b.cleaning_fee,
        city_tax: b.city_tax,
        channel_fee: b.channel_fee,
        currency: b.currency || "EUR",
        is_paid: true,
        has_late_checkout: b.has_late_checkout || false,
      };

      const updated = await updateBooking(b.id, payload);
      setBookings((prev) =>
        prev.map((bk) => (bk.id === updated.id ? updated : bk))
      );
    } catch (err) {
      toast.error("Errore nel segnare la prenotazione come pagata: " + err.message);
    } finally {
      setSavingBookingId(null);
    }
  }

  async function handleToggleTaskStatus(task) {
    const newStatus = task.status === "done" ? "planned" : "done";
    setSavingTaskId(task.id);
    try {
      const payload = {
        date: task.date,
        time: task.time,
        task_type: task.task_type,
        assignee_name: task.assignee_name,
        estimated_hours: task.estimated_hours,
        status: newStatus,
        notes: task.notes,
        cost: task.cost,
        currency: task.currency || "EUR",
        booking_id: task.booking_id,
        unit_id: task.unit_id,
      };
      const updated = await updateStaffTask(task.id, payload);
      setStaffTasks((prev) =>
        prev.map((t) => (t.id === updated.id ? updated : t))
      );
    } catch (err) {
      toast.error("Errore nel cambiare lo stato del task: " + err.message);
    } finally {
      setSavingTaskId(null);
    }
  }

  function openBooking(b) {
    navigate("/bookings", { state: { editBookingId: b.id } });
  }

  function _openStaffForBooking(b) {
    navigate(STAFF_ROUTE, {
      state: { bookingId: b.id, date: selectedDate },
    });
  }

  function openStaffForDate() {
    navigate(STAFF_ROUTE, { state: { date: selectedDate } });
  }

  function _getTaskLabel(t) {
    if (t.task_type === "checkin") return "Check-in";
    if (t.task_type === "checkout") return "Check-out";
    if (t.task_type === "cleaning") return "Pulizia";
    if (t.task_type === "breakfast") return "Colazione";
    return t.task_type || "Altro";
  }

  // ---- styles ----

  const page = {
    display: "flex",
    flexDirection: "column",
    gap: 16,
  };

  const cardGrid = {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
    gap: 12,
  };

  const card = {
    background: "var(--color-surface)",
    borderRadius: 14,
    padding: 12,
    boxShadow: "var(--shadow-sm)",
    border: "1px solid var(--color-border)",
  };

  const sectionTitle = {
    fontSize: 13,
    fontWeight: 600,
    marginBottom: 6,
    color: "var(--color-text)",
  };

  const badge = (bg, color, border) => ({
    display: "inline-flex",
    alignItems: "center",
    padding: "2px 8px",
    borderRadius: 999,
    fontSize: 11,
    backgroundColor: bg,
    color,
    border: border ? `1px solid ${border}` : "none",
  });

  const table = {
    width: "100%",
    borderCollapse: "collapse",
    fontSize: 12,
  };

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

  const pillStatus = (paid) =>
    badge(
      paid ? "var(--color-success-soft)" : "var(--color-danger-soft)",
      paid ? "var(--color-success-strong)" : "var(--color-danger-strong)",
      paid ? "var(--color-success)" : "var(--color-danger)"
    );

  const pillTaskStatus = (status) =>
    badge(
      status === "done" ? "var(--color-success-soft)" : "var(--color-border)",
      status === "done" ? "var(--color-success-strong)" : "var(--color-text)",
      status === "done" ? "var(--color-success)" : "var(--color-border-strong)"
    );

  const pillLate = badge("var(--color-warning-soft)", "var(--color-warning-strong)", "var(--color-warning)");

  const pillWarning = badge("var(--color-danger-soft)", "var(--color-danger-strong)", "var(--color-danger)");

  const _filtersRow = {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 8,
    fontSize: 12,
  };

  return (
    <div style={page}>
      <PageHeader
        title="Arrivi & Partenze"
        subtitle="Vista operativa del giorno: check-in, check-out e task staff."
        actions={
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <div>
                <label
                  style={{
                    fontSize: 11,
                    color: "var(--color-text-muted)",
                    marginRight: 6,
                  }}
                >
                  Giorno
                </label>
                <input
                  type="date"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  style={{
                    borderRadius: 8,
                    border: "1px solid var(--color-border-strong)",
                    padding: "6px 8px",
                    fontSize: 13,
                  }}
                />
              </div>
              <div>
                <label
                  style={{
                    fontSize: 11,
                    color: "var(--color-text-muted)",
                    marginRight: 6,
                  }}
                >
                  Unità
                </label>
                <select
                  value={unitFilter}
                  onChange={(e) => setUnitFilter(e.target.value)}
                  style={{
                    borderRadius: 8,
                    border: "1px solid var(--color-border-strong)",
                    padding: "6px 8px",
                    fontSize: 13,
                    minWidth: 140,
                  }}
                >
                  <option value="all">Tutte le unità</option>
                  {units.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <Button
                variant="secondary"
                size="sm"
                icon={<CalendarDays size={16} />}
                onClick={() => setSelectedDate(todayStr)}
              >
                Oggi
              </Button>
              <Button
                variant="primary"
                size="sm"
                icon={<ClipboardList size={16} />}
                onClick={openStaffForDate}
              >
                Vai a task staff del giorno
              </Button>
            </div>
          </div>
        }
      />

      {error && (
        <p style={{ color: "var(--color-danger)", fontSize: 12, marginBottom: 4 }}>{error}</p>
      )}

      {loading ? (
        <p style={{ fontSize: 13 }}>Caricamento dati operativi...</p>
      ) : (
        <>
          <div style={{ display: "flex", gap: 12, fontSize: 12, flexWrap: "wrap", alignItems: "center" }}>
            <span>Arrivi: <strong>{arrivals.length}</strong></span>
            <span>Partenze: <strong>{departures.length}</strong></span>
            <span>Task staff: <strong>{visibleStaffTasks.length}</strong></span>
          </div>

          <div style={cardGrid}>
            {/* ARRIVI */}
            <div style={card}>
              <div style={sectionTitle}>
                Arrivi ({arrivals.length}) · {formatDate(selectedDate)}
              </div>
              {arrivals.length === 0 ? (
                <p style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
                  Nessun check-in per questa data (con i filtri attuali).
                </p>
              ) : (
                <table style={table}>
                  <thead>
                    <tr>
                      <th style={th}>Ospite</th>
                      <th style={th}>Unità</th>
                      <th style={th}>Canale</th>
                      <th style={th}>Stato</th>
                      <th style={th}>Task</th>
                      <th style={th}>Azioni</th>
                    </tr>
                  </thead>
                  <tbody>
                    {arrivals.map((b) => {
                      const unit = unitMap[b.unit_id];
                      const relatedTasks = tasksByBookingId[b.id] || [];
                      const hasCheckin = relatedTasks.some(
                        (t) => t.task_type === "checkin"
                      );
                      const hasCleaning = relatedTasks.some(
                        (t) => t.task_type === "cleaning"
                      );
                      return (
                        <tr key={b.id}>
                          <td style={td}>
                            <div
                              style={{
                                display: "flex",
                                flexDirection: "column",
                                gap: 2,
                              }}
                            >
                              <span style={{ fontWeight: 600, fontSize: 13 }}>
                                {b.guest_name}
                              </span>

                              {/* NUOVI DETTAGLI OSPITE */}
                              <div style={{ fontSize: 11, color: "var(--color-text-muted)", display: "flex", gap: 6, flexWrap: "wrap" }}>
                                <span>
                                  👥 {(b.num_adults || 1) + (b.num_children || 0)} pax
                                </span>
                                {b.estimated_arrival_time && (
                                  <span style={{ color: "var(--color-primary)", fontWeight: 500 }}>
                                    🕒 {String(b.estimated_arrival_time).slice(0, 5)}
                                  </span>
                                )}
                              </div>

                              {b.guest_phone && (
                                <div style={{ marginTop: 2, display: "flex", alignItems: "center" }}>
                                  <a
                                    href={whatsappLink(b.guest_phone)}
                                    target="_blank"
                                    rel="noreferrer"
                                    style={{ fontSize: 11, color: "var(--color-info)", textDecoration: "none", marginRight: 6 }}
                                  >
                                    <span>📞</span> {b.guest_phone}
                                  </a>
                                  <Button
                                    variant="secondary"
                                    size="sm"
                                    icon={<MessageCircle size={16} />}
                                    title="Invia Messaggio Template"
                                    aria-label="Invia Messaggio Template"
                                    onClick={() => openMessageModal(b)}
                                  />
                                </div>
                              )}

                              <span style={{ fontSize: 11, color: "var(--color-text-subtle)", marginTop: 2 }}>
                                {b.nightly_rate != null &&
                                b.total_price != null
                                  ? `Soggiorno: ${b.nightly_rate} €/notte`
                                  : ""}
                              </span>
                            </div>
                          </td>
                          <td style={td}>{unit?.name || `Unit #${b.unit_id}`}</td>
                          <td style={td}>
                            <span
                              style={{
                                fontSize: 11,
                                color: "var(--color-text-muted)",
                                textTransform: "capitalize",
                              }}
                            >
                              {b.source === "direct"
                                ? "Diretta"
                                : b.source || "Altro"}
                            </span>
                          </td>
                          <td style={td}>
                            <div
                              style={{
                                display: "flex",
                                flexDirection: "column",
                                gap: 4,
                              }}
                            >
                              <span style={pillStatus(b.is_paid)}>
                                {b.is_paid ? "Pagata" : "Da incassare"}
                              </span>
                              {b.has_late_checkout && (
                                <span style={pillLate}>Late check-out</span>
                              )}
                            </div>
                          </td>
                          <td style={td}>
                            {relatedTasks.length === 0 ? (
                              <span style={{ fontSize: 11, color: "var(--color-text-subtle)" }}>
                                Nessun task collegato
                              </span>
                            ) : (
                              <div
                                style={{
                                  display: "flex",
                                  flexDirection: "column",
                                  gap: 2,
                                }}
                              >
                                {hasCheckin && (
                                  <span style={{ fontSize: 11 }}>
                                    • Check-in
                                  </span>
                                )}
                                {hasCleaning && (
                                  <span style={{ fontSize: 11 }}>
                                    • Pulizia
                                  </span>
                                )}
                                {!hasCheckin && !hasCleaning && (
                                  <span style={{ fontSize: 11 }}>
                                    • {relatedTasks.length} task
                                  </span>
                                )}
                              </div>
                            )}
                          </td>
                          <td style={td}>
                            <div
                              style={{
                                display: "flex",
                                flexDirection: "column",
                                gap: 4,
                              }}
                            >
                              <Button
                                variant="primary"
                                size="sm"
                                icon={<Wallet size={16} />}
                                disabled={
                                  b.is_paid || savingBookingId === b.id
                                }
                                onClick={() => handleMarkPaid(b)}
                              >
                                {b.is_paid
                                  ? "Incassato"
                                  : savingBookingId === b.id
                                  ? "Aggiorno..."
                                  : "Incassa"}
                              </Button>
                              <Button
                                variant="secondary"
                                size="sm"
                                icon={<Eye size={16} />}
                                onClick={() => openBooking(b)}
                              >
                                Dettagli
                              </Button>
                              <Button
                                variant="secondary"
                                size="sm"
                                icon={<Printer size={16} />}
                                onClick={() => openDocument(b)}
                              >
                                Stampa
                              </Button>
                              {b.unit_id != null && (
                                <Button
                                  variant="secondary"
                                  size="sm"
                                  icon={<Cpu size={16} />}
                                  title="Apri stato smart e readiness dispositivi dell'unità"
                                  onClick={() =>
                                    navigate(`/smart-units/${b.unit_id}`)
                                  }
                                >
                                  Stato smart
                                </Button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>

            {/* PARTENZE */}
            <div style={card}>
              <div style={sectionTitle}>
                Partenze ({departures.length}) · {formatDate(selectedDate)}
              </div>
              {departures.length === 0 ? (
                <p style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
                  Nessun check-out per questa data (con i filtri attuali).
                </p>
              ) : (
                <table style={table}>
                  <thead>
                    <tr>
                      <th style={th}>Ospite</th>
                      <th style={th}>Unità</th>
                      <th style={th}>Periodo</th>
                      <th style={th}>Check-out</th>
                      <th style={th}>Azioni</th>
                    </tr>
                  </thead>
                  <tbody>
                    {departures.map((b) => {
                      const unit = unitMap[b.unit_id];
                      const relatedTasks = tasksByBookingId[b.id] || [];
                      const checkoutTasks = relatedTasks.filter(
                        (t) => t.task_type === "checkout"
                      );
                      const cleaningTasks = relatedTasks.filter(
                        (t) => t.task_type === "cleaning"
                      );

                      const noCleaning = cleaningTasks.length === 0;

                      return (
                        <tr
                          key={b.id}
                          style={
                            noCleaning
                              ? {
                                  backgroundColor: "var(--color-danger-soft)",
                                }
                              : undefined
                          }
                        >
                          <td style={td}>
                            <div
                              style={{
                                display: "flex",
                                flexDirection: "column",
                                gap: 2,
                              }}
                            >
                              <span style={{ fontWeight: 500 }}>
                                {b.guest_name}
                              </span>
                              <span style={{ fontSize: 11, color: "var(--color-text-muted)" }}>
                                {b.total_price != null
                                  ? `Totale: ${b.total_price} ${
                                      b.currency || "EUR"
                                    }`
                                  : ""}
                              </span>
                              {noCleaning && (
                                <span style={{ ...pillWarning, marginTop: 2 }}>
                                  Nessuna pulizia associata alla partenza
                                </span>
                              )}
                            </div>
                          </td>
                          <td style={td}>{unit?.name || `Unit #${b.unit_id}`}</td>
                          <td style={td}>
                            <div
                              style={{
                                display: "flex",
                                flexDirection: "column",
                                gap: 2,
                              }}
                            >
                              <span style={{ fontSize: 12 }}>
                                {formatDate(b.checkin_date)} →{" "}
                                {formatDate(b.checkout_date)}
                              </span>
                              {b.has_late_checkout && (
                                <span style={pillLate}>Late check-out</span>
                              )}
                            </div>
                          </td>
                          <td style={td}>
                            {checkoutTasks.length === 0 ? (
                                <span style={{ fontSize: 11, color: "var(--color-text-subtle)" }}>
                                No task
                                </span>
                            ) : (
                              <div
                                style={{
                                  display: "flex",
                                  flexDirection: "column",
                                  gap: 4,
                                }}
                              >
                                {checkoutTasks.map((t) => (
                                  <div
                                    key={`co-${t.id}`}
                                    style={{
                                      display: "flex",
                                      justifyContent: "space-between",
                                      gap: 6,
                                      alignItems: "center",
                                    }}
                                  >
                                    <span style={{ fontSize: 11 }}>
                                      {t.time || "Any"}
                                    </span>
                                    <button
                                      type="button"
                                      style={pillTaskStatus(t.status)}
                                      onClick={() =>
                                        handleToggleTaskStatus(t)
                                      }
                                      disabled={savingTaskId === t.id}
                                    >
                                      {savingTaskId === t.id
                                        ? "..."
                                        : t.status === "done"
                                        ? "Fatto"
                                        : "Da fare"}
                                    </button>
                                  </div>
                                ))}
                              </div>
                            )}
                          </td>
                          <td style={td}>
                            <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                                <Button
                                  variant="secondary"
                                  size="sm"
                                  icon={<MessageCircle size={16} />}
                                  title="Invia Messaggio"
                                  aria-label="Invia Messaggio"
                                  onClick={() => openMessageModal(b)}
                                />
                                <Button
                                  variant="secondary"
                                  size="sm"
                                  icon={<Printer size={16} />}
                                  title="Stampa"
                                  aria-label="Stampa"
                                  onClick={() => openDocument(b)}
                                />
                                {b.unit_id != null && (
                                  <Button
                                    variant="secondary"
                                    size="sm"
                                    icon={<Cpu size={16} />}
                                    title="Apri stato smart e readiness dispositivi dell'unità"
                                    onClick={() =>
                                      navigate(`/smart-units/${b.unit_id}`)
                                    }
                                  >
                                    Stato smart
                                  </Button>
                                )}
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

          {/* MODALE MESSAGGI */}
          {messageModalOpen && selectedBookingForMessage && (
            <MessageModal
              isOpen={messageModalOpen}
              onClose={() => {
                setMessageModalOpen(false);
                setSelectedBookingForMessage(null);
              }}
              booking={selectedBookingForMessage}
              unitName={unitMap[selectedBookingForMessage.unit_id]?.name}
            />
          )}
        </>
      )}
    </div>
  );
}

export default ArrivalsDepartures;
