// The "For you" feed (SPEC §10.6): the groups and filters in the page URL, the dismiss reasons, and which score
// reasons a card shows. Pure, so the page, the service and the tests share one definition.
import { z } from "zod";
import type { ScorePart } from "./relevance";

/** "for_you" and "saved" are shown; the others are hidden by default and listed with their counts. */
export const FEED_GROUPS = ["for_you", "saved", "not_fit", "stale", "agency", "blocked", "dismissed"] as const;
export type FeedGroup = (typeof FEED_GROUPS)[number];

export const FEED_GROUP_LABELS: Record<FeedGroup, string> = {
  for_you: "For you",
  saved: "Saved",
  not_fit: "Not a fit",
  stale: "Older than 30 days",
  agency: "Staffing agencies",
  blocked: "Blocked companies",
  dismissed: "Dismissed",
};

export const DISMISS_REASONS = {
  not_relevant: "Not relevant",
  too_senior: "Too senior",
  too_junior: "Too junior",
  location: "Location",
  company: "Company",
  salary: "Salary",
} as const;
export type DismissReason = keyof typeof DISMISS_REASONS;
export const DISMISS_REASON_KEYS = Object.keys(DISMISS_REASONS) as [DismissReason, ...DismissReason[]];

/** Reasons that change ranking (seniority margins, company penalty), so jobs are re-scored after them. */
export const RANKING_REASONS: readonly DismissReason[] = ["too_senior", "too_junior", "company"];

export const POSTED_WITHIN_DAYS = [1, 3, 7, 14, 30] as const;
export const WORK_MODES = ["remote", "hybrid", "onsite"] as const;

export type FeedFilters = {
  group: FeedGroup;
  roleId?: string;
  city?: string;
  workMode?: (typeof WORK_MODES)[number];
  postedWithinDays?: number;
  provider?: string;
  directOnly?: boolean;
  /** Only jobs with a Fit Report. */
  analysedOnly?: boolean;
  /** Annual INR; a job matches when its disclosed range reaches it. */
  salaryMinAnnual?: number;
};

const first = (value: unknown) => (Array.isArray(value) ? value[0] : value);
const optionalText = z.preprocess(first, z.string().trim().min(1).max(80).optional()).catch(undefined);

/** The page URL's search params, with anything invalid dropped rather than failing the page. */
const feedQuerySchema = z.object({
  group: z.preprocess(first, z.enum(FEED_GROUPS)).catch("for_you"),
  role: optionalText,
  city: optionalText,
  mode: z.preprocess(first, z.enum(WORK_MODES).optional()).catch(undefined),
  posted: z
    .preprocess(
      first,
      z.coerce.number().refine((n) => (POSTED_WITHIN_DAYS as readonly number[]).includes(n)),
    )
    .optional()
    .catch(undefined),
  source: optionalText,
  direct: z.preprocess(first, z.literal("1").optional()).catch(undefined),
  analysed: z.preprocess(first, z.literal("1").optional()).catch(undefined),
  /** Lakhs per annum, as the user thinks about salary. */
  salary: z.preprocess(first, z.coerce.number().int().min(1).max(500).optional()).catch(undefined),
  page: z.preprocess(first, z.coerce.number().int().min(1).max(1000)).catch(1),
});

export type FeedQuery = { filters: FeedFilters; page: number };

export function parseFeedQuery(searchParams: Record<string, unknown>): FeedQuery {
  const q = feedQuerySchema.parse(searchParams);
  return {
    page: q.page,
    filters: {
      group: q.group,
      roleId: q.role,
      city: q.city,
      workMode: q.mode,
      postedWithinDays: q.posted,
      provider: q.source,
      directOnly: q.direct === "1",
      analysedOnly: q.analysed === "1",
      salaryMinAnnual: q.salary ? q.salary * 100_000 : undefined,
    },
  };
}

/** True when any filter besides the group is set (for "Clear filters" and the empty-state wording). */
export function hasActiveFilters(filters: FeedFilters): boolean {
  return Boolean(
    filters.roleId ||
    filters.city ||
    filters.workMode ||
    filters.postedWithinDays ||
    filters.provider ||
    filters.directOnly ||
    filters.analysedOnly ||
    filters.salaryMinAnnual,
  );
}

const counted = (part: ScorePart) => part.value !== null && !part.neutral;

/** Up to three reasons a job ranks well: the parts that went well (value ≥ 0.6), most points first. */
export function topReasons(parts: ScorePart[], count = 3): string[] {
  return parts
    .filter((part) => counted(part) && part.value! >= 0.6)
    .sort((a, b) => b.points - a.points)
    .slice(0, count)
    .map((part) => part.reason);
}

/** The biggest gap: the weak part (value < 0.5) that lost the most points, or null when nothing is weak. */
export function topGap(parts: ScorePart[]): string | null {
  const weak = parts
    .filter((part) => counted(part) && part.value! < 0.5)
    .sort((a, b) => b.weight - b.points - (a.weight - a.points));
  return weak[0]?.reason ?? null;
}
