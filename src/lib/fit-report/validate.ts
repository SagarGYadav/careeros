// Fit Report validator (SPEC §8.4 + §12.5), all in code:
// - every cited id exists (E evidence, R requirements, S stats);
// - every number in a sentence comes from a cited stat, a cited CV line, a cited requirement or a verified quote;
// - text in quotation marks appears verbatim in the CV evidence or the posting;
// - every required requirement is assessed, and each status agrees with the code (a skill the code marked missing
//   may become "partial" only as a semantic match citing CV evidence);
// - statements about the user cite CV evidence, statements about the job cite requirements;
// - the strategy fits the code recommendation; no generic filler; sections stay within length limits.
// Problems are listed with a path; the report is repaired once, then anything left is marked "Unverified".
import { normalizeForMatch } from "@/lib/cv/text";
import type { AnalystInput } from "./context";
import { ALLOWED_ACTIONS, type Claim, type FitReport } from "./schema";

export type ValidationIssue = { path: string; message: string };
export type ValidationResult = {
  passed: boolean;
  issues: ValidationIssue[];
  /** Skill requirements the code marked missing that the report shows with CV evidence (worth half, labelled AI). */
  acceptedSemanticMatches: string[];
};

/** Generic advice that says nothing specific (SPEC §12.3). Checked case-insensitively. */
export const BANNED_PHRASES = [
  "improve your skills",
  "tailor your resume",
  "tailor your cv",
  "highlight your experience",
  "highlight your skills",
  "stand out from the crowd",
  "perfect fit",
  "great fit",
  "ideal candidate",
  "strong candidate",
  "passionate about",
  "team player",
  "think outside the box",
  "hit the ground running",
  "go-getter",
  "dynamic environment",
  "fast-paced environment",
  "leverage your",
  "upskill",
  "it is important to note",
];

export const LIMITS = {
  summaryWords: 80,
  claimWords: 50,
  noteWords: 40,
  questionWords: 30,
  technologyDepth: 10,
  roles: 6,
  standsOut: 5,
  redFlags: 6,
  risks: 8,
  emphasise: 5,
  questions: 5,
};

const NUMBER = /(?<![\w.])\d[\d,]*(?:\.\d+)?(?![\w])/g;
const QUOTED = /["“]([^"”]{3,})["”]/g;
const numbersIn = (text: string) => (text.match(NUMBER) ?? []).map((t) => Number(t.replace(/,/g, "")));
const words = (text: string) => text.trim().split(/\s+/).filter(Boolean).length;

export function validateFitReport(report: FitReport, input: AnalystInput): ValidationResult {
  const issues: ValidationIssue[] = [];
  const issue = (path: string, message: string) => issues.push({ path, message });

  const evidence = new Map(input.evidence.map((e) => [e.id, e.text]));
  const requirements = new Map(input.requirements.map((r) => [r.reqId, r]));
  const stats = new Map(input.stats.map((s) => [s.id, s]));
  // Text a quote may come from: the CV evidence and the posting's own words.
  const quotable = [
    ...input.evidence.map((e) => e.text),
    ...input.requirements.flatMap((r) => [r.quote, r.text]),
    ...input.job.responsibilities,
  ].map(normalizeForMatch);

  function checkText(path: string, text: string, cited: { e: string[]; r: string[]; s: string[] }, maxWords: number) {
    const lower = text.toLowerCase();
    for (const phrase of BANNED_PHRASES) if (lower.includes(phrase)) issue(path, `Generic phrase “${phrase}”.`);
    if (words(text) > maxWords) issue(path, `Too long (${words(text)} words; at most ${maxWords}).`);

    let unquoted = text;
    for (const [segment, inner] of text.matchAll(QUOTED)) {
      // Short quotes ("React") are left in place, so quoting can't hide an invented number.
      if (words(inner) < 3) continue;
      if (quotable.some((t) => t.includes(normalizeForMatch(inner)))) unquoted = unquoted.replace(segment, " ");
      else issue(path, `Quoted text not found in the CV or the posting: “${inner}”.`);
    }
    const allowed = new Set<number>([
      ...numbersIn(input.job.title),
      ...cited.s.flatMap((id) => stats.get(id)?.values ?? []),
      ...cited.e.flatMap((id) => numbersIn(evidence.get(id) ?? "")),
      ...cited.r.flatMap((id) => {
        const r = requirements.get(id);
        return r ? numbersIn(`${r.text} ${r.quote}`) : [];
      }),
    ]);
    const unsupported = numbersIn(unquoted.replace(/\b[ERS]\d+\b/g, " ")).filter(
      (n) => ![...allowed].some((v) => n === v || n === Math.floor(v) || n === Math.round(v)),
    );
    if (unsupported.length) {
      issue(
        path,
        `Numbers not backed by a cited stat, CV line or requirement: ${[...new Set(unsupported)].join(", ")}.`,
      );
    }
  }

  function checkIds(path: string, cited: { e: string[]; r: string[]; s: string[] }) {
    const unknown = [
      ...cited.e.filter((id) => !evidence.has(id)),
      ...cited.r.filter((id) => !requirements.has(id)),
      ...cited.s.filter((id) => !stats.has(id)),
    ];
    if (unknown.length) issue(path, `Unknown ids: ${unknown.join(", ")}.`);
  }

  function checkClaim(
    path: string,
    claim: Claim,
    need: { evidence?: boolean; requirement?: boolean; evidenceOrRequirement?: boolean } = {},
    maxWords = LIMITS.claimWords,
  ) {
    const cited = { e: claim.evidenceIds, r: claim.requirementIds, s: claim.statIds };
    checkIds(path, cited);
    checkText(path, claim.text, cited, maxWords);
    const hasE = claim.evidenceIds.some((id) => evidence.has(id));
    const hasR = claim.requirementIds.some((id) => requirements.has(id));
    if (need.evidence && !hasE) issue(path, "A statement about you must cite CV evidence (E…).");
    if (need.requirement && !hasR && requirements.size)
      issue(path, "A statement about the job must cite requirements (R…).");
    if (need.evidenceOrRequirement && !hasE && !hasR) issue(path, "Cite the CV evidence or requirement this is about.");
  }

  function checkCount(path: string, count: number, max: number) {
    if (count > max) issue(path, `Too many items (${count}; at most ${max}).`);
  }

  // 1. Verdict
  checkClaim("summary", report.summary, {}, LIMITS.summaryWords);
  if (!report.summary.evidenceIds.length && !report.summary.statIds.length) {
    issue("summary", "The summary must cite CV evidence or stats.");
  }

  // 2. Role decoded
  checkClaim("roleDecoded.whatTheRoleIs", report.roleDecoded.whatTheRoleIs, { requirement: true });
  checkClaim("roleDecoded.seniority", report.roleDecoded.seniority, { requirement: true });
  checkCount("roleDecoded.technologyDepth", report.roleDecoded.technologyDepth.length, LIMITS.technologyDepth);
  report.roleDecoded.technologyDepth.forEach((t, i) => {
    const path = `roleDecoded.technologyDepth.${i}`;
    checkIds(path, { e: [], r: t.requirementIds, s: [] });
    if (!t.requirementIds.length) issue(path, "Cite the requirements that show this depth.");
  });

  // 3. Requirements
  const acceptedSemanticMatches: string[] = [];
  const seen = new Set<string>();
  report.requirements.forEach((a, i) => {
    const path = `requirements.${i}`;
    const req = requirements.get(a.reqId);
    if (!req) return issue(path, `Unknown requirement ${a.reqId}.`);
    if (seen.has(a.reqId)) issue(path, `${a.reqId} is assessed twice.`);
    seen.add(a.reqId);
    checkIds(path, { e: a.evidenceIds, r: [], s: [] });
    checkText(path, a.note, { e: a.evidenceIds, r: [a.reqId], s: [] }, LIMITS.noteWords);
    const cites = a.evidenceIds.some((id) => evidence.has(id));
    if (
      (a.status === "strong" || a.status === "partial") &&
      !cites &&
      (req.evidenceIds.length || req.codeStatus === "unscored")
    ) {
      issue(path, `${a.reqId} is ${a.status}: cite the CV evidence (${req.evidenceIds.join(", ") || "E…"}).`);
    }
    if (req.codeStatus === "unscored") return;
    if (a.status === req.codeStatus && !a.semanticMatch) return;
    const semantic =
      req.kind === "skill" && req.codeStatus === "missing" && a.status === "partial" && a.semanticMatch && cites;
    if (semantic) acceptedSemanticMatches.push(a.reqId);
    else issue(path, `${a.reqId} is ${req.codeStatus} by CareerOS's calculation, not ${a.status}.`);
  });
  for (const req of input.requirements) {
    if (req.importance === "required" && !seen.has(req.reqId)) {
      issue("requirements", `Required requirement ${req.reqId} (${req.text}) is not assessed.`);
    }
  }

  // 4. Experience relevance
  checkCount("experienceRelevance.roles", report.experienceRelevance.roles.length, LIMITS.roles);
  report.experienceRelevance.roles.forEach((c, i) =>
    checkClaim(`experienceRelevance.roles.${i}`, c, { evidence: true }),
  );
  checkClaim("experienceRelevance.domainAndScale", report.experienceRelevance.domainAndScale);

  // 7. Recruiter's view
  checkCount("recruiterView.standsOut", report.recruiterView.standsOut.length, LIMITS.standsOut);
  report.recruiterView.standsOut.forEach((c, i) => checkClaim(`recruiterView.standsOut.${i}`, c, { evidence: true }));
  checkCount("recruiterView.redFlags", report.recruiterView.redFlags.length, LIMITS.redFlags);
  report.recruiterView.redFlags.forEach((c, i) => {
    const path = `recruiterView.redFlags.${i}`;
    checkClaim(path, c);
    if (!c.evidenceIds.length && !c.requirementIds.length && !c.statIds.length) {
      issue(path, "A red flag must cite its evidence, requirement or stat.");
    }
  });

  // 9. Risks
  checkCount("risks", report.risks.length, LIMITS.risks);
  report.risks.forEach((c, i) => {
    const path = `risks.${i}`;
    checkClaim(path, c, { requirement: true });
    if (c.mitigation === "surface_evidence" && !c.evidenceIds.length) {
      issue(path, "Surfacing evidence must cite the CV evidence to surface.");
    }
  });

  // 10. Strategy
  const allowed = ALLOWED_ACTIONS[input.recommendation];
  if (!allowed.includes(report.strategy.action)) {
    issue(
      "strategy.action",
      `“${report.strategy.action}” doesn't fit the ${input.recommendation} recommendation (use ${allowed.join(" or ")}).`,
    );
  }
  checkClaim("strategy.reasoning", report.strategy.reasoning);
  checkCount("strategy.emphasise", report.strategy.emphasise.length, LIMITS.emphasise);
  report.strategy.emphasise.forEach((c, i) => checkClaim(`strategy.emphasise.${i}`, c, { evidence: true }));
  checkCount("strategy.questions", report.strategy.questions.length, LIMITS.questions);
  report.strategy.questions.forEach((q, i) =>
    checkText(`strategy.questions.${i}`, q, { e: [], r: [], s: input.stats.map((s) => s.id) }, LIMITS.questionWords),
  );

  return { passed: issues.length === 0, issues, acceptedSemanticMatches };
}
