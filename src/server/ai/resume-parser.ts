// ResumeParser workflow (SPEC §8.2, §9.1 step 3): CV text + link list (+ the PDF itself for providers that read
// PDFs) → ParsedCv. Strong tier, temperature 0, cached per file. The deterministic parser answers in mock mode
// and when every provider is unavailable.
import "server-only";
import { registerMockResponder } from "@/lib/ai/mock";
import type { AiRunner } from "@/lib/ai/runner";
import type { UntrustedBlock } from "@/lib/ai/untrusted";
import type { CvParseFn, CvParseRequest } from "@/lib/cv/analyse";
import type { CvLink } from "@/lib/cv/extract-text";
import { parseCvHeuristically } from "@/lib/cv/heuristic-parser";
import { parsedCvSchema, type ParsedCv } from "@/lib/cv/schema";

export const RESUME_PARSER_WORKFLOW = "resume-parser";
/** Bump when the prompt or schema changes, so cached answers from the old prompt are not reused. */
export const RESUME_PARSER_PROMPT_VERSION = "1";

// A short fictional example (few-shot) showing the exact-copy rules on a tiny CV.
const EXAMPLE_CV = `Meera Joshi
Backend Developer
meera.joshi@example.com | +91 90000 00000 | Kochi, Kerala, India | GitHub
EXPERIENCE
Backend Developer — Coral Systems
Kochi · Full-time · Mar 2022 – Present
• Built payment APIs in Node.js and PostgreSQL handling 50,000
requests a day.
• Reduced p95 latency from 800 ms to 200 ms by adding Redis caching.
Tech: Node.js, PostgreSQL, Redis
EDUCATION
B.Tech in Computer Science, Cochin University, 2017 – 2021, 8.2 CGPA
SKILLS
Languages: JavaScript, Python
Soft skills: Teamwork, Communication
Links in the file: "GitHub" → https://github.com/meera-joshi-example`;

const EXAMPLE_OUTPUT: ParsedCv = {
  personal: {
    fullName: "Meera Joshi",
    email: "meera.joshi@example.com",
    phone: "+91 90000 00000",
    city: "Kochi",
    state: "Kerala",
    country: "India",
    links: [{ type: "github", url: "https://github.com/meera-joshi-example", label: "GitHub" }],
    otherDetails: [],
  },
  headline: "Backend Developer",
  summary: null,
  experience: [
    {
      company: "Coral Systems",
      title: "Backend Developer",
      employmentType: "full_time",
      location: "Kochi",
      workMode: null,
      start: "Mar 2022",
      end: null,
      isCurrent: true,
      domain: null,
      teamSize: null,
      bullets: [
        { text: "Built payment APIs in Node.js and PostgreSQL handling 50,000 requests a day.", kind: "achievement" },
        { text: "Reduced p95 latency from 800 ms to 200 ms by adding Redis caching.", kind: "achievement" },
      ],
      technologies: ["Node.js", "PostgreSQL", "Redis"],
      sourceQuote: "Backend Developer — Coral Systems\nKochi · Full-time · Mar 2022 – Present",
    },
  ],
  projects: [],
  education: [
    {
      institution: "Cochin University",
      degree: "B.Tech",
      field: "Computer Science",
      location: null,
      start: "2017",
      end: "2021",
      grade: "8.2 CGPA",
      sourceQuote: "B.Tech in Computer Science, Cochin University, 2017 – 2021, 8.2 CGPA",
    },
  ],
  certifications: [],
  skills: {
    explicit: [
      { name: "JavaScript", category: "Languages" },
      { name: "Python", category: "Languages" },
    ],
    inferred: [
      { name: "Node.js", evidenceQuote: "Tech: Node.js, PostgreSQL, Redis" },
      { name: "PostgreSQL", evidenceQuote: "Tech: Node.js, PostgreSQL, Redis" },
      { name: "Redis", evidenceQuote: "Tech: Node.js, PostgreSQL, Redis" },
    ],
    soft: ["Teamwork", "Communication"],
  },
  otherSections: [],
  jobSearch: { noticePeriod: null, currentCtc: null, expectedCtc: null, preferredLocations: [] },
};

export const RESUME_PARSER_SYSTEM = `You extract structured data from a CV (résumé) for CareerOS, a personal career app. \
The user reviews every field afterwards, so accuracy matters more than filling every field.

Rules:
1. Copy text exactly as it appears in the CV: names, companies, job titles, institutions, degrees, bullet points, \
skills. Do not paraphrase, shorten, translate, correct or merge anything.
2. Never invent. If something is not in the CV, use null or an empty list. Never use outside knowledge to fill a field.
3. Every role is a separate experience entry, including internships. Keep every bullet point as its own item, in \
order. When the PDF wrapped a bullet across lines, join it back into one line.
4. Dates: copy start and end dates as written ("Apr 2023", "2019"). For a current role ("Present", "Till date") set \
end to null and isCurrent to true.
5. Skills: "explicit" = every skill listed in a skills section, with the group heading it is listed under (null if \
none). "inferred" = technologies or tools used in experience or projects that are not in a skills section, each with \
the exact CV text that shows it. "soft" = soft skills (communication, leadership, …).
6. Links: use the link list given after the CV text (addresses behind linked words such as "LinkedIn") as well as \
addresses written in the text. Type each as linkedin, github (a profile, not a repository), portfolio (a personal \
website) or other. Repository links belong to their project.
7. Personal details beyond contact information (date of birth, nationality, gender, marital status, languages \
known) go in personal.otherDetails exactly as written.
8. Sections that fit nowhere else (awards, publications, volunteering, spoken languages, interests, declarations, \
anything else) go in otherSections with their heading. Drop nothing.
9. Job-search details written in the CV (notice period, current CTC, expected CTC, preferred locations) go in \
jobSearch exactly as written.
10. sourceQuote: copy the CV line or lines that name the role, project, degree or certification and its dates.
11. In tables, cells are separated by tab characters.

Example CV:
${EXAMPLE_CV}

Example output:
${JSON.stringify(EXAMPLE_OUTPUT)}`;

function linksBlock(links: CvLink[]): string {
  return links.map((link) => `"${link.text ?? ""}" → ${link.url}`).join("\n");
}

function instructionsFor(request: CvParseRequest): string {
  if (request.onlySection) {
    return [
      `A first extraction of this CV missed items in the "${request.onlySection.heading}" section.`,
      "Extract ONLY that section from the excerpt below: every entry and every bullet, copied exactly.",
      "Leave every other field empty (null or an empty list).",
    ].join(" ");
  }
  return [
    "Extract the CV in the untrusted content below into the required JSON.",
    request.pdf
      ? "The text was extracted from the attached PDF: use the PDF to understand columns and tables, and copy exact strings from the text."
      : "The text was extracted from the uploaded file.",
    request.sectionHeadings.length ? `Section headings found in the text: ${request.sectionHeadings.join(", ")}.` : "",
    request.links.length ? "The second block lists the links in the file (linked text → address)." : "",
  ]
    .filter(Boolean)
    .join(" ");
}

type MockPayload = { text: string; links: CvLink[] };

// Mock mode answers with the deterministic parse of the same text, so the pipeline and UI run without keys.
registerMockResponder(RESUME_PARSER_WORKFLOW, (payload) => parseCvHeuristically(payload as MockPayload));

/** The parse step for the CV pipeline, backed by the AI runner's provider chain. */
export function createResumeParser(runner: AiRunner, userId?: string): CvParseFn {
  return async (request) => {
    const untrusted: UntrustedBlock[] = request.onlySection
      ? [{ kind: "cv", id: `cv-section-${request.onlySection.kind}`, text: request.onlySection.text }]
      : [
          { kind: "cv", id: "cv-text", text: request.text },
          ...(request.links.length ? [{ kind: "cv" as const, id: "cv-links", text: linksBlock(request.links) }] : []),
        ];
    const result = await runner.runStructured({
      workflow: RESUME_PARSER_WORKFLOW,
      promptVersion: RESUME_PARSER_PROMPT_VERSION,
      tier: "strong",
      system: RESUME_PARSER_SYSTEM,
      instructions: instructionsFor(request),
      untrusted,
      pdf: request.onlySection ? undefined : request.pdf,
      schema: parsedCvSchema,
      userId,
      cache: true,
      temperature: 0,
      timeoutMs: 120_000,
      mockPayload: { text: request.text, links: request.links } satisfies MockPayload,
      noAiFallback: () => parseCvHeuristically({ text: request.text, links: request.links }),
    });
    return {
      parsed: result.output,
      mode: result.mode,
      provider: result.provider,
      model: result.model,
      injectionSuspected: result.injectionSuspected,
    };
  };
}
