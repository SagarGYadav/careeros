// CareerPageExtractor workflow (SPEC §8 workflow table, §11.3 step 4): a careers page's text and links (untrusted)
// → the job openings it lists, as titles and links. Fast tier. Code then keeps only titles that appear on the page
// and links that are the page's own (lib/careersites/reader.ts), so the AI can't invent a job or a destination.
import "server-only";
import { z } from "zod";
import { registerMockResponder } from "@/lib/ai/mock";
import type { AiRunner } from "@/lib/ai/runner";
import type { ListedJob } from "@/lib/careersites/reader";
import type { PageLink } from "@/lib/web/links";

export const CAREER_PAGE_EXTRACTOR_WORKFLOW = "career-page-extractor";
export const CAREER_PAGE_EXTRACTOR_PROMPT_VERSION = "1";

const schema = z.object({
  jobs: z.array(
    z.object({
      title: z.string().describe("The job title exactly as the page shows it"),
      url: z.string().describe("The link to that job, copied from the list of links given"),
    }),
  ),
});

export const CAREER_PAGE_EXTRACTOR_SYSTEM = `You read a company careers page and list the job openings on it.

Rules:
1. Only openings: job titles the page offers now. Not departments, locations, blog posts, benefits or menus.
2. title: copy it exactly as the page shows it.
3. url: the link to that opening, copied exactly from the numbered list of links given. If an opening has no link of \
its own in the list, leave it out.
4. If the page lists no openings (or says there are none), return an empty list.`;

type Input = { url: string; pageText: string; links: PageLink[] };

const JOB_PATH = /\/(jobs?|careers?|openings?|positions?|vacanc(y|ies)|roles?|o)\/[^/]+/i;
const NOT_A_TITLE = /^(apply|view|see|learn more|read more|details|all jobs|open positions|careers?|jobs?|home)$/i;

/** No-AI reading: links whose path looks like a job page and whose text looks like a title. */
export function listJobsHeuristically(input: Input): ListedJob[] {
  return input.links
    .filter((l) => JOB_PATH.test(new URL(l.url).pathname) && l.text.length >= 4 && l.text.length <= 120)
    .filter((l) => !NOT_A_TITLE.test(l.text.trim()))
    .map((l) => ({ title: l.text, url: l.url }));
}

registerMockResponder(CAREER_PAGE_EXTRACTOR_WORKFLOW, (payload) => ({ jobs: listJobsHeuristically(payload as Input) }));

export async function listJobsWithAi(runner: AiRunner, input: Input, userId?: string): Promise<ListedJob[]> {
  const result = await runner.runStructured({
    workflow: CAREER_PAGE_EXTRACTOR_WORKFLOW,
    promptVersion: CAREER_PAGE_EXTRACTOR_PROMPT_VERSION,
    tier: "fast",
    system: CAREER_PAGE_EXTRACTOR_SYSTEM,
    instructions: [
      `List the job openings on this careers page: ${input.url}`,
      "The page text and its numbered links are in the untrusted content blocks below.",
    ].join("\n\n"),
    untrusted: [
      { kind: "career_page", id: "page-text", text: input.pageText },
      {
        kind: "career_page",
        id: "page-links",
        text: input.links.map((l, i) => `${i + 1}. ${l.text} → ${l.url}`).join("\n"),
      },
    ],
    schema,
    userId,
    cache: true,
    temperature: 0,
    timeoutMs: 45_000,
    maxOutputTokens: 4_000,
    mockPayload: input,
    noAiFallback: () => ({ jobs: listJobsHeuristically(input) }),
  });
  return result.output.jobs;
}
