// A Fit Report written from code data alone: the mock AI's answer in development and tests, and the no-AI
// fallback (SPEC §8.1). Plain sentences that cite their ids; it states only what the calculation already knows and
// leaves judgement ("unclear") to the AI.
import type { AnalystInput } from "./context";
import { ALLOWED_ACTIONS, type Claim, type FitReport } from "./schema";

const claim = (text: string, ids: { e?: string[]; r?: string[]; s?: string[] } = {}): Claim => ({
  text,
  evidenceIds: ids.e ?? [],
  requirementIds: ids.r ?? [],
  statIds: ids.s ?? [],
});

const STRATEGY_TEXT = {
  apply_now: "The calculation supports applying now.",
  tailor_first: "Worth applying once the CV leads with the matching work.",
  seek_referral: "A referral would help more than a cold application here.",
  skip: "The gaps and blockers make this a low priority.",
} as const;

export function deterministicFitReport(input: AnalystInput): FitReport {
  const reqs = input.requirements;
  const firstReq = reqs.length ? [reqs[0].reqId] : [];
  const skills = reqs.filter((r) => r.kind === "skill");
  const strong = skills.filter((r) => r.codeStatus === "strong" && r.evidenceIds.length);
  const gaps = skills.filter(
    (r) => (r.codeStatus === "missing" || r.codeStatus === "partial") && r.importance !== "implied",
  );
  const action = ALLOWED_ACTIONS[input.recommendation][0];
  const stats = new Map(input.stats.map((st) => [st.id, st.text]));
  const byEvidence = new Map<string, string[]>();
  for (const m of input.matches)
    byEvidence.set(m.evidenceId, [...(byEvidence.get(m.evidenceId) ?? []), m.responsibility]);

  return {
    summary: claim(`CareerOS calculated the Fit score and recommendation from the requirements below.`, { s: ["S1"] }),
    roleDecoded: {
      whatTheRoleIs: claim(
        input.job.domain ? `A ${input.job.title} role in ${input.job.domain}.` : `A ${input.job.title} role.`,
        { r: firstReq },
      ),
      seniority: claim(
        input.job.seniority
          ? `The posting reads as ${input.job.seniority} level.`
          : "The posting doesn't state a level.",
        { r: firstReq },
      ),
      technologyDepth: skills
        .filter((r) => r.importance === "required" || r.importance === "preferred")
        .slice(0, 10)
        .map((r) => ({
          technology: r.text,
          depth: r.importance === "required" ? ("working" as const) : ("familiarity" as const),
          requirementIds: [r.reqId],
        })),
    },
    requirements: reqs.map((r) => ({
      reqId: r.reqId,
      status: r.codeStatus === "unscored" ? ("unclear" as const) : r.codeStatus,
      semanticMatch: false,
      evidenceIds: r.codeStatus === "strong" || r.codeStatus === "partial" ? r.evidenceIds.slice(0, 3) : [],
      note: r.codeStatus === "unscored" ? "Needs the AI review to judge against your CV." : "From your skills profile.",
    })),
    experienceRelevance: {
      roles: [...byEvidence]
        .slice(0, 6)
        .map(([id, duties]) =>
          claim(`Closest match in your CV for ${duties.map((d) => `"${d}"`).join(" and ")}.`, { e: [id] }),
        ),
      domainAndScale: claim(input.job.domain ? `Domain: ${input.job.domain}.` : "The posting doesn't name a domain."),
    },
    recruiterView: {
      standsOut: strong
        .slice(0, 5)
        .map((r) => claim(`${r.text} is backed by your CV.`, { e: r.evidenceIds.slice(0, 2), r: [r.reqId] })),
      redFlags: input.blockerStatIds.map((id) => ({
        ...claim(stats.get(id)?.replace(/^Blocker: /, "") ?? "A blocker found by the calculation.", { s: [id] }),
        severity: "high" as const,
      })),
    },
    risks: gaps.slice(0, 8).map((r) => ({
      ...claim(`${r.text} is ${r.codeStatus === "missing" ? "missing from" : "only partly in"} your profile.`, {
        r: [r.reqId],
      }),
      mitigation: r.codeStatus === "missing" ? ("learn" as const) : ("interview_prep" as const),
    })),
    strategy: {
      action,
      reasoning: claim(STRATEGY_TEXT[action], { s: ["S1"] }),
      emphasise: strong
        .slice(0, 3)
        .map((r) => claim(`Lead with your ${r.text} work.`, { e: r.evidenceIds.slice(0, 2), r: [r.reqId] })),
      questions: [],
    },
  };
}
