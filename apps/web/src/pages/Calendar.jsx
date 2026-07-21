import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  getBookings,
  getUnits,
  updateBooking,
  getRateCalendar,
} from "../services/api";
import { PageHeader, Button, useToast } from "../components/ui";
import {
  MONTH_LABELS,
  WEEKDAY_LABELS,
  startOfDay,
  addDays,
  formatISO,
  isSameDay,
  getWeeksForMonth,
} from "../utils/dateUtils";
import { formatCurrency } from "../utils/format";
import db from "../offline/dbLocal";

function Calendar() {
  const navigate = useNavigate();
  const toast = useToast();
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
  const [rateByDate, setRateByDate] = useState({});

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

  // Rate calendar for the selected unit and visible month (revenue overlay).
  useEffect(() => {
    if (!selectedUnitId) {
      setRateByDate({});
      return;
    }
    let active = true;
    const from = formatISO(new Date(year, month, 1));
    const to = formatISO(new Date(year, month + 1, 1));
    getRateCalendar(selectedUnitId, { from_date: from, to_date: to })
      .then((res) => {
        if (!active) return;
        const map = {};
        for (const d of res.days || []) map[d.date] = d;
        setRateByDate(map);
      })
      .catch(() => {
        if (active) setRateByDate({});
      });
    return () => {
      active = false;
    };
  }, [selectedUnitId, year, month]);

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

  // occupazione mese per unità selezionata
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

  // Riepilogo tariffe del mese per l'unità selezionata (media/min/max + giorni personalizzati).
  const rateSummary = useMemo(() => {
    const entries = Object.values(rateByDate);
    const prices = entries
      .map((d) => d.price)
      .filter((p) => p !== null && p !== undefined);
    if (prices.length === 0) return null;
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    const avg = prices.reduce((a, b) => a + b, 0) / prices.length;
    const customCount = entries.filter((d) => d.is_stored).length;
    const currency = entries[0]?.currency || "EUR";
    return { min, max, avg, customCount, currency };
  }, [rateByDate]);

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
      toast.error("Errore spostando la prenotazione: " + err.message, {
        title: "Spostamento non riuscito",
      });
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

  const navControls = {
    display: "flex",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
    justifyContent: "flex-end",
  };

  const badgeInfo = {
    fontSize: 12,
    padding: "4px 10px",
    borderRadius: 999,
    background: "var(--color-info-soft)",
    border: "1px solid var(--color-info)",
    color: "var(--color-info-strong)",
  };

  const badgeOffline = {
    fontSize: 12,
    padding: "4px 10px",
    borderRadius: 999,
    background: "var(--color-warning-soft)",
    border: "1px solid var(--color-warning)",
    color: "var(--color-warning-strong)",
  };

  const card = {
    backgroundColor: "var(--color-surface)",
    borderRadius: "14px",
    padding: "16px 18px",
    boxShadow: "var(--shadow-sm)",
    border: "1px solid var(--color-border)",
  };

  const legend = {
    display: "flex",
    flexWrap: "wrap",
    gap: 10,
    fontSize: 12,
    color: "var(--color-text-muted)",
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
  };

  const weekRow = {
    display: "grid",
    gridTemplateColumns: "repeat(7, 1fr)",
    gap: 4,
  };

  const weekdayHeaderCell = {
    fontSize: 11,
    textTransform: "uppercase",
    color: "var(--color-text-muted)",
    textAlign: "center",
    paddingBottom: 4,
  };

  const dayCell = (isCurrentMonth, isToday) => ({
    borderRadius: 10,
    border: "1px solid var(--color-border)",
    backgroundColor: isCurrentMonth ? "var(--color-surface-soft)" : "var(--color-surface)",
    position: "relative",
    minHeight: 90,
    padding: "4px 4px 4px 4px",
    fontSize: 11,
    cursor: draggingBooking && !fromCache ? "copy" : "default",
    boxShadow: isToday ? "0 0 0 2px var(--color-primary) inset" : "none",
    overflow: "hidden",
  });

  const dayNumber = (isCurrentMonth) => ({
    position: "absolute",
    top: 4,
    right: 6,
    fontSize: 11,
    fontWeight: 600,
    color: isCurrentMonth ? "var(--color-text)" : "var(--color-text-subtle)",
  });

  // 🔧 bottone + centrato
  const addButton = {
    position: "absolute",
    top: 4,
    left: 4,
    width: 18,
    height: 18,
    borderRadius: "999px",
    border: "1px solid var(--color-border-strong)",
    backgroundColor: "var(--color-surface)",
    fontSize: 12,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
    color: "var(--color-text-muted)",
    padding: 0,
    lineHeight: 1,
  };

  const bookingsContainer = {
    marginTop: 22,
    display: "flex",
    flexDirection: "column",
    gap: 4,
  };

  // 🎨 colori più accesi per le pill
  const bookingPill = (source, isDragging) => {
    let bg = "var(--color-success-soft)";
    let border = "var(--color-success)";
    let color = "var(--color-success-strong)";

    if (source === "airbnb") {
      bg = "var(--color-warning-soft)";
      border = "var(--color-warning)";
      color = "var(--color-warning-strong)";
    } else if (source === "booking") {
      bg = "var(--color-info-soft)";
      border = "var(--color-info)";
      color = "var(--color-info-strong)";
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
      opacity: isDragging ? 0.4 : 1,
      cursor: fromCache ? "default" : "grab",
      userSelect: "none",
    };
  };

  // STILI TIMELINE UNITÀ
  const timelineCard = {
    ...card,
    marginTop: 16,
  };

  const timelineWrapper = {
    marginTop: 10,
    overflowX: "auto",
  };

  const timelineRow = {
    display: "flex",
    alignItems: "stretch",
    minWidth: daysInMonth * 26 + 80,
  };

  const timelineDayCell = (isToday) => ({
    width: 26,
    minWidth: 26,
    height: 48,
    borderRight: "1px solid var(--color-border)",
    backgroundColor: isToday ? "var(--color-info-soft)" : "var(--color-surface)",
    position: "relative",
  });

  const timelineDayNumber = {
    position: "absolute",
    top: 2,
    left: 4,
    fontSize: 10,
    color: "var(--color-text-subtle)",
  };

  // 🎨 timeline bar con colori coerenti e più evidenti
  const timelineBar = (source) => {
    let bg = "var(--color-success)"; // direct
    if (source === "airbnb") bg = "var(--color-warning)";
    if (source === "booking") bg = "var(--color-info)";
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

  // Prezzo/notte nella timeline: colore per provenienza (manuale/reco/base).
  const timelinePrice = (rate) => {
    let color = "var(--color-text-subtle)"; // base fallback
    if (rate.price_source === "manual") color = "var(--color-accent-strong)";
    else if (rate.price_source === "reco") color = "var(--color-info-strong)";
    return {
      position: "absolute",
      top: 15,
      left: 0,
      right: 0,
      textAlign: "center",
      fontSize: 9,
      fontWeight: rate.is_stored ? 700 : 500,
      color,
      lineHeight: 1,
    };
  };

  return (
    <div>
      <PageHeader
        title="Calendario occupazione"
        subtitle="Vista mensile con prenotazioni per giorno. Trascina una prenotazione su un altro giorno per spostarla."
        actions={
          <div style={navControls}>
            <Button
              variant="secondary"
              size="sm"
              icon={<ChevronLeft size={16} />}
              onClick={prevMonth}
              aria-label="Mese precedente"
            />
            <div style={{ fontWeight: 600, minWidth: 132, textAlign: "center" }}>
              {MONTH_LABELS[month]} {year}
            </div>
            <Button
              variant="secondary"
              size="sm"
              icon={<ChevronRight size={16} />}
              onClick={nextMonth}
              aria-label="Mese successivo"
            />
            <span style={fromCache ? badgeOffline : badgeInfo}>
              {fromCache
                ? "Offline – spostamento disabilitato (solo cache)"
                : "Dati live – drag & drop attivo"}
            </span>
          </div>
        }
      />

      {/* CARD CALENDARIO MENSILE */}
      <div style={card}>
        {loading ? (
          <p>Caricamento calendario...</p>
        ) : units.length === 0 ? (
          <p style={{ fontSize: 13, color: "var(--color-text-muted)" }}>
            Nessun appartamento configurato.
          </p>
        ) : (
          <>
            <div style={legend}>
              <span style={legendItem}>
                <span style={legendDot("var(--color-success-soft)", "var(--color-success)")} />
                Diretta
              </span>
              <span style={legendItem}>
                <span style={legendDot("var(--color-warning-soft)", "var(--color-warning)")} />
                Airbnb
              </span>
              <span style={legendItem}>
                <span style={legendDot("var(--color-info-soft)", "var(--color-info)")} />
                Booking.com
              </span>
            </div>

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

                    const visibleBookings = dayBookings.slice(0, 3);
                    const extraCount =
                      dayBookings.length > 3 ? dayBookings.length - 3 : 0;

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

                            const title = `${b.guest_name || "Ospite"} – ${
                              unit?.name || `Unit #${b.unit_id}`
                            }\n${new Date(
                              b.checkin_date
                            ).toLocaleDateString("it-IT")} → ${new Date(
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
                                <span>
                                  {b.guest_name || "Ospite"} ·{" "}
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
                                color: "var(--color-text-muted)",
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

            {error && !fromCache && (
              <p style={{ color: "var(--color-danger)", fontSize: 12, marginTop: 8 }}>
                Errore caricamento: {error}
              </p>
            )}
          </>
        )}
      </div>

      {/* TIMELINE PER SINGOLA UNITÀ */}
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
            <p style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
              Occupazione sul mese corrente per una singola unità.
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
          <p style={{ fontSize: 13, color: "var(--color-text-muted)" }}>
            Nessuna unità selezionata.
          </p>
        )}

        {selectedUnitId && (
          <>
            <div style={timelineWrapper}>
              <div style={{ fontSize: 12, marginBottom: 4, color: "var(--color-text-muted)" }}>
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
                  const rate = rateByDate[formatISO(date)] || null;

                  const bookingLabel = booking
                    ? `${booking.guest_name || "Ospite"}\n${new Date(
                        booking.checkin_date
                      ).toLocaleDateString("it-IT")} → ${new Date(
                        booking.checkout_date
                      ).toLocaleDateString("it-IT")}`
                    : "";
                  const rateLabel =
                    rate && rate.price != null
                      ? `Tariffa: ${formatCurrency(rate.price, rate.currency)}${
                          rate.min_stay ? ` · min ${rate.min_stay} notti` : ""
                        } (${rate.is_stored ? rate.price_source : "base"})`
                      : "";
                  const cellTitle = [bookingLabel, rateLabel]
                    .filter(Boolean)
                    .join("\n");

                  return (
                    <div
                      key={day}
                      style={timelineDayCell(isSameDay(date, today))}
                      title={cellTitle}
                      onClick={() => {
                        if (booking) openBookingInEdit(booking.id);
                      }}
                    >
                      <span style={timelineDayNumber}>{day}</span>
                      {rate && rate.price != null && (
                        <span style={timelinePrice(rate)}>
                          {Math.round(rate.price)}
                        </span>
                      )}
                      {booking && <div style={timelineBar(booking.source)} />}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* riepilogo occupazione unità */}
            {unitOccupancy && (
              <div
                style={{
                  marginTop: 10,
                  fontSize: 12,
                  color: "var(--color-text-muted)",
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

            {/* riepilogo tariffe (overlay revenue) */}
            {rateSummary && (
              <div
                style={{
                  marginTop: 6,
                  fontSize: 12,
                  color: "var(--color-text-muted)",
                  display: "flex",
                  justifyContent: "space-between",
                  flexWrap: "wrap",
                  gap: 8,
                }}
              >
                <div>
                  Tariffa media{" "}
                  <strong>
                    {formatCurrency(rateSummary.avg, rateSummary.currency)}
                  </strong>{" "}
                  <span style={{ color: "var(--color-text-subtle)" }}>
                    ({formatCurrency(rateSummary.min, rateSummary.currency)} –{" "}
                    {formatCurrency(rateSummary.max, rateSummary.currency)})
                  </span>
                </div>
                <div>
                  Giorni con tariffa personalizzata:{" "}
                  <strong>{rateSummary.customCount}</strong> / {daysInMonth}
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
