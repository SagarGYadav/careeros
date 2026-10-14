import "server-only";
import { createHash } from "node:crypto";
import { z } from "zod";
import { AppError } from "@/lib/errors";
import { parseConditions, parseExperience } from "@/lib/jobs/conditions";
import { isSameJob } from "@/lib/jobs/dedupe";
import { descriptionHash } from "@/lib/jobs/normalize";
import { prepareJob } from "@/lib/jobs/prepare";
import type { ApplyLink } from "@/lib/jobsearch/types";
import { addJobSchema, jobDescriptionSchema, type AddJobValues } from "@/lib/validation/job";
import { fetchPublicPage, type FetchDeps } from "@/lib/web/fetch-page";
import { extractJobPosting } from "@/lib/web/jsonld";
import { checkUrl } from "@/lib/web/ssrf";
import {
  createJob,
  findDedupeCandidates,
  getJobDescription,
  updateJobDescription,
  upsertCompanies,
} from "@/server/repositories/jobs";
import { scoreJobsNow } from "./search-runs";

export type JobPrefill = Omit<AddJobValues, "origin"> & { postedAt: string | null };

/** Reads a job page's schema.org JobPosting (no AI, no guessing at HTML) to fill the Add job form. */
export async function readJobFromUrl(rawUrl: string, deps: FetchDeps = {}): Promise<JobPrefill> {
  const page = await fetchPublicPage(rawUrl, deps);
  const posting = extractJobPosting(page.html);
  if (!posting) {
    throw new AppError("PARSE_FAILED", {
      message: "That page has no job posting data CareerOS can read. Paste the description instead.",
    });
  }
  return {
    title: posting.title.slice(0, 120),
    company: posting.company.slice(0, 120),
    location: posting.location.slice(0, 120) || null,
    workMode: posting.remote ? "remote" : null,
    salaryText: posting.salaryText,
    description: posting.description.slice(0, 30_000),
    applyUrl: page.url,
    postedAt: posting.postedAt?.toISOString() ?? null,
  };
}

const siteName = (url: string) => new URL(url).hostname.replace(/^www\./, "");

/**
 * Adds a job the user found elsewhere. It goes through the same cleaning and duplicate check as search results;
 * a duplicate returns the existing job instead of adding a second copy.
 */
export async function addJob(
  userId: string,
  input: unknown,
  now = new Date(),
): Promise<{ jobId: string; duplicate: boolean }> {
  const values = addJobSchema.parse(input);
  const applyLinks: ApplyLink[] = values.applyUrl ? [{ site: siteName(values.applyUrl), url: values.applyUrl }] : [];
  const externalId = createHash("sha256")
    .update(values.applyUrl ?? `${values.title}|${values.company}|${descriptionHash(values.description)}`)
    .digest("hex")
    .slice(0, 24);
  const job = prepareJob(
    {
      provider: "manual",
      externalId,
      title: values.title,
      company: values.company,
      location: values.location ?? "",
      description: values.description,
      descriptionTruncated: false,
      salaryText: values.salaryText,
      salaryMin: null,
      salaryMax: null,
      salaryEstimated: false,
      employmentType: null,
      workModeHint: values.workMode,
      postedAt: null,
      postedVia: values.applyUrl ? siteName(values.applyUrl) : null,
      applyLinks,
    },
    now,
  );
  const companies = await upsertCompanies(userId, [
    { name: job.companyName, key: job.companyKey, isStaffing: job.isStaffing },
  ]);
  const companyId = companies.get(job.companyKey)?.id ?? null;
  const candidates = await findDedupeCandidates(userId, {
    externalKeys: [{ provider: "manual", externalId }],
    companyIds: companyId ? [companyId] : [],
    hashes: [job.descriptionHash],
  });
  const existing = candidates.find((c) =>
    isSameJob(
      {
        provider: c.provider,
        externalId: c.externalId,
        companyKey: c.company?.normalizedName ?? "",
        city: c.locationCity,
        title: c.title,
        descriptionHash: c.descriptionHash,
        postedAt: c.postedAt,
      },
      {
        provider: job.provider,
        externalId,
        companyKey: job.companyKey,
        city: job.city,
        title: job.title,
        descriptionHash: job.descriptionHash,
        postedAt: now,
      },
    ),
  );
  if (existing) return { jobId: existing.id, duplicate: true };

  const created = await createJob(userId, {
    companyId,
    companyName: job.companyName,
    title: job.title,
    targetRoleIds: [],
    seniority: job.seniority,
    location: job.location,
    locationCity: job.city,
    workMode: job.workMode,
    employmentType: job.employmentType,
    salaryMinAnnual: job.salaryMinAnnual,
    salaryMaxAnnual: job.salaryMaxAnnual,
    salaryCurrency: job.salaryCurrency,
    salaryText: job.salaryText,
    salaryDisclosed: job.salaryDisclosed,
    expMinYears: job.expMinYears,
    expMaxYears: job.expMaxYears,
    descriptionRaw: job.description,
    descriptionHash: job.descriptionHash,
    descriptionTruncated: false,
    origin: values.origin,
    provider: "manual",
    externalId,
    postedVia: job.postedVia,
    isDirectFromCompany: job.isDirectFromCompany,
    applyLinks,
    postedAt: null,
    conditions: job.conditions,
    isStale: false,
  });
  // Relevance now, so the job sorts sensibly in the feed before it is analysed.
  await scoreJobsNow(userId, [created.id]);
  return { jobId: created.id, duplicate: false };
}

async function setDescription(userId: string, jobId: string, text: string) {
  const experience = parseExperience(text);
  const ok = await updateJobDescription(userId, jobId, {
    descriptionRaw: text,
    descriptionHash: descriptionHash(text),
    conditions: parseConditions(text),
    expMinYears: experience.min,
    expMaxYears: experience.max,
  });
  if (!ok) throw new AppError("NOT_FOUND");
  await scoreJobsNow(userId, [jobId]);
}

/** The user pastes the full description of a job whose source sent only part of it (SPEC §12.1). */
export async function replaceJobDescription(userId: string, jobId: string, input: unknown) {
  const { description } = jobDescriptionSchema.parse(input);
  await setDescription(userId, jobId, description);
}

/**
 * Tries the job's own apply links for a full description in schema.org data (robots.txt respected). Job boards
 * that can't be read (LinkedIn, Naukri) are skipped. Returns the site it came from.
 */
export async function fetchFullDescription(userId: string, jobId: string, deps: FetchDeps = {}) {
  const job = await getJobDescription(userId, jobId);
  if (!job) throw new AppError("NOT_FOUND");
  const links = z
    .array(z.object({ site: z.string(), url: z.string() }))
    .catch([])
    .parse(job.applyLinks)
    .filter((link) => checkUrl(link.url).ok);
  for (const link of links.slice(0, 3)) {
    try {
      const prefill = await readJobFromUrl(link.url, deps);
      if (prefill.description.length > job.descriptionRaw.length + 100) {
        await setDescription(userId, jobId, prefill.description);
        return { site: link.site };
      }
    } catch {
      // Try the next link; the user can always paste the description.
    }
  }
  throw new AppError("URL_FETCH_FAILED", {
    message: "None of this job's links had a fuller description CareerOS can read. Paste it instead.",
  });
}
