// What JobExtractor returns (SPEC §8 workflow table, §12.5): structure from a job description. The same schema is
// used by the AI workflow, the deterministic extractor (mock and no-AI mode) and the eval.
import { z } from "zod";

export const REQUIREMENT_KINDS = [
  "skill",
  "experience",
  "education",
  "domain",
  "responsibility",
  "soft",
  "other",
] as const;
export type RequirementKind = (typeof REQUIREMENT_KINDS)[number];

export const IMPORTANCES = ["required", "preferred", "nice_to_have", "implied"] as const;
export type RequirementImportance = (typeof IMPORTANCES)[number];

/** Order used for R-ids: must-haves first, so R1, R2… are what the employer cares about most. */
export const IMPORTANCE_RANK: Record<RequirementImportance, number> = {
  required: 0,
  preferred: 1,
  implied: 2,
  nice_to_have: 3,
};

export const extractedRequirementSchema = z.object({
  text: z.string().describe("The requirement in a few words, e.g. 'React', '4+ years of frontend experience'"),
  skillName: z
    .string()
    .nullable()
    .describe("For a skill requirement: the one technology or skill it names, e.g. 'TypeScript'; else null"),
  kind: z.enum(REQUIREMENT_KINDS),
  importance: z.enum(IMPORTANCES),
  yearsRequired: z.number().nullable().describe("Years asked for this requirement, if stated"),
  quote: z.string().describe("The exact words from the posting this requirement comes from"),
});

export const jobExtractionSchema = z.object({
  title: z.string().nullable(),
  company: z.string().nullable(),
  location: z.string().nullable(),
  workMode: z.enum(["remote", "hybrid", "onsite"]).nullable(),
  employmentType: z.string().nullable().describe("full-time, part-time, contract or internship, if stated"),
  domain: z.string().nullable().describe("The product or business domain, e.g. 'payments', 'B2B SaaS'"),
  seniority: z.string().nullable().describe("intern, junior, mid, senior, lead or principal, as the posting reads"),
  roleFamilySlug: z.string().nullable().describe("Slug of the matching catalog role, or null"),
  experience: z.object({ min: z.number().nullable(), max: z.number().nullable() }),
  responsibilities: z.array(z.string()).describe("What the person will do, one item per duty, in the posting's words"),
  requirements: z.array(extractedRequirementSchema),
});

export type ExtractedRequirement = z.infer<typeof extractedRequirementSchema>;
export type JobExtraction = z.infer<typeof jobExtractionSchema>;
