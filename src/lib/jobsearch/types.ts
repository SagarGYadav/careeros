// Job-site search providers (SPEC §10.3). Every provider maps its own API to NormalizedJob; cleaning that is the
// same for all providers (company suffixes, city names, salary parsing, dedupe) happens later in the search run.
import type { ProviderInfo } from "@/lib/providers/types";

export type JobSearchProviderName = "adzuna" | "jooble" | "serpapi" | "mock";

export type DatePosted = "day" | "3days" | "week" | "month";

export type JobSearchParams = {
  /** A title variant of a target role, e.g. "React Developer". Never contains personal details. */
  query: string;
  keywords?: string[];
  /** A city ("Bengaluru") or "Remote". */
  location: string;
  /** ISO country code, e.g. "in". */
  country: string;
  datePosted?: DatePosted;
  /** Annual, in the country's currency. */
  salaryMin?: number;
  /** Provider-specific cursor from the previous page. */
  page?: string;
};

export type ApplyLink = { site: string; url: string };

/** One posting as a provider returned it, mapped to common fields. */
export type NormalizedJob = {
  provider: JobSearchProviderName;
  externalId: string;
  title: string;
  company: string;
  location: string;
  description: string;
  /** The provider only gave a snippet or shortened description. */
  descriptionTruncated: boolean;
  /** As the provider wrote it, e.g. "₹8L – ₹12L a year"; parsed later. */
  salaryText: string | null;
  salaryMin: number | null;
  salaryMax: number | null;
  /** Adzuna estimates salaries it wasn't given; those are not shown as disclosed. */
  salaryEstimated: boolean;
  employmentType: string | null;
  workModeHint: "remote" | "hybrid" | "onsite" | null;
  postedAt: Date | null;
  /** Where the posting was found, e.g. "LinkedIn" or "Acme Careers" (Google Jobs "via"). */
  postedVia: string | null;
  applyLinks: ApplyLink[];
};

export type JobSearchResult = {
  jobs: NormalizedJob[];
  nextPage?: string;
  /** Requests this call used (counted against the provider's quota). */
  requestsUsed: number;
  /** Allowance left as reported by the provider itself, when it reports one (SerpApi). */
  reportedRemaining?: number | null;
};

export type JobSearchProvider = ProviderInfo & {
  name: JobSearchProviderName;
  search(params: JobSearchParams): Promise<JobSearchResult>;
  /** A connection check that doesn't use a search (SerpApi's account endpoint). */
  check?: () => Promise<string>;
};

/** Thrown for a failed HTTP call so the provider chain can classify it like any other provider failure. */
export class ProviderHttpError extends Error {
  constructor(
    readonly provider: string,
    readonly status: number,
    readonly body: string,
    readonly retryAfter: string | null,
  ) {
    super(`${provider}: HTTP ${status}`);
    this.name = "ProviderHttpError";
  }
}
