// FitAnalyst workflow (SPEC §12.3–12.5): writes the Fit Report around numbers CareerOS already computed. Strong
// tier. The answer goes through the code validator (lib/fit-report/validate); if it finds problems, the model gets
// one chance to fix them, and whatever is still wrong is stored as "Unverified".
import "server-only";
import { registerMockResponder } from "@/lib/ai/mock";
import type { AiRunner } from "@/lib/ai/runner";
import type { AnalystInput } from "@/lib/fit-report/context";
import { deterministicFitReport } from "@/lib/fit-report/deterministic";
import { ALLOWED_ACTIONS, fitReportSchema, type FitReport } from "@/lib/fit-report/schema";
import { BANNED_PHRASES, LIMITS, validateFitReport, type ValidationResult } from "@/lib/fit-report/validate";

export const FIT_ANALYST_WORKFLOW = "fit-analyst";
export const FIT_ANALYST_PROMPT_VERSION = "1";

export const FIT_ANALYST_SYSTEM = `You are a senior technical recruiter and career coach in India reviewing one \
candidate's CV against one specific job. Write the analysis parts of a Fit Report as JSON. Be specific, evidence-based, \
honest about gaps and practical. CareerOS has already calculated the Fit score, the recommendation and a status for \
each requirement; you explain them, you never change them.

Ids: E… are lines of the candidate's CV, R… are the job's requirements, S… are numbers CareerOS computed.
Every sentence lists the ids it relies on in evidenceIds, requirementIds and statIds.

Rules:
1. Statements about the candidate cite CV evidence (E…). Statements about the job cite requirements (R…).
2. Numbers: use a number only if it appears in a stat you cite (S…), a CV line you cite (E…) or a requirement you \
cite (R…). Never estimate, add up or invent a number. Write ids only in the id lists, not in the text.
3. Quotes: text in quotation marks must be copied exactly from the CV evidence or the posting.
4. requirements: assess every requirement marked "required", and others where useful. Use CareerOS's status as \
given. Only for a skill CareerOS marked "missing" may you answer "partial" with semanticMatch true, and only when a \
cited CV line clearly shows the skill under another name. For requirements CareerOS left "unscored" (education, \
domain, soft skills, other), judge them from the CV: strong or partial need cited evidence; use "unclear" when the \
CV neither shows nor rules it out. Notes: at most ${LIMITS.noteWords} words, saying what in the CV supports or \
contradicts it.
5. summary: at most ${LIMITS.summaryWords} words: the verdict in plain words, the strongest evidence and the biggest \
gap. Cite S1 when you mention the score.
6. roleDecoded: what the product or domain is and what the day-to-day likely involves; the real seniority the \
responsibilities read as versus the title (e.g. "titled SDE-1 but responsibilities read mid-level"); the depth \
expected per technology (familiarity, working or deep).
7. experienceRelevance.roles: one item per past role or project that matters, mapping it to this job's \
responsibilities (use the computed duty ↔ CV matches given). domainAndScale: how the candidate's domain and scale \
compare.
8. recruiterView: what a recruiter notices in 30 seconds. standsOut cites CV evidence. redFlags (missing must-haves, \
short tenures, gaps, title mismatch, over-qualification, blockers) each with severity and the ids that show it.
9. risks: each gap with a truthful way to address it: surface_evidence (point to an existing CV line, cite it), \
cover_note, interview_prep or learn. Say exactly what to do and where; never generic advice.
10. strategy.action must be one of the actions allowed for the recommendation (given in the instructions). \
emphasise: what to lead with, citing CV evidence. questions: up to ${LIMITS.questions} specific questions for the \
recruiter (e.g. notice-period buyout, office days).
11. Never use these phrases: ${BANNED_PHRASES.map((p) => `"${p}"`).join(", ")}.
12. Plain English, short sentences, at most ${LIMITS.claimWords} words per sentence item. Address the candidate as "you".`;

function instructions(input: AnalystInput): string {
  const reqs = input.requirements
    .map(
      (r) =>
        `- ${r.reqId} [${r.importance}, ${r.kind}] ${r.text} — CareerOS: ${r.codeStatus} (${r.codeReason})` +
        (r.evidenceIds.length ? ` — your evidence: ${r.evidenceIds.join(", ")}` : ""),
    )
    .join("\n");
  const stats = input.stats.map((s) => `- ${s.id}: ${s.text}`).join("\n");
  const matches = input.matches.length
    ? input.matches.map((m) => `- "${m.responsibility}" ↔ ${m.evidenceId}`).join("\n")
    : "- none computed";
  return [
    `Job: ${input.job.title} at ${input.job.company}${input.job.seniority ? ` (${input.job.seniority})` : ""}${input.job.domain ? `, domain: ${input.job.domain}` : ""}.`,
    `CareerOS recommendation: ${input.recommendation}. Allowed strategy actions: ${ALLOWED_ACTIONS[input.recommendation].join(", ")}.`,
    `Requirements:\n${reqs || "- none could be read"}`,
    `Computed stats:\n${stats}`,
    `Duties matched to the closest CV line by meaning:\n${matches}`,
    "The CV evidence catalog (id: text) and the job posting are in the untrusted content blocks below.",
  ].join("\n\n");
}

type MockPayload = { input: AnalystInput };
registerMockResponder(FIT_ANALYST_WORKFLOW, (payload) => deterministicFitReport((payload as MockPayload).input));

export type FitAnalystResult = {
  report: FitReport;
  validation: ValidationResult;
  mode: "ai" | "cache" | "no_ai";
  provider: string | null;
  model: string | null;
  repaired: boolean;
  injectionSuspected: boolean;
};

export async function writeFitReport(
  runner: AiRunner,
  input: AnalystInput,
  posting: string,
  userId?: string,
): Promise<FitAnalystResult> {
  const base = {
    workflow: FIT_ANALYST_WORKFLOW,
    promptVersion: FIT_ANALYST_PROMPT_VERSION,
    tier: "strong" as const,
    system: FIT_ANALYST_SYSTEM,
    untrusted: [
      { kind: "cv" as const, id: "cv-evidence", text: input.evidence.map((e) => `${e.id}: ${e.text}`).join("\n") },
      { kind: "job_description" as const, id: "job-posting", text: posting },
    ],
    schema: fitReportSchema,
    userId,
    cache: true,
    temperature: 0.2,
    timeoutMs: 90_000,
    maxOutputTokens: 12_000,
    mockPayload: { input } satisfies MockPayload,
  };
  const first = await runner.runStructured({
    ...base,
    instructions: instructions(input),
    noAiFallback: () => deterministicFitReport(input),
  });
  const firstCheck = validateFitReport(first.output, input);
  const result = {
    report: first.output,
    validation: firstCheck,
    mode: first.mode,
    provider: first.provider,
    model: first.model,
    repaired: false,
    injectionSuspected: first.injectionSuspected,
  };
  if (firstCheck.passed || first.mode === "no_ai") return result;

  // One repair: the model sees its answer and the validator's list of problems.
  try {
    const second = await runner.runStructured({
      ...base,
      instructions: [
        instructions(input),
        `Your previous answer:\n${JSON.stringify(first.output)}`,
        `CareerOS's checks found these problems. Return the whole report again with each one fixed and nothing else changed:\n${firstCheck.issues.map((i) => `- ${i.path}: ${i.message}`).join("\n")}`,
      ].join("\n\n"),
    });
    const secondCheck = validateFitReport(second.output, input);
    // Keep whichever answer has fewer problems.
    if (secondCheck.issues.length > firstCheck.issues.length) return result;
    return {
      ...result,
      report: second.output,
      validation: secondCheck,
      provider: second.provider,
      model: second.model,
      repaired: true,
    };
  } catch {
    return result;
  }
}
