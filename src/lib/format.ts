// Display formatters (SPEC §21 "Formatting"). Pure functions; unit-tested in tests/unit/format.test.ts.

/** Up to two initials for avatars: "Asha Rao" → "AR", "asha" → "A". */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const first = parts[0][0] ?? "";
  const last = parts.length > 1 ? (parts[parts.length - 1][0] ?? "") : "";
  return `${first}${last}`.toUpperCase();
}

/** First name for greetings: "Asha Rao" → "Asha". */
export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? name;
}

const indianNumber = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });

/** Indian digit grouping: 1200000 → "12,00,000". */
export function formatNumber(value: number): string {
  return indianNumber.format(value);
}

/** Money in any currency; INR uses Indian grouping: (1200000, "INR") → "₹12,00,000". */
export function formatMoney(amount: number, currency = "INR"): string {
  const locale = currency === "INR" ? "en-IN" : "en-US";
  return new Intl.NumberFormat(locale, { style: "currency", currency, maximumFractionDigits: 0 }).format(amount);
}

/** 1 LPA = ₹1,00,000 per year. */
export const RUPEES_PER_LAKH = 100_000;

/** Lakhs per annum with at most one decimal and no trailing ".0": 1250000 → "12.5", 1200000 → "12". */
function lakhs(annualInr: number): string {
  return (Math.round((annualInr / RUPEES_PER_LAKH) * 10) / 10).toString();
}

/** Annual INR as LPA: 1200000 → "12 LPA". */
export function formatLpa(annualInr: number): string {
  return `${lakhs(annualInr)} LPA`;
}

/**
 * Annual salary range for display. INR in LPA ("8–12 LPA"), other currencies compact ("$90K–$120K").
 * Either bound may be missing; both missing → "Not disclosed".
 */
export function formatSalaryRange(min: number | null | undefined, max: number | null | undefined, currency = "INR") {
  if (min == null && max == null) return "Not disclosed";
  if (currency === "INR") {
    if (min != null && max != null) return min === max ? formatLpa(min) : `${lakhs(min)}–${lakhs(max)} LPA`;
    return min != null ? `${formatLpa(min)}+` : `Up to ${formatLpa(max!)}`;
  }
  const compact = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    notation: "compact",
    minimumFractionDigits: 0,
    maximumFractionDigits: 1,
  });
  if (min != null && max != null)
    return min === max ? compact.format(min) : `${compact.format(min)}–${compact.format(max)}`;
  return min != null ? `${compact.format(min)}+` : `Up to ${compact.format(max!)}`;
}

/** Rate (0–1) as a percentage: 0.2642 → "26.4%". */
export function formatPercent(rate: number, fractionDigits = 1): string {
  return `${(rate * 100).toFixed(fractionDigits)}%`;
}

const dateFormat = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric" });

/** "9 Oct 2026". */
export function formatDate(date: Date | string): string {
  return dateFormat.format(new Date(date));
}

const relative = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 365 * 24 * 3600],
  ["month", 30 * 24 * 3600],
  ["week", 7 * 24 * 3600],
  ["day", 24 * 3600],
  ["hour", 3600],
  ["minute", 60],
];

/** "3 days ago", "yesterday", "in 2 hours", "just now". `now` is a parameter so it can be tested. */
export function formatRelative(date: Date | string, now: Date = new Date()): string {
  const seconds = Math.round((new Date(date).getTime() - now.getTime()) / 1000);
  for (const [unit, size] of UNITS) {
    if (Math.abs(seconds) >= size) return relative.format(Math.trunc(seconds / size), unit);
  }
  return "just now";
}
