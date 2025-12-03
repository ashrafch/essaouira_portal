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

function formatDate(d) {
  if (!d) return "";
  return new Date(d).toLocaleDateString("it-IT");
}

function whatsappLink(phone) {
  if (!phone) return null;
  // Rimuove tutto tranne numeri e +
  const clean = phone.replace(/[^0-9+]/g, "");
  return `https://wa.me/${clean}`;
}

function ArrivalsDepartures() {
  const todayStr = new Date().toISOString().slice(0, 10);
  const navigate = useNavigate();

  // se la tua pagina staff ha un path diverso, cambia qui
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

  // Stato per il modale messaggi
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

  // carica dati ogni volta che cambia la data
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

  // ---- derivati filtrati per giorno + unità ----

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

  // ---- azioni ----

  function openMessageModal(b) {
    setSelectedBookingForMessage(b);
    setMessageModalOpen(true);
  }

  async function handleMarkPaid(b) {
    if (b.is_paid) return;
    setSavingBookingId(b.id);
    try {
      // Nota: inviamo tutti i campi necessari per l'update
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
      alert("Errore nel segnare la prenotazione come pagata: " + err.message);
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
      alert("Errore nel cambiare lo stato del task: " + err.message);
    } finally {
      setSavingTaskId(null);
    }
  }

  function openBooking(b) {
    navigate("/bookings", { state: { editBookingId: b.id } });
  }

  function openStaffForBooking(b) {
    navigate(STAFF_ROUTE, {
      state: { bookingId: b.id, date: selectedDate },
    });
  }

  function openStaffForDate() {
    navigate(STAFF_ROUTE, { state: { date: selectedDate } });
  }

  function getTaskLabel(t) {
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

  const header = {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-end",
    marginBottom: 4,
    flexWrap: "wrap",
    gap: 8,
  };

  const cardGrid = {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
    gap: 12,
  };

  const card = {
    background: "white",
    borderRadius: 14,
    padding: 12,
    boxShadow: "0 1px 3px rgba(15,23,42,0.08)",
    border: "1px solid #e5e7eb",
  };

  const sectionTitle = {
    fontSize: 13,
    fontWeight: 600,
    marginBottom: 6,
    color: "#111827",
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
    borderBottom: "1px solid #e5e7eb",
    padding: "6px 4px",
    color: "#6b7280",
    fontSize: 11,
  };

  const td = {
    borderBottom: "1px solid #f3f4f6",
    padding: "6px 4px",
    verticalAlign: "top",
  };

  const smallButton = {
    borderRadius: 999,
    border: "1px solid #d1d5db",
    padding: "4px 10px",
    color: "#374151",
    fontSize: 11,
    background: "white",
    cursor: "pointer",
  };

  const iconButton = {
    ...smallButton,
    padding: 0,
    width: 24,
    height: 24,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: "999px",
  };

  const pillStatus = (paid) =>
    badge(
      paid ? "#dcfce7" : "#fee2e2",
      paid ? "#166534" : "#b91c1c",
      paid ? "#16a34a" : "#ef4444"
    );

  const pillTaskStatus = (status) =>
    badge(
      status === "done" ? "#dcfce7" : "#e5e7eb",
      status === "done" ? "#166534" : "#374151",
      status === "done" ? "#16a34a" : "#d1d5db"
    );

  const pillLate = badge("#fef9c3", "#92400e", "#facc15");

  const pillWarning = badge("#fee2e2", "#b91c1c", "#fecaca");

  const filtersRow = {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 8,
    fontSize: 12,
  };

  return (
    <div style={page}>
      <div style={header}>
        <div>
          <h1 style={{ marginBottom: 4 }}>Arrivi & Partenze</h1>
          <p style={{ fontSize: 13, color: "#6b7280" }}>
            Vista operativa del giorno: check-in, check-out e task staff.
          </p>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <div>
              <label
                style={{
                  fontSize: 11,
                  color: "#6b7280",
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
                  border: "1px solid #d1d5db",
                  padding: "6px 8px",
                  fontSize: 13,
                }}
              />
            </div>
            <div>
              <label
                style={{
                  fontSize: 11,
                  color: "#6b7280",
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
                  border: "1px solid #d1d5db",
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
            <button
              type="button"
              style={smallButton}
              onClick={() => setSelectedDate(todayStr)}
            >
              Oggi
            </button>
            <button
              type="button"
              style={{
                ...smallButton,
                borderColor: "#0f766e",
                color: "#0f766e",
              }}
              onClick={openStaffForDate}
            >
              Vai a task staff del giorno
            </button>
          </div>
        </div>
      </div>

      {error && (
        <p style={{ color: "red", fontSize: 12, marginBottom: 4 }}>{error}</p>
      )}

      {loading ? (
        <p style={{ fontSize: 13 }}>Caricamento dati operativi...</p>
      ) : (
        <>
          <div style={filtersRow}>
            <span>
              Arrivi: <strong>{arrivals.length}</strong>
            </span>
            <span>
              Partenze: <strong>{departures.length}</strong>
            </span>
            <span>
              Task staff: <strong>{visibleStaffTasks.length}</strong>
            </span>
          </div>

          <div style={cardGrid}>
            {/* ARRIVI */}
            <div style={card}>
              <div style={sectionTitle}>
                Arrivi ({arrivals.length}) · {formatDate(selectedDate)}
              </div>
              {arrivals.length === 0 ? (
                <p style={{ fontSize: 12, color: "#6b7280" }}>
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
                              <div style={{ fontSize: 11, color: "#4b5563", display: "flex", gap: 6, flexWrap: "wrap" }}>
                                <span>
                                  👥 {(b.num_adults || 1) + (b.num_children || 0)} pax
                                </span>
                                {b.estimated_arrival_time && (
                                  <span style={{ color: "#0f766e", fontWeight: 500 }}>
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
                                    style={{ fontSize: 11, color: "#2563eb", textDecoration: "none", marginRight: 6 }}
                                  >
                                    <span>📞</span> {b.guest_phone}
                                  </a>
                                  <button
                                    type="button"
                                    title="Invia Messaggio Template"
                                    style={{
                                        ...iconButton,
                                        backgroundColor: "#dcfce7",
                                        color: "#166534",
                                        border: "1px solid #86efac",
                                        fontSize: 12,
                                    }}
                                    onClick={() => openMessageModal(b)}
                                  >
                                    💬
                                  </button>
                                </div>
                              )}
                              
                              <span style={{ fontSize: 11, color: "#9ca3af", marginTop: 2 }}>
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
                                color: "#4b5563",
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
                              <span style={{ fontSize: 11, color: "#9ca3af" }}>
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
                              <button
                                type="button"
                                style={{
                                  ...smallButton,
                                  borderColor: b.is_paid
                                    ? "#d1d5db"
                                    : "#16a34a",
                                  color: b.is_paid ? "#6b7280" : "#166534",
                                }}
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
                              </button>
                              <button
                                type="button"
                                style={{
                                  ...smallButton,
                                  borderColor: "#0f766e",
                                  color: "#0f766e",
                                }}
                                onClick={() => openBooking(b)}
                              >
                                Dettagli
                              </button>
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
                <p style={{ fontSize: 12, color: "#6b7280" }}>
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
                                  backgroundColor: "#fef2f2",
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
                              <span style={{ fontSize: 11, color: "#6b7280" }}>
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
                                <span style={{ fontSize: 11, color: "#9ca3af" }}>
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
                              <button
                                type="button"
                                style={{
                                  ...smallButton,
                                  borderColor: "#0f766e",
                                  color: "#0f766e",
                                }}
                                onClick={() => openBooking(b)}
                              >
                                Apri prenotazione
                              </button>
                              <button
                                type="button"
                                style={{
                                  ...smallButton,
                                  borderColor: "#6366f1",
                                  color: "#4338ca",
                                }}
                                onClick={() => openStaffForBooking(b)}
                              >
                                Vedi task staff
                              </button>
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

          {/* TASK STAFF DEL GIORNO */}
          <div style={card}>
            <div
              style={{
                ...sectionTitle,
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <span>
                Task staff del {formatDate(selectedDate)} (
                {visibleStaffTasks.length})
              </span>
              <button
                type="button"
                style={{
                  ...smallButton,
                  borderColor: "#0f766e",
                  color: "#0f766e",
                }}
                onClick={openStaffForDate}
              >
                Apri pagina staff
              </button>
            </div>
            {visibleStaffTasks.length === 0 ? (
              <p style={{ fontSize: 12, color: "#6b7280" }}>
                Nessun task staff pianificato per questa data (con i filtri
                attuali).
              </p>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={table}>
                  <thead>
                    <tr>
                      <th style={th}>Ora</th>
                      <th style={th}>Tipo</th>
                      <th style={th}>Unità</th>
                      <th style={th}>Assegnato a</th>
                      <th style={th}>Stato</th>
                      <th style={th}>Costo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleStaffTasks.map((t) => {
                      const unit = t.unit_id ? unitMap[t.unit_id] : null;
                      return (
                        <tr key={t.id}>
                          <td style={td}>{t.time || "—"}</td>
                          <td style={td}>{getTaskLabel(t)}</td>
                          <td style={td}>
                            {unit?.name ||
                              (t.unit_id ? `Unit #${t.unit_id}` : "—")}
                          </td>
                          <td style={td}>{t.assignee_name || "—"}</td>
                          <td style={td}>
                            <button
                              type="button"
                              style={pillTaskStatus(t.status)}
                              onClick={() => handleToggleTaskStatus(t)}
                              disabled={savingTaskId === t.id}
                            >
                              {savingTaskId === t.id
                                ? "..."
                                : t.status === "done"
                                ? "Fatto"
                                : "Da fare"}
                            </button>
                          </td>
                          <td style={td}>
                            {t.cost != null ? (
                              <>
                                {t.currency || "EUR"}{" "}
                                {Number(t.cost).toFixed(2)}
                              </>
                            ) : (
                              <span style={{ fontSize: 11, color: "#9ca3af" }}>
                                non impostato
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
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