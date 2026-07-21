/**
 * Shared date helpers (it-IT).
 *
 * These were previously re-implemented independently in Calendar.jsx,
 * Bookings.jsx and Staff.jsx. Keep them here as the single source of truth so
 * date math stays consistent across the portal.
 */

export const MONTH_LABELS = [
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

// Monday-first, matching the calendar grid used across the portal.
export const WEEKDAY_LABELS = ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"];

/** Local-midnight copy of a date (avoids DST/time drift in day math). */
export function startOfDay(d) {
  const nd = new Date(d);
  nd.setHours(0, 0, 0, 0);
  return nd;
}

/** New date shifted by `days` (can be negative). */
export function addDays(d, days) {
  const nd = new Date(d);
  nd.setDate(nd.getDate() + days);
  return nd;
}

/** `YYYY-MM-DD` in local time (not UTC — avoids off-by-one near midnight). */
export function formatISO(d) {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** True when a and b fall on the same calendar day. */
export function isSameDay(a, b) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/** Number of nights between two dates (checkout - checkin), in whole days. */
export function nightsBetween(checkin, checkout) {
  const start = startOfDay(new Date(checkin));
  const end = startOfDay(new Date(checkout));
  return Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
}

/**
 * Weeks of a month as arrays of 7 Date objects, Monday-first, Google-Calendar
 * style (leading/trailing days from adjacent months included).
 */
export function getWeeksForMonth(year, month) {
  const firstOfMonth = new Date(year, month, 1);
  const start = new Date(firstOfMonth);
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
