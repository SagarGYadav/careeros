// Scoring for the job and Fit Report evals (SPEC §12.6). Pure: the scripts in scripts/ run the pipeline and pass
// the results here. Targets: requirement recall ≥ 90%, importance accuracy ≥ 85%, required-requirement coverage
// 100%, citation validity 100%, checklist hit rate ≥ 80%, banned generic phrases 0.
import type { Claim, FitReport } from "./schema";
import type { ValidationIssue } from "./validate";

export const FIT_TARGETS = {
  requirementRecall: 0.9,
  importanceAccuracy: 0.85,
  requiredCoverage: 1,
  citationValidity: 1,
  checklistHitRate: 0.8,
  bannedPhrases: 0,
};

export type Ratio = { correct: number; total: number };
export const rate = (r: Ratio) => (r.total ? r.correct / r.total : 1);

type Matchable = { skill?: string; terms?: string[] };
type Extracted = { reqId?: string; skillName: string | null; text: string; quote: string; importance: string };

function termFound(haystack: string, term: string): boolean {
  if (term.startsWith("/") && term.endsWith("/") && term.length > 2)
    return new RegExp(term.slice(1, -1), "i").test(haystack);
  return haystack.includes(term.toLowerCase());
}

/** The extracted requirement an expected one refers to: same skill, or every term in its words. */
export function findRequirement<T extends Extracted>(expected: Matchable, extracted: T[]): T | null {
  if (expected.skill) {
    const skill = expected.skill.toLowerCase();
    return extracted.find((r) => (r.skillName ?? r.text).toLowerCase() === skill) ?? null;
  }
  const terms = expected.terms ?? [];
  return extracted.find((r) => terms.every((t) => termFound(`${r.text} ${r.quote}`.toLowerCase(), t))) ?? null;
}

export type ExtractionEval = {
  recall: Ratio;
  importance: Ratio;
  missed: string[];
  wrongImportance: string[];
};

export function scoreJobExtraction(
  expected: (Matchable & { importance: string })[],
  extracted: Extracted[],
): ExtractionEval {
  const result: ExtractionEval = {
    recall: { correct: 0, total: expected.length },
    importance: { correct: 0, total: 0 },
    missed: [],
    wrongImportance: [],
  };
  for (const want of expected) {
    const label = want.skill ?? (want.terms ?? []).join(" ");
    const found = findRequirement(want, extracted);
    if (!found) {
      result.missed.push(label);
      continue;
    }
    result.recall.correct++;
    result.importance.total++;
    if (found.importance === want.importance) result.importance.correct++;
    else result.wrongImportance.push(`${label}: ${found.importance}, expected ${want.importance}`);
  }
  return result;
}

/** Every claim in the report with its validator path (the same paths the validator uses). */
export function reportClaims(report: FitReport): { path: string; claim: Claim }[] {
  return [
    { path: "summary", claim: report.summary },
    { path: "roleDecoded.whatTheRoleIs", claim: report.roleDecoded.whatTheRoleIs },
    { path: "roleDecoded.seniority", claim: report.roleDecoded.seniority },
    ...report.experienceRelevance.roles.map((claim, i) => ({ path: `experienceRelevance.roles.${i}`, claim })),
    { path: "experienceRelevance.domainAndScale", claim: report.experienceRelevance.domainAndScale },
    ...report.recruiterView.standsOut.map((claim, i) => ({ path: `recruiterView.standsOut.${i}`, claim })),
    ...report.recruiterView.redFlags.map((claim, i) => ({ path: `recruiterView.redFlags.${i}`, claim })),
    ...report.risks.map((claim, i) => ({ path: `risks.${i}`, claim })),
    { path: "strategy.reasoning", claim: report.strategy.reasoning },
    ...report.strategy.emphasise.map((claim, i) => ({ path: `strategy.emphasise.${i}`, claim })),
    ...report.requirements.map((a, i) => ({
      path: `requirements.${i}`,
      claim: { text: a.note, evidenceIds: a.evidenceIds, requirementIds: [a.reqId], statIds: a.statIds },
    })),
  ];
}

const CITATION_PROBLEM = /^(Unknown ids|Numbers not backed|Quoted text not found)/;

export type ReportEval = {
  requiredCoverage: Ratio;
  citationValidity: Ratio;
  bannedPhrases: number;
};

export function scoreReport(report: FitReport, requiredReqIds: string[], issues: ValidationIssue[]): ReportEval {
  const assessed = new Set(report.requirements.map((r) => r.reqId));
  const claims = reportClaims(report);
  const badPaths = new Set(issues.filter((i) => CITATION_PROBLEM.test(i.message)).map((i) => i.path));
  return {
    requiredCoverage: { correct: requiredReqIds.filter((id) => assessed.has(id)).length, total: requiredReqIds.length },
    citationValidity: { correct: claims.filter((c) => !badPaths.has(c.path)).length, total: claims.length },
    bannedPhrases: issues.filter((i) => i.message.startsWith("Generic phrase")).length,
  };
}

export type SectionName =
  "summary" | "role" | "requirements" | "redFlags" | "standsOut" | "risks" | "strategy" | "questions";

/** Sentences of each section, for the "mentions" checklist items. */
export function sectionClaims(report: FitReport): Record<SectionName, Claim[]> {
  const plain = (text: string): Claim => ({ text, evidenceIds: [], requirementIds: [], statIds: [] });
  return {
    summary: [report.summary],
    role: [
      report.roleDecoded.whatTheRoleIs,
      report.roleDecoded.seniority,
      ...report.roleDecoded.technologyDepth.map((t) => plain(`${t.technology} ${t.depth}`)),
    ],
    requirements: report.requirements.map((a) => ({ ...plain(a.note), evidenceIds: a.evidenceIds })),
    redFlags: report.recruiterView.redFlags,
    standsOut: report.recruiterView.standsOut,
    risks: report.risks,
    strategy: [report.strategy.reasoning, ...report.strategy.emphasise],
    questions: report.strategy.questions.map(plain),
  };
}

export type ChecklistContext = {
  report: FitReport;
  requirements: Extracted[];
  /** The status shown for a requirement: the code's, or the report's where the code doesn't judge. */
  statusOf: (reqId: string) => string;
  blockers: string[];
  recommendation: string;
};

export type ChecklistItemSpec =
  | { kind: "status"; requirement: Matchable; status: string[] }
  | { kind: "blocker"; blocker: string }
  | { kind: "noBlocker" }
  | { kind: "recommendation"; in: string[] }
  | { kind: "strategy"; in: string[] }
  | { kind: "mentions"; sections: SectionName[]; terms: string[][] }
  | { kind: "citesEvidence"; section: SectionName };

export function checkItem(item: ChecklistItemSpec, ctx: ChecklistContext): boolean {
  switch (item.kind) {
    case "status": {
      const req = findRequirement(item.requirement, ctx.requirements);
      return Boolean(req?.reqId && item.status.includes(ctx.statusOf(req.reqId)));
    }
    case "blocker":
      return ctx.blockers.includes(item.blocker);
    case "noBlocker":
      return ctx.blockers.length === 0;
    case "recommendation":
      return item.in.includes(ctx.recommendation);
    case "strategy":
      return item.in.includes(ctx.report.strategy.action);
    case "mentions": {
      const sections = sectionClaims(ctx.report);
      return item.sections.some((name) =>
        sections[name].some((c) => item.terms.every((group) => group.some((t) => termFound(c.text.toLowerCase(), t)))),
      );
    }
    case "citesEvidence":
      return sectionClaims(ctx.report)[item.section].some((c) => c.evidenceIds.length > 0);
  }
}
