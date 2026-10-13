// Turns job-search details written in a CV ("8.5 LPA", "60 days") into preference values. Code parses; nothing
// is guessed: anything unclear stays empty for the user to fill in.

/** "8.5 LPA", "₹8,50,000", "12 lakhs", "8.5L", "850000" → annual INR. Ranges ("8-12 LPA") give their lower end. */
export function parseCtcToAnnualInr(text: string | null | undefined): number | null {
  if (!text) return null;
  const s = text
    .toLowerCase()
    .replace(/,/g, "")
    .replace(/₹|rs\.?|inr/g, "")
    .trim();
  const lakhs = s.match(/(\d+(?:\.\d+)?)\s*(?:-\s*\d+(?:\.\d+)?\s*)?(?:lpa|l\b|lakhs?|lacs?)/);
  if (lakhs) return Math.round(Number(lakhs[1]) * 100_000);
  const crore = s.match(/(\d+(?:\.\d+)?)\s*(?:cr|crores?)\b/);
  if (crore) return Math.round(Number(crore[1]) * 10_000_000);
  const monthly = s.match(/(\d+(?:\.\d+)?)\s*(k)?\s*(?:\/|per)\s*(?:month|mo)\b/);
  if (monthly) return Math.round(Number(monthly[1]) * (monthly[2] ? 1000 : 1) * 12);
  const plain = s.match(/^(\d{5,9})(?:\s*(?:per annum|pa|\/year|a year))?$/);
  if (plain) return Number(plain[1]);
  return null;
}

/** "60 days", "2 months", "Immediate", "1 week" → days. */
export function parseNoticePeriodDays(text: string | null | undefined): number | null {
  if (!text) return null;
  const s = text.toLowerCase().trim();
  if (/immediate|serving.*0|none|nil/.test(s)) return 0;
  const m = s.match(/(\d+(?:\.\d+)?)\s*(days?|weeks?|months?)/);
  if (!m) return /^\d{1,3}$/.test(s) ? Number(s) : null;
  const n = Number(m[1]);
  if (m[2].startsWith("day")) return Math.round(n);
  if (m[2].startsWith("week")) return Math.round(n * 7);
  return Math.round(n * 30);
}

const WORK_MODE_WORDS: Record<string, "remote" | "hybrid" | "onsite"> = {
  remote: "remote",
  "work from home": "remote",
  wfh: "remote",
  hybrid: "hybrid",
  onsite: "onsite",
  "on-site": "onsite",
};

/** Splits "Gurugram, Noida, Remote" into places and work modes. */
export function splitPreferredLocations(items: string[]): {
  locations: string[];
  workModes: ("remote" | "hybrid" | "onsite")[];
} {
  const locations: string[] = [];
  const workModes = new Set<"remote" | "hybrid" | "onsite">();
  for (const item of items) {
    const mode = WORK_MODE_WORDS[item.trim().toLowerCase()];
    if (mode) workModes.add(mode);
    else if (item.trim()) locations.push(item.trim());
  }
  return { locations, workModes: [...workModes] };
}
