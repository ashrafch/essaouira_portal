/**
 * Shared display formatters (it-IT locale).
 *
 * Unifies currency/percent/number rendering so pages stop mixing "EUR 123"
 * with "€ 1.234" and hand-rolled `toLocaleString()` calls.
 */

const CURRENCY_SYMBOLS = {
  EUR: "€",
  USD: "$",
  GBP: "£",
  MAD: "DH",
};

/**
 * Currency as `€ 1.234` (symbol before, it-IT grouping). Falls back to the
 * raw currency code for unknown currencies. Returns "—" for null/NaN.
 */
export function formatCurrency(value, currency = "EUR", { decimals = 0 } = {}) {
  const n = Number(value);
  if (value === null || value === undefined || Number.isNaN(n)) return "—";
  const symbol = CURRENCY_SYMBOLS[currency] || currency;
  const formatted = new Intl.NumberFormat("it-IT", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(n);
  return `${symbol} ${formatted}`;
}

/** Percent as `73%`. Returns "—" for null/NaN. */
export function formatPercent(value, { decimals = 0 } = {}) {
  const n = Number(value);
  if (value === null || value === undefined || Number.isNaN(n)) return "—";
  return `${n.toFixed(decimals)}%`;
}

/** Plain number with it-IT grouping. Returns "—" for null/NaN. */
export function formatNumber(value, { decimals = 0 } = {}) {
  const n = Number(value);
  if (value === null || value === undefined || Number.isNaN(n)) return "—";
  return new Intl.NumberFormat("it-IT", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(n);
}
