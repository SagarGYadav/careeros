// CV dates and experience maths (SPEC §9.1 step 4). Code computes durations, totals, overlaps and gaps; the AI
// only copies dates as written. Dates are "YYYY-MM" strings, or "YYYY" when the CV gives only a year.

export type YearMonth = string;

const MONTHS: Record<string, number> = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4, may: 5, jun: 6, june: 6,
  jul: 7, july: 7, aug: 8, august: 8, sep: 9, sept: 9, september: 9, oct: 10, october: 10, nov: 11,
  november: 11, dec: 12, december: 12,
}; // prettier-ignore

const PRESENT_WORDS = /^(present|current|currently|now|till date|till now|to date|date|ongoing|today|working)$/i;

const MONTH_NAME =
  "(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\\.?";
// Month-name dates first, then MM/YYYY, then a bare year: the order avoids reading "2016-2020" as month 20.
const DATE_TOKEN = `(?:${MONTH_NAME},?\\s*'?\\d{2,4}|\\d{1,2}[/.]\\d{4}|(?:19|20)\\d{2})`;
const END_TOKEN = `(?:${DATE_TOKEN}|present|current(?:ly)?|now|till\\s+(?:date|now)|to\\s+date|ongoing|today)`;
const RANGE_RE = new RegExp(`\\b(${DATE_TOKEN})\\s*(?:–|—|-|to|till|until)\\s*(${END_TOKEN})\\b`, "i");
const SINGLE_DATE_RE = new RegExp(`\\b${DATE_TOKEN}\\b`, "gi");

const ym = (year: number, month: number) => `${year}-${String(month).padStart(2, "0")}`;
const plausibleYear = (year: number) => year >= 1950 && year <= 2100;
const fullYear = (value: string) => (value.length === 2 ? 2000 + Number(value) : Number(value));

export function isPresentWord(value: string): boolean {
  return PRESENT_WORDS.test(
    value
      .trim()
      .replace(/[.\s]+$/, "")
      .replace(/\s+/g, " "),
  );
}

/** "Apr 2023", "April 2023", "04/2023", "2023-04", "Apr '23", "14 March 1997", "2023" → "2023-04" or "2023". */
export function parseCvDate(input: string | null | undefined): YearMonth | null {
  if (!input) return null;
  const s = input
    .trim()
    .replace(/[.,;]+$/, "")
    .replace(/\s+/g, " ");
  let m = s.match(/^([A-Za-z]{3,9})\.?,?\s*'?(\d{4}|\d{2})$/);
  if (m) {
    const month = MONTHS[m[1].toLowerCase()];
    const year = fullYear(m[2]);
    return month && plausibleYear(year) ? ym(year, month) : null;
  }
  m = s.match(/^(\d{1,2})\s*[/.-]\s*(\d{4})$/);
  if (m) return Number(m[1]) >= 1 && Number(m[1]) <= 12 && plausibleYear(Number(m[2])) ? ym(+m[2], +m[1]) : null;
  m = s.match(/^(\d{4})\s*[/.-]\s*(\d{1,2})$/);
  if (m) return Number(m[2]) >= 1 && Number(m[2]) <= 12 && plausibleYear(Number(m[1])) ? ym(+m[1], +m[2]) : null;
  m =
    s.match(/^\d{1,2}(?:st|nd|rd|th)?\s+([A-Za-z]{3,9}),?\s+(\d{4})$/) ??
    s.match(/^([A-Za-z]{3,9})\s+\d{1,2},?\s+(\d{4})$/);
  if (m) {
    const month = MONTHS[m[1].toLowerCase()];
    return month && plausibleYear(Number(m[2])) ? ym(Number(m[2]), month) : null;
  }
  m = s.match(/^(\d{4})$/);
  if (m) return plausibleYear(Number(m[1])) ? m[1] : null;
  return null;
}

export type DateRange = { start: string; end: string | null; isCurrent: boolean; raw: string; index: number };

/** The first "start – end" range in a line, with both ends as written ("Apr 2023", "Present" → end null). */
export function findDateRange(text: string): DateRange | null {
  const m = RANGE_RE.exec(text);
  if (!m) return null;
  const isCurrent = isPresentWord(m[2]);
  return { start: m[1].trim(), end: isCurrent ? null : m[2].trim(), isCurrent, raw: m[0], index: m.index };
}

/** Every single date in a line (month-year or year), as written. */
export function findDates(text: string): string[] {
  return [...text.matchAll(SINGLE_DATE_RE)].map((m) => m[0].trim());
}

/** Months since year 0; a year-only date counts as June so an estimate errs neither way. */
export function monthIndex(value: YearMonth): number {
  const [year, month] = value.split("-").map(Number);
  return year * 12 + ((month || 6) - 1);
}

export function currentYearMonth(now: Date): YearMonth {
  return ym(now.getUTCFullYear(), now.getUTCMonth() + 1);
}

/** Inclusive month count, the way LinkedIn shows it: Jul 2021 – Mar 2023 is 21 months. */
export function monthsBetween(start: YearMonth, end: YearMonth): number {
  return Math.max(0, monthIndex(end) - monthIndex(start) + 1);
}

export type Interval = { start: YearMonth; end: YearMonth | null; label?: string };
export type ExperienceTotals = {
  totalMonths: number;
  gaps: { from: YearMonth; to: YearMonth; months: number }[];
  overlaps: { a: string; b: string; months: number }[];
};

const fromIndex = (index: number) => ym(Math.floor(index / 12), (index % 12) + 1);

/** Total experience with overlapping roles counted once, gaps over 3 months, and overlapping pairs. */
export function experienceTotals(intervals: Interval[], now: Date, gapThresholdMonths = 3): ExperienceTotals {
  const current = monthIndex(currentYearMonth(now));
  const spans = intervals
    .map((iv) => ({ label: iv.label ?? "", from: monthIndex(iv.start), to: iv.end ? monthIndex(iv.end) : current }))
    .filter((s) => s.to >= s.from)
    .sort((a, b) => a.from - b.from);

  const overlaps: ExperienceTotals["overlaps"] = [];
  for (let i = 0; i < spans.length; i++) {
    for (let j = i + 1; j < spans.length; j++) {
      const months = Math.min(spans[i].to, spans[j].to) - spans[j].from + 1;
      if (months > 0) overlaps.push({ a: spans[i].label, b: spans[j].label, months });
    }
  }

  const merged: { from: number; to: number }[] = [];
  for (const span of spans) {
    const last = merged.at(-1);
    if (last && span.from <= last.to + 1) last.to = Math.max(last.to, span.to);
    else merged.push({ from: span.from, to: span.to });
  }

  const gaps: ExperienceTotals["gaps"] = [];
  for (let i = 1; i < merged.length; i++) {
    const months = merged[i].from - merged[i - 1].to - 1;
    if (months > gapThresholdMonths) {
      gaps.push({ from: fromIndex(merged[i - 1].to + 1), to: fromIndex(merged[i].from - 1), months });
    }
  }

  return { totalMonths: merged.reduce((sum, m) => sum + (m.to - m.from + 1), 0), gaps, overlaps };
}
