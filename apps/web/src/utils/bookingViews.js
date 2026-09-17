export const BOOKING_STATUS_LABELS = {
  confirmed: "Confermata", pending: "In attesa", hold: "Opzione", cancelled: "Cancellata",
};

export function bookingConflicts(booking, start, end, editingId) {
  return String(booking.id) !== String(editingId) && booking.status !== "cancelled"
    && booking.checkin_date < end && booking.checkout_date > start;
}

export function filterBookings(bookings, { unit = "all", payment = "all", view = "all", query = "", today }, units = {}) {
  const search = query.trim().toLocaleLowerCase("it");
  return bookings.filter(booking => {
    if (unit !== "all" && String(booking.unit_id) !== unit) return false;
    if (payment !== "all" && booking.status === "cancelled") return false;
    if (payment === "paid" && !booking.is_paid) return false;
    if (payment === "unpaid" && booking.is_paid) return false;
    if (view === "cancelled" && booking.status !== "cancelled") return false;
    if (["arrivals", "departures", "in-house"].includes(view) && booking.status !== "confirmed") return false;
    if (view === "arrivals" && booking.checkin_date !== today) return false;
    if (view === "departures" && booking.checkout_date !== today) return false;
    if (view === "in-house" && !(booking.checkin_date <= today && booking.checkout_date > today)) return false;
    const text = [booking.guest_name, booking.guest_email, booking.guest_phone, units[booking.unit_id]?.name, booking.id].join(" ").toLocaleLowerCase("it");
    return !search || text.includes(search);
  }).sort((a, b) => a.checkin_date.localeCompare(b.checkin_date) || a.id - b.id);
}
