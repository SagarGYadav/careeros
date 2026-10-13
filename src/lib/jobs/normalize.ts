// Cleaning that is the same for every provider (SPEC §10.4): company names without legal suffixes, canonical city
// names, work mode, a description hash for duplicate detection, staffing agencies and direct-from-company postings.
import { createHash } from "node:crypto";
import { normalizeForMatch } from "@/lib/cv/text";

const LEGAL_SUFFIXES =
  /[\s,]+(?:pvt\.?\s*ltd\.?|private\s+limited|pvt\.?|limited|ltd\.?|llp|inc\.?|llc|corp\.?|corporation|gmbh|plc|co\.)$/i;

/** "Kestrel Pay Pvt. Ltd." → "Kestrel Pay" (shown to the user). */
export function displayCompanyName(name: string): string {
  let result = name.trim();
  for (let i = 0; i < 3 && LEGAL_SUFFIXES.test(result); i++) result = result.replace(LEGAL_SUFFIXES, "").trim();
  return result || name.trim();
}

// Generic trailing words left out of the matching key, so "Banyan Analytics Technologies" = "Banyan Analytics".
const GENERIC_TAIL = /\s+(?:technologies|technology|tech|solutions|services|software|systems|india|labs|global)$/;

/** Matching key: lower case, no suffixes or punctuation ("Quill Commerce Pvt Ltd" → "quill commerce"). */
export function companyKey(name: string): string {
  let key = normalizeForMatch(displayCompanyName(name))
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  for (let i = 0; i < 2 && GENERIC_TAIL.test(key) && key.split(" ").length > 1; i++)
    key = key.replace(GENERIC_TAIL, "");
  return key;
}

const CITY_ALIASES: [RegExp, string][] = [
  [/^(remote|work from home|wfh|anywhere)/, "Remote-India"],
  [/^(bengaluru|bangalore|bangalore urban|bengaluru urban)$/, "Bengaluru"],
  [/^(gurugram|gurgaon)$/, "Gurugram"],
  [/^(mumbai|bombay|navi mumbai|thane)$/, "Mumbai"],
  [/^(new delhi|delhi|delhi ncr|ncr)$/, "Delhi"],
  [/^(noida|greater noida)$/, "Noida"],
  [/^(hyderabad|secunderabad)$/, "Hyderabad"],
  [/^(chennai|madras)$/, "Chennai"],
  [/^(kolkata|calcutta)$/, "Kolkata"],
  [/^(pune|pimpri chinchwad)$/, "Pune"],
  [/^(kochi|cochin)$/, "Kochi"],
  [/^(thiruvananthapuram|trivandrum)$/, "Thiruvananthapuram"],
  [/^(india|in)$/, "India"],
];

/** "Bangalore, Karnataka" → "Bengaluru"; "Remote, India" → "Remote-India"; unknown cities keep their own name. */
export function canonicalCity(location: string | null | undefined): string | null {
  if (!location?.trim()) return null;
  const first = normalizeForMatch(location.split(/[,(/|]/)[0]).trim();
  if (!first) return null;
  for (const [pattern, city] of CITY_ALIASES) if (pattern.test(first)) return city;
  return first.replace(/\b\w/g, (c) => c.toUpperCase());
}

export function detectWorkMode(
  location: string,
  description: string,
  hint: "remote" | "hybrid" | "onsite" | null,
): "remote" | "hybrid" | "onsite" | null {
  if (hint) return hint;
  const text = `${location}\n${description}`.toLowerCase();
  if (/\bhybrid\b|\d\s*days?\s*(a|per)\s*week\s*(in|from)\s*(the\s*)?office/.test(text)) return "hybrid";
  if (/\b(fully\s+remote|100%\s*remote|remote[-\s]first|work\s+from\s+home|wfh)\b|^remote/.test(text)) return "remote";
  if (/\b(work\s+from\s+office|wfo|on[-\s]?site|in[-\s]office)\b/.test(text)) return "onsite";
  return null;
}

/** Same text (ignoring case, spacing and punctuation) → same hash, for duplicate detection. */
export function descriptionHash(description: string): string {
  const text = normalizeForMatch(description)
    .replace(/[^a-z0-9 ]+/g, "")
    .slice(0, 3000);
  return createHash("sha256").update(text).digest("hex").slice(0, 32);
}

const STAFFING =
  /\b(staffing|recruit\w*|placement\w*|manpower|consultan(cy|ts)|hr\s+solutions|talent\s+(acquisition|solutions|bridge)|search\s+partners|outsourcing)\b/i;

export function isStaffingAgency(company: string): boolean {
  return STAFFING.test(company);
}

/**
 * Posted by the employer itself: the "via" names the company's own careers site, or an apply link points at a
 * company or ATS careers domain rather than a job board.
 */
export function isDirectFromCompany(company: string, postedVia: string | null, applyUrls: string[]): boolean {
  const key = companyKey(company).split(" ")[0];
  const via = (postedVia ?? "").toLowerCase();
  if (key && key.length > 2 && via.includes(key) && /career|jobs|company/.test(via)) return true;
  if (/^company website$/i.test(postedVia ?? "")) return true;
  return applyUrls.some((url) => {
    try {
      const host = new URL(url).hostname.toLowerCase();
      if (
        /(greenhouse\.io|lever\.co|ashbyhq\.com|smartrecruiters\.com|recruitee\.com|workable\.com|myworkdayjobs\.com)$/.test(
          host,
        )
      )
        return true;
      return Boolean(key && key.length > 2 && host.includes(key) && /career|jobs/.test(url.toLowerCase()));
    } catch {
      return false;
    }
  });
}
