// One provider posting → the fields CareerOS stores (SPEC §10.4): cleaned company and city, parsed salary,
// experience, seniority and conditions. Pure, so the whole step is unit-tested.
import type { NormalizedJob } from "@/lib/jobsearch/types";
import { parseConditions, parseExperience, seniorityFromPosting, type Conditions } from "./conditions";
import {
  canonicalCity,
  companyKey,
  descriptionHash,
  detectWorkMode,
  displayCompanyName,
  isDirectFromCompany,
  isStaffingAgency,
} from "./normalize";
import { parseSalary } from "./salary";

export const STALE_AFTER_DAYS = 30;

export type PreparedJob = {
  provider: NormalizedJob["provider"];
  externalId: string;
  title: string;
  companyName: string;
  companyKey: string;
  location: string;
  city: string | null;
  workMode: "remote" | "hybrid" | "onsite" | null;
  employmentType: string | null;
  salaryMinAnnual: number | null;
  salaryMaxAnnual: number | null;
  salaryCurrency: string | null;
  salaryText: string | null;
  salaryDisclosed: boolean;
  expMinYears: number | null;
  expMaxYears: number | null;
  seniority: string | null;
  description: string;
  descriptionHash: string;
  descriptionTruncated: boolean;
  postedVia: string | null;
  isDirectFromCompany: boolean;
  isStaffing: boolean;
  applyLinks: NormalizedJob["applyLinks"];
  postedAt: Date | null;
  conditions: Conditions;
  isStale: boolean;
};

/** The pay line of a description ("Compensation: 12-18 LPA"), when the provider gave no salary field. */
function salaryLine(description: string): string | null {
  const m = description.match(/(?:salary|ctc|compensation|package|pay)\s*(?:range)?\s*[:\-–]\s*([^\n]{3,80})/i);
  return m ? m[1].replace(/\.\s*$/, "") : null;
}

export function prepareJob(job: NormalizedJob, now: Date): PreparedJob {
  const company = displayCompanyName(job.company);
  const city = canonicalCity(job.location) ?? (job.workModeHint === "remote" ? "Remote-India" : null);
  const text = `${job.title}\n${job.description}`;

  // Adzuna's own estimates are not the employer's numbers, so they are not shown as a disclosed salary.
  let salary = {
    minAnnual: null as number | null,
    maxAnnual: null as number | null,
    currency: null as string | null,
    disclosed: false,
  };
  let salaryText = job.salaryText;
  if (job.salaryMin !== null && job.salaryMax !== null && !job.salaryEstimated) {
    salary = {
      minAnnual: Math.round(job.salaryMin),
      maxAnnual: Math.round(job.salaryMax),
      currency: "INR",
      disclosed: true,
    };
  } else {
    salaryText ??= salaryLine(job.description);
    salary = parseSalary(salaryText);
  }

  const experience = parseExperience(text);
  const postedAt = job.postedAt && !Number.isNaN(job.postedAt.getTime()) ? job.postedAt : null;
  return {
    provider: job.provider,
    externalId: job.externalId,
    title: job.title.trim(),
    companyName: company,
    companyKey: companyKey(company),
    location: job.location,
    city: city === "India" ? null : city,
    workMode: city === "Remote-India" ? "remote" : detectWorkMode(job.location, job.description, job.workModeHint),
    employmentType: job.employmentType,
    salaryMinAnnual: salary.minAnnual,
    salaryMaxAnnual: salary.maxAnnual,
    salaryCurrency: salary.currency,
    salaryText,
    salaryDisclosed: salary.disclosed,
    expMinYears: experience.min,
    expMaxYears: experience.max,
    seniority: seniorityFromPosting(job.title, experience),
    description: job.description,
    descriptionHash: descriptionHash(job.description),
    descriptionTruncated: job.descriptionTruncated,
    postedVia: job.postedVia,
    isDirectFromCompany: isDirectFromCompany(
      company,
      job.postedVia,
      job.applyLinks.map((l) => l.url),
    ),
    isStaffing: isStaffingAgency(job.company),
    applyLinks: job.applyLinks,
    postedAt,
    conditions: parseConditions(job.description),
    isStale: postedAt ? now.getTime() - postedAt.getTime() > STALE_AFTER_DAYS * 86_400_000 : false,
  };
}
