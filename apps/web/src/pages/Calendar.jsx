import { useEffect, useMemo, useState } from "react";
import useIsMobile from "../hooks/useIsMobile";
import { useNavigate } from "react-router-dom";
import { getBookings, getUnits, updateBooking } from "../services/api";
import db from "../offline/dbLocal";
import PageInfoHelp from "../components/PageInfoHelp";

const MONTH_LABELS = [
  "Gennaio",
  "Febbraio",
  "Marzo",
  "Aprile",
  "Maggio",
  "Giugno",
  "Luglio",
  "Agosto",
  "Settembre",
  "Ottobre",
  "Novembre",
  "Dicembre",
];

const WEEKDAY_LABELS = ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"];

function startOfDay(d) {
  const nd = new Date(d);
  nd.setHours(0, 0, 0, 0);
  return nd;
}

function addDays(d, days) {
  const nd = new Date(d);
  nd.setDate(nd.getDate() + days);
  return nd;
}

function formatISO(d) {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Ritorna un array di settimane, ognuna = array di 7 Date, stile Google Calendar
 */
function getWeeksForMonth(year, month) {
  const firstOfMonth = new Date(year, month, 1);
  const start = new Date(firstOfMonth);
  // portiamo il cursore al lunedi della settimana del primo del mese
  const day = start.getDay(); // 0=dom,1=lun,...6=sab
  const diffToMonday = day === 0 ? -6 : 1 - day;
  start.setDate(start.getDate() + diffToMonday);

  const weeks = [];
  let current = startOfDay(start);

  while (true) {
    const week = [];
    for (let i = 0; i < 7; i++) {
      week.push(new Date(current));
      current = addDays(current, 1);
    }
    weeks.push(week);

    const lastDayInWeek = week[6];
    const monthEnd = new Date(year, month + 1, 0);
    if (lastDayInWeek > monthEnd && lastDayInWeek.getDay() === 0) {
      break;
    }
    if (lastDayInWeek > monthEnd && lastDayInWeek.getMonth() !== month) {
      break;
    }
  }

  return weeks;
}

function Calendar() {
  const isMobile = useIsMobile(900);
  const navigate = useNavigate();
  const today = new Date();

  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth()); // 0-11

  const [units, setUnits] = useState([]);
  const [bookings, setBookings] = useState([]);

  const [loading, setLoading] = useState(true);
  const [fromCache, setFromCache] = useState(false);
  const [error, setError] = useState(null);
  const [draggingBooking, setDraggingBooking] = useState(null);

  const [selectedUnitId, setSelectedUnitId] = useState(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const [bks, uns] = await Promise.all([getBookings(), getUnits()]);
        setBookings(bks);
        setUnits(uns);
        if (!selectedUnitId && uns.length > 0) {
          setSelectedUnitId(uns[0].id);
        }
        setFromCache(false);
        await db.bookings.clear();
        await db.bookings.bulkPut(bks);
        await db.units.clear();
        await db.units.bulkPut(uns);
      } catch (err) {
        setError(err.message);
        const cachedBookings = await db.bookings.toArray();
        const cachedUnits = await db.units.toArray();
        setBookings(cachedBookings);
        setUnits(cachedUnits);
        if (!selectedUnitId && cachedUnits.length > 0) {
          setSelectedUnitId(cachedUnits[0].id);
        }
        setFromCache(true);
      } finally {
        setLoading(false);
      }
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const weeks = useMemo(() => getWeeksForMonth(year, month), [year, month]);

  const bookingsWithParsedDates = useMemo(
    () =>
      bookings.map((b) => {
        const checkin = startOfDay(new Date(b.checkin_date));
        const checkout = startOfDay(new Date(b.checkout_date));
        return {
          ...b,
          _checkin: checkin,
          _checkout: checkout,
          _nights:
            (checkout.getTime() - checkin.getTime()) / (1000 * 60 * 60 * 24),
        };
      }),
    [bookings]
  );

  const bookingsByDay = useMemo(() => {
    const map = {};
    for (const b of bookingsWithParsedDates) {
      let d = new Date(b._checkin);
      while (d < b._checkout) {
        const key = formatISO(d);
        if (!map[key]) map[key] = [];
        map[key].push(b);
        d = addDays(d, 1);
      }
    }
    return map;
  }, [bookingsWithParsedDates]);

  const unitMap = useMemo(
    () =>
      units.reduce((acc, u) => {
        acc[u.id] = u;
        return acc;
      }, {}),
    [units]
  );

  const daysInMonth = useMemo(
    () => new Date(year, month + 1, 0).getDate(),
    [year, month]
  );

  const monthStart = useMemo(
    () => startOfDay(new Date(year, month, 1)),
    [year, month]
  );
  const monthEnd = useMemo(
    () => startOfDay(new Date(year, month, daysInMonth)),
    [year, month, daysInMonth]
  );

  const unitBookingsInMonth = useMemo(() => {
    if (!selectedUnitId) return [];
    return bookingsWithParsedDates.filter(
      (b) =>
        b.unit_id === selectedUnitId &&
        b._checkin <= monthEnd &&
        b._checkout > monthStart
    );
  }, [bookingsWithParsedDates, selectedUnitId, monthStart, monthEnd]);

  // occupazione mese per unita selezionata
  const unitOccupancy = useMemo(() => {
    if (!selectedUnitId || daysInMonth === 0) return null;
    const occupied = new Array(daysInMonth).fill(false);

    for (const b of unitBookingsInMonth) {
      const start = b._checkin < monthStart ? monthStart : b._checkin;
      const end =
        b._checkout > addDays(monthEnd, 1) ? addDays(monthEnd, 1) : b._checkout;

      let current = new Date(start);
      while (current < end) {
        const day = current.getDate(); // 1..daysInMonth
        if (day >= 1 && day <= daysInMonth) {
          occupied[day - 1] = true;
        }
        current = addDays(current, 1);
      }
    }

    const occupiedNights = occupied.filter(Boolean).length;
    const percentage = Math.round((occupiedNights / daysInMonth) * 100);

    return {
      occupiedNights,
      percentage,
      totalNights: daysInMonth,
    };
  }, [unitBookingsInMonth, selectedUnitId, daysInMonth, monthStart, monthEnd]);

  // --- NAV MESE: FIX SALTO ANNO ---
  function nextMonth() {
    const current = new Date(year, month, 1);
    const next = new Date(current.getFullYear(), current.getMonth() + 1, 1);
    setYear(next.getFullYear());
    setMonth(next.getMonth());
  }

  function prevMonth() {
    const current = new Date(year, month, 1);
    const prev = new Date(current.getFullYear(), current.getMonth() - 1, 1);
    setYear(prev.getFullYear());
    setMonth(prev.getMonth());
  }

  function isSameDay(a, b) {
    return (
      a.getFullYear() === b.getFullYear() &&
      a.getMonth() === b.getMonth() &&
      a.getDate() === b.getDate()
    );
  }

  // ---- DRAG & DROP ----
  function handleDragStart(e, booking) {
    if (fromCache) return;
    setDraggingBooking(booking);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData(
      "application/json",
      JSON.stringify({
        id: booking.id,
        checkin_date: booking.checkin_date,
        checkout_date: booking.checkout_date,
      })
    );
  }

  function handleDragEnd() {
    setDraggingBooking(null);
  }

  async function handleDrop(e, dayDate) {
    e.preventDefault();
    if (!draggingBooking || fromCache) return;

    try {
      const dataJson = e.dataTransfer.getData("application/json");
      const data = dataJson ? JSON.parse(dataJson) : null;
      if (!data) return;

      const oldCheckin = startOfDay(new Date(data.checkin_date));
      const oldCheckout = startOfDay(new Date(data.checkout_date));
      const nights =
        (oldCheckout.getTime() - oldCheckin.getTime()) /
        (1000 * 60 * 60 * 24);

      const newCheckin = startOfDay(dayDate);
      const newCheckout = addDays(newCheckin, nights);

      const payload = {
        unit_id: draggingBooking.unit_id,
        guest_name: draggingBooking.guest_name,
        guest_email: draggingBooking.guest_email,
        source: draggingBooking.source,
        checkin_date: formatISO(newCheckin),
        checkout_date: formatISO(newCheckout),
        notes: draggingBooking.notes,
      };

      const updated = await updateBooking(draggingBooking.id, payload);

      setBookings((prev) =>
        prev.map((b) => (b.id === updated.id ? updated : b))
      );
      await db.bookings.put(updated);
    } catch (err) {
      alert("Errore spostando la prenotazione: " + err.message);
    } finally {
      setDraggingBooking(null);
    }
  }

  function handleDragOver(e) {
    if (!draggingBooking || fromCache) return;
    e.preventDefault();
  }

  // --- CLICK: APRI PRENOTAZIONE IN MODIFICA ---
  function openBookingInEdit(bookingId) {
    navigate("/bookings", { state: { editBookingId: bookingId } });
  }

  // --- CLICK + : NUOVA PRENOTAZIONE PER QUEL GIORNO ---
  function createBookingForDay(dayDate) {
    const iso = formatISO(dayDate);
    navigate("/bookings", { state: { newBookingDate: iso } });
  }

  // STILI

  const pageHeader = {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-end",
    gap: 12,
    marginBottom: 20,
    flexWrap: "wrap",
  };

  const navControls = {
    display: "flex",
    alignItems: "center",
    gap: 8,
  };

  const navButton = {
    borderRadius: 999,
    border: "1px solid #cbd5e1",
    backgroundColor: "white",
    padding: "6px 10px",
    fontSize: 13,
    cursor: "pointer",
  };

  const badgeInfo = {
    fontSize: 12,
    padding: "4px 10px",
    borderRadius: 999,
    background: "#eff6ff",
    border: "1px solid #bfdbfe",
    color: "#1d4ed8",
  };

  const badgeOffline = {
    fontSize: 12,
    padding: "4px 10px",
    borderRadius: 999,
    background: "#fffbeb",
    border: "1px solid #fbbf24",
    color: "#92400e",
  };

  const card = {
    background: "linear-gradient(180deg,#fff 0%,#f8fafc 100%)",
    borderRadius: "16px",
    padding: "16px 18px",
    boxShadow: "0 8px 20px rgba(15, 23, 42, 0.05)",
    border: "1px solid #e2e8f0",
  };

  const legend = {
    display: "flex",
    flexWrap: "wrap",
    gap: 10,
    fontSize: 12,
    color: "#6b7280",
    marginBottom: 10,
  };

  const legendItem = {
    display: "flex",
    alignItems: "center",
    gap: 6,
  };

  const legendDot = (bg, border) => ({
    width: 12,
    height: 12,
    borderRadius: 4,
    backgroundColor: bg,
    border: `1px solid ${border}`,
  });

  const calendarGrid = {
    display: "grid",
    gridTemplateRows: "auto",
    gap: 4,
    minWidth: isMobile ? 620 : undefined,
  };

  const weekRow = {
    display: "grid",
    gridTemplateColumns: "repeat(7, 1fr)",
    gap: 4,
  };

  const weekdayHeaderCell = {
    fontSize: 11,
    textTransform: "uppercase",
    color: "#6b7280",
    textAlign: "center",
    paddingBottom: 4,
  };

  const dayCell = (isCurrentMonth, isToday) => ({
    borderRadius: 12,
    border: "1px solid #e2e8f0",
    backgroundColor: isCurrentMonth ? "#f8fafc" : "#fdfdfd",
    position: "relative",
    minHeight: isMobile ? 76 : 90,
    padding: "4px 4px 4px 4px",
    fontSize: 11,
    cursor: draggingBooking && !fromCache ? "copy" : "default",
    boxShadow: isToday ? "0 0 0 2px #0f766e inset" : "0 1px 2px rgba(15,23,42,0.03)",
    overflow: "hidden",
  });

  const dayNumber = (isCurrentMonth) => ({
    position: "absolute",
    top: 4,
    right: 6,
    fontSize: 11,
    fontWeight: 600,
    color: isCurrentMonth ? "#111827" : "#9ca3af",
  });

  // bottone + centrato
  const addButton = {
    position: "absolute",
    top: 4,
    left: 4,
    width: isMobile ? 16 : 18,
    height: isMobile ? 16 : 18,
    borderRadius: "999px",
    border: "1px solid #d1d5db",
    backgroundColor: "white",
    fontSize: 12,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
    color: "#4b5563",
    padding: 0,
    lineHeight: 1,
  };

  const bookingsContainer = {
    marginTop: isMobile ? 18 : 22,
    display: "flex",
    flexDirection: "column",
      gap: 4,
    minWidth: 0,
  };

  // colori piu accesi per le pill
  const bookingPill = (source, isDragging) => {
    let bg = "#bbf7d0";
    let border = "#10b981";
    let color = "#065f46";

    if (source === "airbnb") {
      bg = "#fed7aa";
      border = "#f97316";
      color = "#9a3412";
    } else if (source === "booking") {
      bg = "#bfdbfe";
      border = "#2563eb";
      color = "#1d4ed8";
    }

    return {
      padding: "2px 6px",
      borderRadius: 999,
      backgroundColor: bg,
      border: `1px solid ${border}`,
      color,
      fontSize: 11,
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 4,
      minWidth: 0,
      opacity: isDragging ? 0.4 : 1,
      cursor: fromCache ? "default" : "grab",
      userSelect: "none",
    };
  };

  // STILI TIMELINE UNITA
  const timelineCard = {
    ...card,
    marginTop: 16,
  };

  const timelineWrapper = {
    marginTop: 10,
    overflowX: "auto",
  };

  const calendarScroll = {
    overflowX: isMobile ? "auto" : "visible",
  };

  const timelineRow = {
    display: "flex",
    alignItems: "stretch",
    minWidth: daysInMonth * (isMobile ? 22 : 26) + 80,
  };

  const timelineDayCell = (isToday) => ({
    width: isMobile ? 22 : 26,
    minWidth: isMobile ? 22 : 26,
    height: 32,
    borderRight: "1px solid #e5e7eb",
    backgroundColor: isToday ? "#ecfeff" : "white",
    position: "relative",
  });

  const timelineDayNumber = {
    position: "absolute",
    top: 2,
    left: 4,
    fontSize: 10,
    color: "#9ca3af",
  };

  // timeline bar con colori coerenti e piu evidenti
  const timelineBar = (source) => {
    let bg = "#4ade80"; // direct
    if (source === "airbnb") bg = "#fb923c";
    if (source === "booking") bg = "#60a5fa";
    return {
      position: "absolute",
      bottom: 4,
      left: 3,
      right: 3,
      height: 10,
      borderRadius: 999,
      backgroundColor: bg,
    };
  };

  return (
    <div>
      <div style={pageHeader}>
        <div>
          <h1 style={{ marginBottom: 4 }}>Calendario occupazione</h1>
          <p style={{ fontSize: 13, color: "#6b7280" }}>
            Vista mensile con card prenotazioni per giorno.
            Trascina una prenotazione su un altro giorno per spostarla.
          </p>
        </div>

        <div style={{ textAlign: "right", fontSize: 12, color: "#6b7280" }}>
          <div style={{ marginBottom: 4 }}>
            <div style={navControls}>
              <PageInfoHelp title="Come usare Calendario occupazione">
                <p>Il calendario mostra le prenotazioni giorno per giorno con stato live/offline.</p>
                <ul style={{ margin: 0, paddingLeft: 18, display: "grid", gap: 4 }}>
                  <li>Pulsante `+` per creare booking sul giorno selezionato.</li>
                  <li>Click su una card per aprire la prenotazione in modifica.</li>
                  <li>Drag and drop disponibile solo in modalita live, non da cache offline.</li>
                </ul>
              </PageInfoHelp>
              <button style={navButton} type="button" onClick={prevMonth}>
                {"<"}
              </button>
              <div style={{ fontWeight: 600 }}>
                {MONTH_LABELS[month]} {year}
              </div>
              <button style={navButton} type="button" onClick={nextMonth}>
                {">"}
              </button>
            </div>
          </div>
          <div>
            <span style={fromCache ? badgeOffline : badgeInfo}>
              {fromCache
                ? "Offline - spostamento disabilitato (solo cache)"
                : "Dati live - drag & drop attivo"}
            </span>
          </div>
        </div>
      </div>

      {/* CARD CALENDARIO MENSILE */}
      <div style={card}>
        {loading ? (
          <p>Caricamento calendario...</p>
        ) : units.length === 0 ? (
          <p style={{ fontSize: 13, color: "#6b7280" }}>
            Nessun appartamento configurato.
          </p>
        ) : (
          <>
            <div style={legend}>
              <span style={legendItem}>
                <span style={legendDot("#bbf7d0", "#10b981")} />
                Diretta
              </span>
              <span style={legendItem}>
                <span style={legendDot("#fed7aa", "#f97316")} />
                Airbnb
              </span>
              <span style={legendItem}>
                <span style={legendDot("#bfdbfe", "#2563eb")} />
                Booking.com
              </span>
            </div>

            <div style={calendarScroll}>
            <div style={calendarGrid}>
              {/* intestazione giorni della settimana */}
              <div style={weekRow}>
                {WEEKDAY_LABELS.map((lbl) => (
                  <div key={lbl} style={weekdayHeaderCell}>
                    {lbl}
                  </div>
                ))}
              </div>

              {/* settimane */}
              {weeks.map((week, wi) => (
                <div key={wi} style={weekRow}>
                  {week.map((dayDate, di) => {
                    const isCurrentMonth = dayDate.getMonth() === month;
                    const isToday = isSameDay(dayDate, today);
                    const dayKey = formatISO(dayDate);
                    const dayBookings = bookingsByDay[dayKey] || [];

                    const maxVisible = isMobile ? 2 : 3;
                    const visibleBookings = dayBookings.slice(0, maxVisible);
                    const extraCount =
                      dayBookings.length > maxVisible ? dayBookings.length - maxVisible : 0;

                    return (
                      <div
                        key={di}
                        style={dayCell(isCurrentMonth, isToday)}
                        onDragOver={handleDragOver}
                        onDrop={(e) => handleDrop(e, dayDate)}
                      >
                        {/* Numero giorno */}
                        <div style={dayNumber(isCurrentMonth)}>
                          {dayDate.getDate()}
                        </div>

                        {/* Pulsante + per nuova prenotazione */}
                        <button
                          type="button"
                          style={addButton}
                          onClick={(e) => {
                            e.stopPropagation();
                            createBookingForDay(dayDate);
                          }}
                          title="Nuova prenotazione per questo giorno"
                        >
                          +
                        </button>

                        {/* Prenotazioni del giorno */}
                        <div style={bookingsContainer}>
                          {visibleBookings.map((b) => {
                            const unit = unitMap[b.unit_id];
                            const isDraggingCard =
                              draggingBooking &&
                              draggingBooking.id === b.id;

                            const title = `${b.guest_name || "Ospite"} - ${
                              unit?.name || `Unit #${b.unit_id}`
                            }\n${new Date(
                              b.checkin_date
                            ).toLocaleDateString("it-IT")} -> ${new Date(
                              b.checkout_date
                            ).toLocaleDateString("it-IT")}\nFonte: ${
                              b.source
                            }`;

                            const isCheckinDay = isSameDay(
                              dayDate,
                              b._checkin
                            );

                            return (
                              <div
                                key={b.id}
                                style={bookingPill(
                                  b.source,
                                  isDraggingCard
                                )}
                                title={title}
                                draggable={isCheckinDay && !fromCache}
                                onDragStart={(e) =>
                                  isCheckinDay && handleDragStart(e, b)
                                }
                                onDragEnd={handleDragEnd}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openBookingInEdit(b.id);
                                }}
                              >
                                <span
                                  style={{
                                    overflow: "hidden",
                                    textOverflow: "ellipsis",
                                    whiteSpace: "nowrap",
                                    minWidth: 0,
                                  }}
                                >
                                  {b.guest_name || "Ospite"} -{" "}
                                  {unit?.name || `Unit #${b.unit_id}`}
                                </span>
                                <span style={{ fontSize: 10 }}>
                                  {b._nights}n
                                </span>
                              </div>
                            );
                          })}
                          {extraCount > 0 && (
                            <div
                              style={{
                                fontSize: 10,
                                color: "#6b7280",
                              }}
                            >
                              +{extraCount} altre
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
            </div>

            {error && !fromCache && (
              <p style={{ color: "red", fontSize: 12, marginTop: 8 }}>
                Errore caricamento: {error}
              </p>
            )}
          </>
        )}
      </div>

      {/* TIMELINE PER SINGOLA UNITA */}
      <div style={timelineCard}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 12,
            alignItems: "center",
            marginBottom: 8,
          }}
        >
          <div>
            <h2 style={{ fontSize: 15, marginBottom: 2 }}>
              Timeline per appartamento
            </h2>
            <p style={{ fontSize: 12, color: "#6b7280" }}>
              Occupazione sul mese corrente per una singola unita.
            </p>
          </div>
          <div>
            <select
              value={selectedUnitId || ""}
              onChange={(e) =>
                setSelectedUnitId(
                  e.target.value ? Number(e.target.value) : null
                )
              }
            >
              {units.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {(!selectedUnitId || units.length === 0) && (
          <p style={{ fontSize: 13, color: "#6b7280" }}>
            Nessuna unita selezionata.
          </p>
        )}

        {selectedUnitId && (
          <>
            <div style={timelineWrapper}>
              <div style={{ fontSize: 12, marginBottom: 4, color: "#6b7280" }}>
                {MONTH_LABELS[month]} {year}
              </div>
              <div style={timelineRow}>
                {Array.from({ length: daysInMonth }, (_, i) => {
                  const day = i + 1;
                  const date = new Date(year, month, day);
                  const bookingsForThisDay = unitBookingsInMonth.filter(
                    (b) => date >= b._checkin && date < b._checkout
                  );
                  const booking = bookingsForThisDay[0] || null;
                  return (
                    <div
                      key={day}
                      style={timelineDayCell(isSameDay(date, today))}
                      title={
                        booking
                          ? `${booking.guest_name || "Ospite"}\n${new Date(
                              booking.checkin_date
                            ).toLocaleDateString(
                              "it-IT"
                            )} -> ${new Date(
                              booking.checkout_date
                            ).toLocaleDateString("it-IT")}`
                          : ""
                      }
                      onClick={() => {
                        if (booking) openBookingInEdit(booking.id);
                      }}
                    >
                      <span style={timelineDayNumber}>{day}</span>
                      {booking && <div style={timelineBar(booking.source)} />}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* riepilogo occupazione unita */}
            {unitOccupancy && (
              <div
                style={{
                  marginTop: 10,
                  fontSize: 12,
                  color: "#4b5563",
                  display: "flex",
                  justifyContent: "space-between",
                  flexWrap: "wrap",
                  gap: 8,
                }}
              >
                <div>
                  Occupazione mese{" "}
                  <strong>
                    {unitOccupancy.occupiedNights} /{" "}
                    {unitOccupancy.totalNights} notti
                  </strong>
                </div>
                <div>
                  Tasso di occupazione:{" "}
                  <strong>{unitOccupancy.percentage}%</strong>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default Calendar;




