// The Fit Report that FitAnalyst writes (SPEC §12.4). Only the AI-written parts are here: the score breakdown,
// conditions, ATS keyword check and salary context are computed in code and rendered from data. Every sentence
// is a claim carrying the ids it relies on: E (CV evidence), R (job requirements), S (computed stats).
import { z } from "zod";

const ids = (what: string) => z.array(z.string()).describe(what);

export const claimSchema = z.object({
  text: z.string(),
  evidenceIds: ids("CV evidence ids (E…) this sentence relies on"),
  requirementIds: ids("Job requirement ids (R…) this sentence is about"),
  statIds: ids("Computed stat ids (S…) whose numbers this sentence uses"),
});

export const STRATEGY_ACTIONS = ["apply_now", "tailor_first", "seek_referral", "skip"] as const;
export const MITIGATIONS = ["surface_evidence", "cover_note", "interview_prep", "learn"] as const;

export const fitReportSchema = z.object({
  /** §12.4.1 Verdict: executive summary, at most 80 words. Score and recommendation come from code. */
  summary: claimSchema,
  /** §12.4.2 Role decoded. */
  roleDecoded: z.object({
    whatTheRoleIs: claimSchema.describe("Product or domain and what the day-to-day likely involves"),
    seniority: claimSchema.describe("The real seniority the responsibilities read as, compared with the title"),
    technologyDepth: z.array(
      z.object({
        technology: z.string(),
        depth: z.enum(["familiarity", "working", "deep"]),
        requirementIds: ids("Requirements that show this depth"),
      }),
    ),
  }),
  /** §12.4.3 Requirement-by-requirement assessment. Every required requirement appears. */
  requirements: z.array(
    z.object({
      reqId: z.string(),
      status: z
        .enum(["strong", "partial", "missing", "unclear"])
        .describe("unclear: the CV neither shows nor rules it out"),
      semanticMatch: z
        .boolean()
        .describe("True only when CareerOS marked the skill missing but the cited CV evidence shows it"),
      evidenceIds: ids("CV evidence for the status"),
      note: z.string(),
    }),
  ),
  /** §12.4.4 Experience relevance: how past roles map to this role's responsibilities. */
  experienceRelevance: z.object({
    roles: z.array(claimSchema),
    domainAndScale: claimSchema,
  }),
  /** §12.4.7 Recruiter's 30-second view. */
  recruiterView: z.object({
    standsOut: z.array(claimSchema),
    redFlags: z.array(claimSchema.extend({ severity: z.enum(["low", "medium", "high"]) })),
  }),
  /** §12.4.9 Risks and how to address them. */
  risks: z.array(claimSchema.extend({ mitigation: z.enum(MITIGATIONS) })),
  /** §12.4.10 Application strategy, consistent with the code recommendation. */
  strategy: z.object({
    action: z.enum(STRATEGY_ACTIONS),
    reasoning: claimSchema,
    emphasise: z.array(claimSchema),
    questions: z.array(z.string()).describe("Questions to ask the recruiter"),
  }),
});

export type Claim = z.infer<typeof claimSchema>;
export type FitReport = z.infer<typeof fitReportSchema>;
export type StrategyAction = (typeof STRATEGY_ACTIONS)[number];

/** Strategies allowed for each code recommendation (SPEC §12.5: strategy consistent with recommendation). */
export const ALLOWED_ACTIONS: Record<"APPLY" | "CONSIDER" | "LOW_PRIORITY", StrategyAction[]> = {
  APPLY: ["apply_now", "tailor_first"],
  CONSIDER: ["tailor_first", "seek_referral"],
  LOW_PRIORITY: ["seek_referral", "skip"],
};
