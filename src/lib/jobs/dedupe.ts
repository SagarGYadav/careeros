// Duplicate detection (SPEC §10.4). Two postings are the same job when they share provider + external id, or
// the same description, or the same company and city with titles at least 90% alike within 30 days. Duplicates
// are merged: the fuller description wins and every apply link is kept.
import { normalizeForMatch, similarity } from "@/lib/cv/text";
import type { ApplyLink } from "@/lib/jobsearch/types";

export type DedupeKey = {
  provider: string;
  externalId: string;
  companyKey: string;
  city: string | null;
  title: string;
  descriptionHash: string;
  postedAt: Date | null;
};

const MAX_DAYS_APART = 30;

/** Title for comparison: "React.js Developer" = "ReactJS Developer" = "React Developer"; "SDE II" = "SDE 2". */
export function titleKey(title: string): string {
  return normalizeForMatch(title)
    .replace(/\b(\w+)\.?js\b/g, "$1")
    .replace(/\bjs\b/g, " ")
    .replace(/\biii\b/g, "3")
    .replace(/\bii\b/g, "2")
    .replace(/\bsr\b/g, "senior")
    .replace(/\bjr\b/g, "junior")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function isSameJob(a: DedupeKey, b: DedupeKey): boolean {
  if (a.provider === b.provider && a.externalId === b.externalId) return true;
  if (a.descriptionHash && a.descriptionHash === b.descriptionHash) return true;
  if (!a.companyKey || a.companyKey !== b.companyKey || (a.city ?? "") !== (b.city ?? "")) return false;
  if (a.postedAt && b.postedAt && Math.abs(a.postedAt.getTime() - b.postedAt.getTime()) > MAX_DAYS_APART * 86_400_000) {
    return false;
  }
  return similarity(titleKey(a.title), titleKey(b.title)) >= 0.9;
}

/** Apply links from both postings, each URL once, the primary's first. */
export function mergeApplyLinks(primary: ApplyLink[], other: ApplyLink[]): ApplyLink[] {
  const seen = new Set<string>();
  return [...primary, ...other].filter((link) => {
    const key = link.url
      .replace(/[?#].*$/, "")
      .replace(/\/+$/, "")
      .toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Which of two duplicates keeps its description: a full one beats a cut one, then the longer. */
export function preferDescription(
  a: { description: string; truncated: boolean },
  b: { description: string; truncated: boolean },
) {
  if (a.truncated !== b.truncated) return a.truncated ? "b" : "a";
  return b.description.length > a.description.length ? "b" : "a";
}
