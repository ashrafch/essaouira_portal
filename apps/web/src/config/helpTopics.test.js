import { describe, expect, it } from "vitest";
import { GENERAL, resolveHelp } from "./helpTopics";

describe("resolveHelp", () => {
  it("resolves an exact route", () => {
    expect(resolveHelp("/bookings").title).toBe("Prenotazioni");
    expect(resolveHelp("/tariffe-canali").title).toContain("Tariffe");
  });
  it("resolves smart pages by prefix", () => {
    expect(resolveHelp("/smart-devices/5").title).toBe("Smart building");
  });
  it("resolves param routes to their base topic", () => {
    expect(resolveHelp("/units/3/timeline").title).toBe("Appartamenti");
  });
  it("falls back to the general guide", () => {
    expect(resolveHelp("/something-unknown")).toBe(GENERAL);
  });
});
