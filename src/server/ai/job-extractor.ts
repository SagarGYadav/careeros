// JobExtractor workflow (SPEC §8 workflow table, §12.5): a job description (untrusted) → responsibilities and
// requirements with importance and the posting's own words. Fast tier. Code then checks every quote against the
// posting, maps skills to the catalogue and numbers the requirements (lib/jobs/requirements.ts).
import "server-only";
import { registerMockResponder } from "@/lib/ai/mock";
import type { AiRunner } from "@/lib/ai/runner";
import { extractJobHeuristically, type HeuristicExtractInput } from "@/lib/jobs/extract-heuristic";
import { jobExtractionSchema, type JobExtraction } from "@/lib/jobs/extraction";

export const JOB_EXTRACTOR_WORKFLOW = "job-extractor";
export const JOB_EXTRACTOR_PROMPT_VERSION = "1";

export const JOB_EXTRACTOR_SYSTEM = `You read a job posting and return its structure as JSON. CareerOS compares \
the requirements with a candidate's CV, so precision matters more than wording.

Rules:
1. requirements: one item per requirement. A line naming several technologies ("React, TypeScript and Redux") \
becomes one item per technology, each with skillName set to that one technology and the same quote.
2. kind: "skill" for a technology, tool, language, framework or method (skillName set); "experience" for years of \
work; "education" for degrees; "domain" for industry knowledge; "soft" for communication, ownership and similar; \
"responsibility" or "other" for anything else the employer requires.
3. importance:
   - "required": listed under requirements / must have / qualifications, or worded as must, required, strong, \
proficient, hands-on.
   - "preferred": good to have, preferred, a plus, bonus, exposure to, familiarity with.
   - "nice_to_have": explicitly "nice to have".
   - "implied": a technology named only in the responsibilities or the description of the work, not in a list of \
requirements.
   When a posting has no sections, treat technologies in sentences about what the candidate needs as required.
4. quote: copy the exact words from the posting (the line or sentence the requirement comes from). Never paraphrase \
the quote and never add a requirement the posting does not state.
5. yearsRequired: only when the posting states years for that requirement ("3+ years of React" → 3).
6. responsibilities: what the person will do, one duty per item, in the posting's words (at most 12).
7. experience: the overall years range asked, min and max (null when not stated). "5+ years" → min 5, max null.
8. seniority, domain, employmentType, workMode: only when the posting states or clearly implies them; else null.
9. roleFamilySlug: the slug from the catalog in the instructions that matches this role, or null.
10. Benefits, company descriptions and equal-opportunity text are not requirements.

Example. Posting:
"Frontend Engineer (Payments). You will build our merchant dashboard in Next.js and own its performance.
Requirements: 3+ years with React; strong TypeScript; experience with REST APIs. Good to have: GraphQL, Jest."
Answer (requirements only): [
{"text":"React","skillName":"React","kind":"skill","importance":"required","yearsRequired":3,"quote":"3+ years with React"},
{"text":"TypeScript","skillName":"TypeScript","kind":"skill","importance":"required","yearsRequired":null,"quote":"strong TypeScript"},
{"text":"REST APIs","skillName":"REST APIs","kind":"skill","importance":"required","yearsRequired":null,"quote":"experience with REST APIs"},
{"text":"GraphQL","skillName":"GraphQL","kind":"skill","importance":"preferred","yearsRequired":null,"quote":"Good to have: GraphQL, Jest"},
{"text":"Jest","skillName":"Jest","kind":"skill","importance":"preferred","yearsRequired":null,"quote":"Good to have: GraphQL, Jest"},
{"text":"Next.js","skillName":"Next.js","kind":"skill","importance":"implied","yearsRequired":null,"quote":"build our merchant dashboard in Next.js"}]
and domain "payments", responsibilities ["build our merchant dashboard in Next.js", "own its performance"].`;

export type JobExtractInput = HeuristicExtractInput & { company: string };

function instructions(input: JobExtractInput): string {
  const catalog = input.families.map((f) => `- ${f.slug}: ${f.name}`).join("\n");
  return [
    `Extract the structure of this job posting: "${input.title}" at ${input.company || "an unnamed company"}.`,
    `Role catalog:\n${catalog}`,
    "The posting is in the untrusted content block below.",
  ].join("\n\n");
}

registerMockResponder(JOB_EXTRACTOR_WORKFLOW, (payload) => extractJobHeuristically(payload as HeuristicExtractInput));

export type JobExtractorResult = {
  extraction: JobExtraction;
  mode: "ai" | "cache" | "no_ai";
  provider: string | null;
  model: string | null;
  injectionSuspected: boolean;
};

export async function extractJobWithAi(
  runner: AiRunner,
  input: JobExtractInput,
  userId?: string,
): Promise<JobExtractorResult> {
  const result = await runner.runStructured({
    workflow: JOB_EXTRACTOR_WORKFLOW,
    promptVersion: JOB_EXTRACTOR_PROMPT_VERSION,
    tier: "fast",
    system: JOB_EXTRACTOR_SYSTEM,
    instructions: instructions(input),
    untrusted: [{ kind: "job_description", id: "job-posting", text: input.text }],
    schema: jobExtractionSchema,
    userId,
    cache: true,
    temperature: 0,
    timeoutMs: 45_000,
    maxOutputTokens: 8_000,
    mockPayload: {
      text: input.text,
      title: input.title,
      skills: input.skills,
      families: input.families,
    } satisfies HeuristicExtractInput,
    noAiFallback: () => extractJobHeuristically(input),
  });
  return {
    extraction: result.output,
    mode: result.mode,
    provider: result.provider,
    model: result.model,
    injectionSuspected: result.injectionSuspected,
  };
}
