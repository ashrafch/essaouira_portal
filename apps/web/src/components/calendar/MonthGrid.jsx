import { useState } from "react";
import { ArrowUpRight, Plus } from "lucide-react";
import { Button, Modal } from "../ui";
import { formatISO, isSameDay, WEEKDAY_LABELS } from "../../utils/dateUtils";
import { BOOKING_STATUS_LABELS } from "../../utils/bookingViews";
import "./calendar.css";

const PREVIEW_LIMIT = 3;
const sourceLabels = { direct: "Diretta", airbnb: "Airbnb", booking: "Booking.com" };
const dateLabel = date => date.toLocaleDateString("it-IT", { day: "numeric", month: "long", year: "numeric" });
const shortDate = date => date.toLocaleDateString("it-IT", { day: "numeric", month: "short" });
const sourceName = source => Object.hasOwn(sourceLabels, source) ? source : "direct";

export default function MonthGrid({ weeks, month, today, bookingsByDay, unitMap, canEdit, fromCache,
  draggingBooking, onDragStart, onDragEnd, onDragOver, onDrop, onOpenBooking, onCreateBooking }) {
  const [selectedDay, setSelectedDay] = useState(null);
  const selectedBookings = selectedDay ? bookingsByDay[formatISO(selectedDay)] || [] : [];
  const canCreate = canEdit && !fromCache;

  return (
    <>
      <div className="occupancy-month" aria-label="Calendario mensile">
        <div className="occupancy-week occupancy-week--labels" aria-hidden="true">
          {WEEKDAY_LABELS.map(label => <div key={label}>{label}</div>)}
        </div>
        {weeks.map(week => (
          <div className="occupancy-week" key={formatISO(week[0])}>
            {week.map(date => {
              const key = formatISO(date);
              const dayBookings = bookingsByDay[key] || [];
              const extraCount = dayBookings.length - PREVIEW_LIMIT;
              return (
                <section key={key} data-date={key} aria-label={dateLabel(date)}
                  className={`occupancy-day${date.getMonth() !== month ? " occupancy-day--outside" : ""}${isSameDay(date, today) ? " occupancy-day--today" : ""}`}
                  onDragOver={onDragOver} onDrop={event => onDrop(event, date)}>
                  <div className="occupancy-day__header">
                    <button type="button" className="occupancy-day__date"
                      aria-label={`${dateLabel(date)}: ${dayBookings.length} prenotazioni`}
                      aria-current={isSameDay(date, today) ? "date" : undefined}
                      onClick={() => setSelectedDay(date)}>{date.getDate()}</button>
                    {canCreate && <button type="button" className="occupancy-day__add"
                      title={`Nuova prenotazione: ${dateLabel(date)}`} aria-label={`Nuova prenotazione: ${dateLabel(date)}`}
                      onClick={() => onCreateBooking(date)}><Plus size={14} /></button>}
                  </div>
                  <div className="occupancy-day__bookings">
                    {dayBookings.slice(0, PREVIEW_LIMIT).map(booking => {
                      const unit = unitMap[booking.unit_id]?.name || `Unit #${booking.unit_id}`;
                      const guest = booking.guest_name || "Ospite";
                      const draggable = canCreate && isSameDay(date, booking._checkin);
                      const source = sourceName(booking.source);
                      return <button type="button" key={booking.id}
                        className={`occupancy-booking occupancy-source--${source}${draggingBooking?.id === booking.id ? " occupancy-booking--dragging" : ""}`}
                        title={`${guest}\n${unit}\n${shortDate(booking._checkin)} - ${shortDate(booking._checkout)} | ${sourceLabels[source]}`}
                        draggable={draggable} onDragStart={event => { if (draggable) onDragStart(event, booking); }}
                        onDragEnd={onDragEnd} onClick={() => onOpenBooking(booking.id)}>
                        <span className="occupancy-booking__text"><strong>{guest}</strong><span>{unit}</span></span>
                        <span className="occupancy-booking__nights" aria-label={`${booking._nights} notti`}>{booking._nights}n</span>
                      </button>;
                    })}
                  </div>
                  {extraCount > 0 && <button type="button" className="occupancy-day__more"
                    aria-label={`Altre ${extraCount} prenotazioni: ${dateLabel(date)}`}
                    onClick={() => setSelectedDay(date)}>+{extraCount} altre <ArrowUpRight size={12} /></button>}
                </section>
              );
            })}
          </div>
        ))}
      </div>
      <Modal className="occupancy-dialog" open={Boolean(selectedDay)} onClose={() => setSelectedDay(null)}
        title={selectedDay ? `Prenotazioni del ${dateLabel(selectedDay)}` : ""}
        description={`${selectedBookings.length} prenotazioni in soggiorno`}
        footer={canCreate ? <Button icon={<Plus size={16} />} onClick={() => onCreateBooking(selectedDay)}>Nuova prenotazione</Button> : null}>
        {selectedBookings.length === 0 ? <p>Nessuna prenotazione in soggiorno.</p> : (
          <ul className="occupancy-details">
            {selectedBookings.map(booking => <li key={booking.id}>
              <button type="button" onClick={() => onOpenBooking(booking.id)}>
                <span className="occupancy-details__text">
                  <strong>{booking.guest_name || "Ospite"}</strong>
                  <span>{unitMap[booking.unit_id]?.name || `Unit #${booking.unit_id}`}</span>
                  <span>{shortDate(booking._checkin)} - {shortDate(booking._checkout)} · {booking._nights} notti</span>
                  <span>{sourceLabels[sourceName(booking.source)]} · {BOOKING_STATUS_LABELS[booking.status] || booking.status}</span>
                </span>
                <ArrowUpRight size={18} aria-hidden="true" />
              </button>
            </li>)}
          </ul>
        )}
      </Modal>
    </>
  );
}
