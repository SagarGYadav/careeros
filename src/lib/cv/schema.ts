// ParsedCv (SPEC §9.2): what the ResumeParser returns, and CvDraft: the verified, normalised version that is
// stored on the ResumeVersion and shown on the review screen.
//
// The AI schema uses nullable fields rather than optional ones, because structured-output modes of several
// providers require every property to be present.
import { z } from "zod";

const maybe = z.string().nullable();

export const EMPLOYMENT_TYPES = ["full_time", "part_time", "contract", "internship", "freelance", "temporary"] as const;
export const WORK_MODES = ["onsite", "hybrid", "remote"] as const;
export const LINK_TYPES = ["linkedin", "github", "portfolio", "other"] as const;
export const OTHER_SECTION_KINDS = [
  "awards",
  "publications",
  "volunteering",
  "languages",
  "interests",
  "other",
] as const;
export const BULLET_KINDS = ["responsibility", "achievement"] as const;

const bullet = z.object({
  text: z.string().describe("The bullet exactly as written in the CV, without the bullet symbol, on one line"),
  kind: z.enum(BULLET_KINDS).describe("achievement = a result or outcome; responsibility = a duty or activity"),
});

const sourceQuote = z.string().describe("The CV line or lines naming this entry and its dates, copied exactly");

export const parsedCvSchema = z.object({
  personal: z.object({
    fullName: maybe,
    email: maybe,
    phone: maybe.describe("As written in the CV"),
    city: maybe,
    state: maybe,
    country: maybe,
    links: z.array(z.object({ type: z.enum(LINK_TYPES), url: z.string(), label: maybe })),
    otherDetails: z
      .array(z.object({ label: z.string(), value: z.string() }))
      .describe("Other personal details exactly as written: date of birth, nationality, languages known, etc."),
  }),
  headline: maybe.describe("The professional title line under the name, if any"),
  summary: maybe,
  experience: z.array(
    z.object({
      company: z.string(),
      title: z.string(),
      employmentType: z.enum(EMPLOYMENT_TYPES).nullable(),
      location: maybe,
      workMode: z.enum(WORK_MODES).nullable(),
      start: maybe.describe("Start date as written, e.g. 'Apr 2023'"),
      end: maybe.describe("End date as written; null when the role is current"),
      isCurrent: z.boolean(),
      domain: maybe.describe("Industry or domain if stated or obvious from the company description"),
      teamSize: z.number().int().nullable().describe("Only if the CV states it"),
      bullets: z.array(bullet),
      technologies: z.array(z.string()).describe("Technologies the CV says were used in this role"),
      sourceQuote,
    }),
  ),
  projects: z.array(
    z.object({
      name: z.string(),
      role: maybe,
      description: maybe,
      technologies: z.array(z.string()),
      links: z.array(z.string()),
      start: maybe,
      end: maybe,
      bullets: z.array(bullet),
      sourceQuote,
    }),
  ),
  education: z.array(
    z.object({
      institution: z.string(),
      degree: z.string().describe("As written, e.g. 'B.Tech'"),
      field: maybe,
      location: maybe,
      start: maybe,
      end: maybe,
      grade: maybe.describe("As written, e.g. '8.4 CGPA' or '76%'"),
      sourceQuote,
    }),
  ),
  certifications: z.array(
    z.object({
      name: z.string(),
      issuer: maybe,
      issueDate: maybe,
      expiryDate: maybe,
      credentialId: maybe,
      url: maybe,
      sourceQuote,
    }),
  ),
  skills: z.object({
    explicit: z
      .array(z.object({ name: z.string(), category: maybe }))
      .describe("Every skill listed in a skills section, with the group heading it is listed under"),
    inferred: z
      .array(z.object({ name: z.string(), evidenceQuote: z.string() }))
      .describe("Skills used in experience or projects but not listed in a skills section, with the exact CV text"),
    soft: z.array(z.string()),
  }),
  otherSections: z.array(
    z.object({ kind: z.enum(OTHER_SECTION_KINDS), heading: z.string(), items: z.array(z.string()) }),
  ),
  jobSearch: z.object({
    noticePeriod: maybe,
    currentCtc: maybe,
    expectedCtc: maybe,
    preferredLocations: z.array(z.string()),
  }),
});

export type ParsedCv = z.infer<typeof parsedCvSchema>;
export type ParsedExperience = ParsedCv["experience"][number];
export type ParsedBullet = z.infer<typeof bullet>;

export function emptyParsedCv(): ParsedCv {
  return {
    personal: {
      fullName: null,
      email: null,
      phone: null,
      city: null,
      state: null,
      country: null,
      links: [],
      otherDetails: [],
    },
    headline: null,
    summary: null,
    experience: [],
    projects: [],
    education: [],
    certifications: [],
    skills: { explicit: [], inferred: [], soft: [] },
    otherSections: [],
    jobSearch: { noticePeriod: null, currentCtc: null, expectedCtc: null, preferredLocations: [] },
  };
}

// ---------------------------------------------------------------------------------------------------------------
// CvDraft: after verification. Dates are normalised to "YYYY-MM" (or "YYYY"), bullets carry evidence ids, and
// durations and totals are computed by code.

const yearMonth = z.string().regex(/^\d{4}(-(0[1-9]|1[0-2]))?$/);

const draftBullet = z.object({
  id: z.string(),
  text: z.string(),
  kind: z.enum(BULLET_KINDS),
  hasMetric: z.boolean(),
});

export const cvDraftSchema = z.object({
  version: z.literal(1),
  personal: z.object({
    fullName: maybe,
    email: maybe,
    phone: maybe,
    city: maybe,
    state: maybe,
    country: maybe,
    linkedin: maybe,
    github: maybe,
    portfolio: maybe,
    otherLinks: z.array(z.object({ url: z.string(), label: maybe })),
    /** Sensitive: shown and stored, never used for matching or sent to search providers. */
    otherDetails: z.array(z.object({ label: z.string(), value: z.string() })),
  }),
  headline: maybe,
  summary: maybe,
  experience: z.array(
    z.object({
      company: z.string(),
      title: z.string(),
      employmentType: z.enum(EMPLOYMENT_TYPES).nullable(),
      location: maybe,
      workMode: z.enum(WORK_MODES).nullable(),
      startDate: yearMonth.nullable(),
      endDate: yearMonth.nullable(),
      isCurrent: z.boolean(),
      durationMonths: z.number().int().nullable(),
      domain: maybe,
      teamSize: z.number().int().nullable(),
      bullets: z.array(draftBullet),
      technologies: z.array(z.string()),
      technologiesEvidenceId: maybe,
      sourceQuote: z.string(),
    }),
  ),
  projects: z.array(
    z.object({
      name: z.string(),
      role: maybe,
      description: maybe,
      technologies: z.array(z.string()),
      links: z.array(z.string()),
      startDate: yearMonth.nullable(),
      endDate: yearMonth.nullable(),
      bullets: z.array(draftBullet),
      sourceQuote: z.string(),
    }),
  ),
  education: z.array(
    z.object({
      evidenceId: z.string(),
      institution: z.string(),
      degree: z.string(),
      field: maybe,
      location: maybe,
      startDate: yearMonth.nullable(),
      endDate: yearMonth.nullable(),
      grade: maybe,
      sourceQuote: z.string(),
    }),
  ),
  certifications: z.array(
    z.object({
      evidenceId: z.string(),
      name: z.string(),
      issuer: maybe,
      issueDate: yearMonth.nullable(),
      expiryDate: yearMonth.nullable(),
      credentialId: maybe,
      url: maybe,
      sourceQuote: z.string(),
    }),
  ),
  skills: z.object({
    explicit: z.array(z.object({ name: z.string(), category: maybe, evidenceIds: z.array(z.string()) })),
    inferred: z.array(z.object({ name: z.string(), evidenceIds: z.array(z.string()), evidenceQuote: z.string() })),
    soft: z.array(z.string()),
  }),
  otherSections: z.array(
    z.object({ kind: z.enum(OTHER_SECTION_KINDS), heading: z.string(), items: z.array(z.string()) }),
  ),
  jobSearch: z.object({
    noticePeriod: maybe,
    currentCtc: maybe,
    expectedCtc: maybe,
    preferredLocations: z.array(z.string()),
  }),
  computed: z.object({
    /** Overlapping roles counted once. */
    totalExperienceMonths: z.number().int(),
    /** The same, without internships. */
    professionalExperienceMonths: z.number().int(),
    gaps: z.array(z.object({ from: yearMonth, to: yearMonth, months: z.number().int() })),
    overlaps: z.array(z.object({ a: z.string(), b: z.string(), months: z.number().int() })),
  }),
});

export type CvDraft = z.infer<typeof cvDraftSchema>;

export const EVIDENCE_KINDS = [
  "experience_bullet",
  "project_bullet",
  "technologies",
  "skills",
  "certification",
  "education",
  "summary",
  "other",
] as const;

/** CV evidence catalog item (SPEC §8.4): a stable id for a piece of CV text that AI claims can cite. */
export const evidenceItemSchema = z.object({
  id: z.string().regex(/^E\d+$/),
  kind: z.enum(EVIDENCE_KINDS),
  text: z.string(),
  section: z.string(),
  /** Index of the entry in its section (role, project, degree…), when there is one. */
  entry: z.number().int().nullable(),
  page: z.number().int().nullable(),
  /** False when the text was not found in the CV; such items are flagged for review. */
  grounded: z.boolean(),
});

export type EvidenceItem = z.infer<typeof evidenceItemSchema>;
