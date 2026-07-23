import { describe, expect, it } from "vitest";
import { formatCurrency, formatNumber, formatPercent } from "./format";

describe("formatCurrency", () => {
  it("formats EUR with symbol (grouping is locale/ICU dependent)", () => {
    // Accept grouped ("€ 1.234") or ungrouped ("€ 1234") depending on the ICU
    // data available in the runtime.
    expect(formatCurrency(1234)).toMatch(/^€\s1\D?234$/);
  });
  it("returns em dash for null / undefined / NaN", () => {
    expect(formatCurrency(null)).toBe("—");
    expect(formatCurrency(undefined)).toBe("—");
    expect(formatCurrency("abc")).toBe("—");
  });
  it("maps known currency codes to symbols", () => {
    expect(formatCurrency(50, "USD")).toContain("$");
    expect(formatCurrency(50, "GBP")).toContain("£");
  });
});

describe("formatPercent", () => {
  it("formats integers and decimals", () => {
    expect(formatPercent(73)).toBe("73%");
    expect(formatPercent(73.45, { decimals: 1 })).toBe("73.5%");
  });
  it("returns em dash for null", () => {
    expect(formatPercent(null)).toBe("—");
  });
});

describe("formatNumber", () => {
  it("renders all digits (grouping is locale/ICU dependent)", () => {
    expect(formatNumber(1234567)).toMatch(/^1\D?234\D?567$/);
  });
});
