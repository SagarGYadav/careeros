// RoleSuggester workflow (SPEC §8.2, §10.1): profile facts + CV evidence + role catalog → 5–10 target roles with
// reasons citing evidence ids, title variants and search keywords. Balanced tier. Category and seniority are
// computed in code afterwards; the reason is checked against the evidence catalog.
import "server-only";
import { z } from "zod";
import { registerMockResponder } from "@/lib/ai/mock";
import type { AiRunner } from "@/lib/ai/runner";
import { suggestRolesHeuristically, type RoleSuggestInput, type RoleSuggestion } from "@/lib/roles/suggest-heuristic";

export const ROLE_SUGGESTER_WORKFLOW = "role-suggester";
export const ROLE_SUGGESTER_PROMPT_VERSION = "1";

export const roleSuggestionsSchema = z.object({
  roles: z.array(
    z.object({
      title: z.string().describe("The role as employers advertise it, e.g. 'Frontend Developer'"),
      roleFamilySlug: z.string().nullable().describe("Slug of the matching catalog role, or null for a role not in it"),
      fitReason: z
        .string()
        .describe("One or two sentences on why the CV fits this role, citing evidence ids in brackets like [E3]"),
      evidenceIds: z.array(z.string()).describe("The evidence ids the reason relies on"),
      titleVariants: z.array(z.string()).describe("3–5 job titles employers in India use for this role"),
      keywords: z.array(z.string()).describe("5–8 skills or terms that job ads for this role contain"),
    }),
  ),
});

export const ROLE_SUGGESTER_SYSTEM = `You suggest target job roles for a job seeker, based only on evidence from \
their CV. CareerOS uses your roles to search job sites.

Rules:
1. Suggest 5 to 10 roles. Prefer roles from the catalog in the instructions (give their slug); add a role that is \
not in the catalog only when the evidence clearly supports it (slug null).
2. Include roles the person can apply for now and a few that stretch their profile, but never roles the evidence \
does not support at all.
3. fitReason: one or two plain sentences about the person's own work, citing evidence ids in brackets, e.g. \
"Built the merchant dashboard in Next.js [E3]". Do not invent facts. Use a number only if it appears in the cited \
evidence or in the facts given.
4. titleVariants: 3 to 5 titles that real job ads in India use for the same role (e.g. "SDE - Frontend").
5. keywords: 5 to 8 skills or terms from the evidence that job ads for this role mention.
6. Do not decide seniority or how strong the fit is; CareerOS computes those.`;

/** Code-computed facts the reasons may quote numbers from. */
export function roleSuggesterFacts(input: RoleSuggestInput): number[] {
  return input.years === null ? [] : [input.years];
}

function instructions(input: RoleSuggestInput): string {
  const catalog = input.families
    .map((f) => `- ${f.slug}: ${f.name} (core skills: ${f.coreSkills.join(", ")})`)
    .join("\n");
  const skills = input.skills.map((s) => `${s.name} (${s.proficiency}/5)`).join(", ");
  return [
    "Suggest target roles for this person.",
    `Facts computed by CareerOS: ${input.years ?? "unknown"} years of experience${input.domains.length ? `; domains: ${input.domains.join(", ")}` : ""}.`,
    `Skills with proficiency (1–5): ${skills || "none recorded"}.`,
    `Role catalog:\n${catalog}`,
    "The CV evidence catalog (id: text) is in the untrusted content block below.",
  ].join("\n\n");
}

registerMockResponder(ROLE_SUGGESTER_WORKFLOW, (payload) => ({
  roles: suggestRolesHeuristically(payload as RoleSuggestInput),
}));

export type RoleSuggesterResult = {
  roles: RoleSuggestion[];
  mode: "ai" | "cache" | "no_ai";
  provider: string | null;
  model: string | null;
};

export async function suggestRolesWithAi(
  runner: AiRunner,
  input: RoleSuggestInput,
  userId?: string,
): Promise<RoleSuggesterResult> {
  const result = await runner.runStructured({
    workflow: ROLE_SUGGESTER_WORKFLOW,
    promptVersion: ROLE_SUGGESTER_PROMPT_VERSION,
    tier: "balanced",
    system: ROLE_SUGGESTER_SYSTEM,
    instructions: instructions(input),
    untrusted: [{ kind: "cv", id: "cv-evidence", text: input.evidence.map((e) => `${e.id}: ${e.text}`).join("\n") }],
    schema: roleSuggestionsSchema,
    userId,
    cache: true,
    temperature: 0.2,
    timeoutMs: 60_000,
    maxOutputTokens: 6_000,
    mockPayload: input,
    noAiFallback: () => ({ roles: suggestRolesHeuristically(input) }),
  });
  return { roles: result.output.roles, mode: result.mode, provider: result.provider, model: result.model };
}
