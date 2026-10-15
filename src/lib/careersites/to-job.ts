// A posting read from a company's own career site, as a job for the standard pipeline (SPEC §11.3): the same
// cleaning, dedupe, embedding and ranking as job-site results, marked "Direct from company site", with the company's
// own page as the apply link.
import type { IncomingJob } from "@/lib/jobs/prepare";
import { titleMatches, type SitePosting } from "./postings";

export function postingToJob(siteKey: string, posting: SitePosting): IncomingJob {
  return {
    provider: "company_site",
    // Unique within the user's jobs: the site plus the ATS's own id (or the posting's URL).
    externalId: `${siteKey}:${posting.externalId}`.slice(0, 300),
    title: posting.title,
    company: posting.company,
    location: posting.location,
    description: posting.description,
    descriptionTruncated: false,
    salaryText: posting.salaryText,
    salaryMin: null,
    salaryMax: null,
    salaryEstimated: false,
    employmentType: posting.employmentType,
    workModeHint: posting.workModeHint,
    postedAt: posting.postedAt,
    postedVia: `${posting.company} careers site`,
    applyLinks: [{ site: `${posting.company} careers`, url: posting.url }],
  };
}

/** The target roles a posting belongs to (for per-role market stats); every selected role when none matches. */
export function rolesForTitle(
  title: string,
  roles: { id: string; title: string; titleVariants: string[] }[],
): string[] {
  const matched = roles.filter((r) => titleMatches(title, [r.title, ...r.titleVariants])).map((r) => r.id);
  return matched.length ? matched : roles.map((r) => r.id);
}
