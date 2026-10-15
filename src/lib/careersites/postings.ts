// What every career-site source (ATS API, JSON-LD, careers page) produces, and the local filters applied before
// anything joins the job pipeline (SPEC §11.3): the title must match a target role, the place must suit the user,
// and the posting must be recent.
import { indianCity } from "@/lib/jobs/normalize";

export type SitePosting = {
  /** Stable id within the site (the ATS's id, or the posting's URL). */
  externalId: string;
  title: string;
  company: string;
  location: string;
  /** Plain text. */
  description: string;
  /** The posting's page on the company's site (the "Direct from company site" link). */
  url: string;
  applyUrl: string | null;
  postedAt: Date | null;
  employmentType: string | null;
  workModeHint: "remote" | "hybrid" | "onsite" | null;
  salaryText: string | null;
};

const GENERIC = new Set([
  "senior",
  "sr",
  "junior",
  "jr",
  "lead",
  "principal",
  "staff",
  "associate",
  "intern",
  "trainee",
  "developer",
  "engineer",
  "engineering",
  "software",
  "sde",
  "i",
  "ii",
  "iii",
  "1",
  "2",
  "3",
  "the",
  "and",
  "of",
  "for",
  "-",
  "&",
]);

/** The words of a role title that say what the role is ("frontend", "react"), not its level. */
export function roleWords(title: string): string[] {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9+#.\s-]/g, " ")
    .split(/[\s/-]+/)
    .map((w) => w.replace(/\.$/, ""))
    .filter((w) => w.length > 1 && !GENERIC.has(w));
}

/** "Front-end", "Full stack" and "Back end" written as one word, so every spelling compares the same. */
const joinCompounds = (title: string) =>
  title
    .replace(/front[\s-]end/gi, "frontend")
    .replace(/full[\s-]stack/gi, "fullstack")
    .replace(/back[\s-]end/gi, "backend");

/** A posting title fits a target role when it contains every role word of one of its title variants. */
export function titleMatches(title: string, variants: string[]): boolean {
  const words = new Set(roleWords(joinCompounds(title)));
  return variants.some((variant) => {
    const wanted = roleWords(joinCompounds(variant));
    return wanted.length > 0 && wanted.every((w) => words.has(w));
  });
}

const INDIA = /\bindia\b|\bbharat\b/i;
const REMOTE = /\bremote\b|\banywhere\b|\bwork from home\b/i;
// Remote roles restricted to another region aren't open to someone in India.
const OTHER_REGION = /\b(us|usa|united states|canada|uk|united kingdom|europe|eu|emea|latam|germany|australia)\b/i;

/**
 * The place suits the user: one of their cities, anywhere in India when they named no city, or a remote role open
 * to India (remote with no other region, or naming India/APAC/Asia) when they work remotely.
 */
export function locationMatches(
  location: string,
  workModeHint: SitePosting["workModeHint"],
  prefs: { cities: string[]; remoteOk: boolean },
): boolean {
  const city = indianCity(location);
  if (city && prefs.cities.includes(city)) return true;
  const remote = workModeHint === "remote" || REMOTE.test(location);
  if (remote && prefs.remoteOk)
    return INDIA.test(location) || /\b(apac|asia)\b/i.test(location) || !OTHER_REGION.test(location);
  if (!prefs.cities.length) return INDIA.test(location) || Boolean(city);
  return false;
}

/** Postings older than this are skipped (job sites already drop them after 30 days; companies keep some longer). */
export const MAX_POSTING_AGE_DAYS = 60;

export function isFresh(postedAt: Date | null, now: Date): boolean {
  return !postedAt || now.getTime() - postedAt.getTime() <= MAX_POSTING_AGE_DAYS * 86_400_000;
}

export type PostingFilter = {
  titleVariants: string[];
  cities: string[];
  remoteOk: boolean;
  now: Date;
};

export function wantPosting(
  p: Pick<SitePosting, "title" | "location" | "workModeHint" | "postedAt">,
  f: PostingFilter,
) {
  return (
    titleMatches(p.title, f.titleVariants) &&
    locationMatches(p.location, p.workModeHint, f) &&
    isFresh(p.postedAt, f.now)
  );
}
