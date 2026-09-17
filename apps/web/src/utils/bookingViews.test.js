import { describe, expect, it } from "vitest";
import { bookingConflicts, filterBookings } from "./bookingViews";

const booking = { id: 1, unit_id: 3, status: "confirmed", guest_name: "Sara Rossi", guest_email: "sara@example.test", guest_phone: "+390123", checkin_date: "2026-09-16", checkout_date: "2026-09-18", is_paid: false };
const today = "2026-09-16";
const rows = [booking, { ...booking, id: 2, status: "cancelled" }, { ...booking, id: 3, status: "pending" }, { ...booking, id: 4, status: "hold" }];
describe("booking views", () => {
  it("excludes cancelled bookings from conflicts but reserves pending and hold", () => {
    expect(rows.map(row => bookingConflicts(row, today, "2026-09-17", null))).toEqual([true, false, true, true]);
  });
  it("permits adjacent stays and excludes the edited booking regardless of ID type", () => {
    expect(bookingConflicts(booking, "2026-09-18", "2026-09-19", null)).toBe(false);
    expect(bookingConflicts(booking, "2026-09-15", today, null)).toBe(false);
    expect(bookingConflicts(booking, today, "2026-09-17", "1")).toBe(false);
  });
  it.each(["arrivals", "in-house"])("only confirmed bookings appear in %s", view => {
    expect(filterBookings(rows, { today, view }).map(row => row.id)).toEqual([1]);
  });
  it("uses exclusive checkout for in-house and exact checkout for departures", () => {
    expect(filterBookings(rows, { today: "2026-09-18", view: "in-house" })).toEqual([]);
    expect(filterBookings(rows, { today: "2026-09-18", view: "departures" })).toEqual([booking]);
  });
  it("does not present cancelled stays as receivables", () => {
    expect(filterBookings(rows, { payment: "unpaid" }).map(row => row.id)).toEqual([1, 3, 4]);
    expect(filterBookings(rows, { view: "cancelled" }).map(row => row.id)).toEqual([2]);
  });
  it.each([" SARA ", "example.test", "+390123", "terrasse"])("searches guest contacts and unit names: %s", query => {
    expect(filterBookings([booking], { query }, { 3: { name: "Terrasse" } })).toEqual([booking]);
  });
  it("combines filters and does not mutate source order", () => {
    const input = [{ ...booking, id: 5, checkin_date: "2026-10-01" }, booking];
    expect(filterBookings(input, { unit: "3", payment: "unpaid" }).map(row => row.id)).toEqual([1, 5]);
    expect(input[0].id).toBe(5);
    expect(filterBookings(input, { unit: "4" })).toEqual([]);
  });
});
