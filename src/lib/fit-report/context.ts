// What FitAnalyst is given (SPEC §12.5): requirements with ids and the code's verdict on each, the CV evidence
// catalog, and a catalog of computed stats (S1…Sn). Any number the report writes must come from a stat, a cited
// CV line or a cited requirement, so the stats list every number worth saying.
import { RUPEES_PER_LAKH } from "@/lib/format";
import type { FitScore, RequirementStatus } from "@/lib/scoring/fit";
import type { SalaryContext } from "@/lib/scoring/salary-context";
import { COMPONENT_LABELS } from "@/lib/scoring/config";

export type Stat = { id: string; text: string; values: number[] };

export type AnalystRequirement = {
  reqId: string;
  text: string;
  kind: string;
  importance: string;
  quote: string;
  codeStatus: RequirementStatus;
  codeReason: string;
  /** CV evidence ids where the user's matching skill appears (from the profile), if any. */
  evidenceIds: string[];
  /** Learning effort of the skill (1 small, 2 medium, 3 large), from the skill taxonomy. */
  learningEffort: number | null;
};

export type ResponsibilityMatch = { responsibility: string; evidenceId: string; similarity: number };

export type AnalystInput = {
  job: {
    title: string;
    company: string;
    seniority: string | null;
    domain: string | null;
    responsibilities: string[];
  };
  requirements: AnalystRequirement[];
  evidence: { id: string; text: string; section: string }[];
  stats: Stat[];
  recommendation: "APPLY" | "CONSIDER" | "LOW_PRIORITY";
  /** Stat ids of the blockers, so red flags can cite them. */
  blockerStatIds: string[];
  /** Duties matched to the closest CV line by meaning (computed with embeddings). */
  matches: ResponsibilityMatch[];
};

const NUMBER = /(?<![\w.])\d[\d,]*(?:\.\d+)?(?![\w])/g;
const numbersIn = (text: string) => (text.match(NUMBER) ?? []).map((t) => Number(t.replace(/,/g, "")));
const lakhs = (rupees: number) => Math.round((rupees / RUPEES_PER_LAKH) * 10) / 10;
const one = (n: number) => Math.round(n * 10) / 10;

export type StatsInput = {
  score: FitScore;
  years: number | null;
  job: {
    expMinYears: number | null;
    expMaxYears: number | null;
    salaryMin: number | null;
    salaryMax: number | null;
    salaryDisclosed: boolean;
  };
  expectedSalaryMin: number | null;
  noticePeriodDays: number | null;
  salaryContext: SalaryContext | null;
};

/** Builds S1…Sn from the computed score and profile facts. Each stat says its numbers in words and as values. */
export function buildStats(input: StatsInput): { stats: Stat[]; blockerStatIds: string[] } {
  const stats: Stat[] = [];
  const add = (text: string, values: number[] = numbersIn(text)) => {
    const id = `S${stats.length + 1}`;
    stats.push({ id, text, values });
    return id;
  };
  const { score } = input;
  add(`Fit score: ${score.total} of 100 (${score.recommendation}).`, [score.total, 100]);
  for (const c of score.components) {
    const points = Math.round(c.points);
    add(`${COMPONENT_LABELS[c.key]}: ${points} of ${c.max} points. ${c.reason}`);
  }
  const counted = (status: RequirementStatus) => score.requirements.filter((r) => r.status === status).length;
  add(
    `Requirements judged by code: ${counted("strong")} strong, ${counted("partial")} partial, ${counted("missing")} missing; ${counted("unscored")} left to the report.`,
  );
  if (input.years !== null)
    add(`Your experience: ${one(input.years)} years.`, [one(input.years), Math.floor(input.years)]);
  const { expMinYears: min, expMaxYears: max } = input.job;
  if (min !== null || max !== null) {
    add(
      `Years asked: ${min !== null && max !== null ? `${min}–${max}` : min !== null ? `${min}+` : `up to ${max}`}.`,
      [min, max].filter((v): v is number => v !== null),
    );
  }
  if (input.job.salaryDisclosed && (input.job.salaryMin !== null || input.job.salaryMax !== null)) {
    const values = [input.job.salaryMin, input.job.salaryMax].filter((v): v is number => v !== null).map(lakhs);
    add(`Disclosed salary: ${values.join("–")} LPA.`, values);
  }
  if (input.expectedSalaryMin !== null) {
    add(`Your expected salary: ${lakhs(input.expectedSalaryMin)}+ LPA.`, [lakhs(input.expectedSalaryMin)]);
  }
  if (input.salaryContext) {
    const c = input.salaryContext;
    add(
      `Salary context (similar jobs, last 90 days): median ${lakhs(c.median)} LPA, range ${lakhs(c.min)}–${lakhs(c.max)} LPA, n = ${c.n}.`,
      [lakhs(c.median), lakhs(c.min), lakhs(c.max), c.n, 90],
    );
  }
  if (input.noticePeriodDays !== null) add(`Your notice period: ${input.noticePeriodDays} days.`);
  for (const check of score.conditions) add(`Condition (${check.status}): ${check.message}`);
  for (const gain of score.gains)
    add(`${gain.skillName} at level 3 would add ${gain.points} points.`, [gain.points, 3]);
  const blockerStatIds = score.blockers.map((b) => add(`Blocker: ${b.message}`));
  return { stats, blockerStatIds };
}
