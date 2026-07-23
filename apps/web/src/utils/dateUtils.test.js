import { describe, expect, it } from "vitest";
import { addDays, formatISO, isSameDay, nightsBetween } from "./dateUtils";

describe("dateUtils", () => {
  it("formatISO returns local YYYY-MM-DD", () => {
    expect(formatISO(new Date(2026, 6, 5))).toBe("2026-07-05");
  });
  it("addDays shifts by whole days", () => {
    expect(formatISO(addDays(new Date(2026, 6, 5), 3))).toBe("2026-07-08");
    expect(formatISO(addDays(new Date(2026, 6, 1), -1))).toBe("2026-06-30");
  });
  it("nightsBetween counts nights", () => {
    expect(nightsBetween("2026-07-05", "2026-07-08")).toBe(3);
    expect(nightsBetween("2026-07-05", "2026-07-05")).toBe(0);
  });
  it("isSameDay ignores time", () => {
    expect(isSameDay(new Date(2026, 6, 5), new Date(2026, 6, 5, 18, 30))).toBe(true);
    expect(isSameDay(new Date(2026, 6, 5), new Date(2026, 6, 6))).toBe(false);
  });
});
