// parseSalary (SPEC §4): job salaries as annual numbers + currency. Handles the ways Indian postings write pay:
// "8-12 LPA", "₹10,00,000 - ₹16,00,000 a year", "₹1,20,000 - ₹1,60,000 a month", "₹18L – ₹24L a year",
// "$90,000", "Not disclosed".

export type ParsedSalary = {
  minAnnual: number | null;
  maxAnnual: number | null;
  currency: "INR" | "USD" | "EUR" | "GBP" | null;
  disclosed: boolean;
};

const NONE: ParsedSalary = { minAnnual: null, maxAnnual: null, currency: null, disclosed: false };

const amount = (value: string) => Number(value.replace(/,/g, ""));

export function parseSalary(
  text: string | null | undefined,
  defaultCurrency: ParsedSalary["currency"] = "INR",
): ParsedSalary {
  if (!text?.trim()) return NONE;
  const s = text.toLowerCase().replace(/\s+/g, " ").trim();
  if (/not\s+disclosed|negotiable|competitive|as\s+per\s+(company|industry)|best\s+in\s+industry/.test(s)) return NONE;

  const currency: ParsedSalary["currency"] = /\$|usd/.test(s)
    ? "USD"
    : /€|eur/.test(s)
      ? "EUR"
      : /£|gbp/.test(s)
        ? "GBP"
        : /₹|inr|rs\.?|lpa|lakh|lac|crore/.test(s)
          ? "INR"
          : defaultCurrency;

  // Unit applied to each number: lakh / crore / thousand.
  const unitOf = (unit: string | undefined) => {
    if (!unit) return 1;
    if (/^(l|lpa|lakhs?|lacs?)$/.test(unit)) return 100_000;
    if (/^(cr|crores?)$/.test(unit)) return 10_000_000;
    if (/^k$/.test(unit)) return 1_000;
    return 1;
  };
  const numberRe = "(\\d[\\d,]*(?:\\.\\d+)?)\\s*(lpa|l|lakhs?|lacs?|cr|crores?|k)?";
  const range = s.match(new RegExp(`${numberRe}\\s*(?:-|–|—|to)\\s*[₹$€£]?\\s*${numberRe}`));
  const single = range ? null : s.match(new RegExp(numberRe));
  if (!range && !single) return NONE;

  let min: number;
  let max: number;
  if (range) {
    // "8-12 LPA": the unit after the second number applies to both.
    const unit = range[4] ?? range[2];
    min = amount(range[1]) * unitOf(range[2] ?? unit);
    max = amount(range[3]) * unitOf(range[4] ?? range[2]);
  } else {
    min = max = amount(single![1]) * unitOf(single![2]);
  }

  // Per month / hour → per year.
  const period = /(per|a|\/)\s*month|monthly|p\.?m\.?\b|\/mo\b/.test(s)
    ? 12
    : /(per|an?|\/)\s*hour|hourly/.test(s)
      ? 2080
      : 1;
  min *= period;
  max *= period;
  // A bare "12" with an INR context almost always means lakhs ("Salary: 12-15").
  if (currency === "INR" && max < 1000) {
    min *= 100_000;
    max *= 100_000;
  }
  if (!Number.isFinite(min) || !Number.isFinite(max) || max <= 0) return NONE;
  return {
    minAnnual: Math.round(Math.min(min, max)),
    maxAnnual: Math.round(Math.max(min, max)),
    currency,
    disclosed: true,
  };
}
