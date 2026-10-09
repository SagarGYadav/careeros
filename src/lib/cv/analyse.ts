// The CV pipeline without storage (SPEC §9.1 steps 2–4): text and links → sections → parse (AI or deterministic)
// → verification → targeted second pass for incomplete sections → verified draft and evidence catalog.
// The parse step is passed in, so tests and the no-AI mode use the same orchestration as production.
import { extractCvText, type CvLink, type ExtractedCv } from "./extract-text";
import type { CvFileKind } from "./files";
import { parseCvHeuristically } from "./heuristic-parser";
import type { ParsedCv } from "./schema";
import { detectSections, type CvSection, type SectionKind } from "./sections";
import { splitLines } from "./text";
import { groundingIndex, verifyCv, type SecondPassSection, type VerifiedCv } from "./verify";

export type CvParseRequest = {
  text: string;
  links: CvLink[];
  /** The original file, for providers that read PDFs. */
  pdf?: { data: Uint8Array; filename: string };
  /** Headings found in the text, as a hint for the parser. */
  sectionHeadings: string[];
  /** Set for a targeted second pass: extract only this section, from this excerpt. */
  onlySection?: { kind: SecondPassSection; heading: string; text: string };
};

export type CvParseResult = {
  parsed: ParsedCv;
  /** "ai" = generated now, "cache" = same file answered before, "no_ai" = deterministic parser. */
  mode: "ai" | "cache" | "no_ai";
  provider: string | null;
  model: string | null;
  injectionSuspected: boolean;
};

export type CvParseFn = (request: CvParseRequest) => Promise<CvParseResult>;

export type CvAnalysis = VerifiedCv & {
  extracted: ExtractedCv;
  sections: CvSection[];
  parse: Omit<CvParseResult, "parsed">;
};

/** The deterministic parser as a parse step: used when no AI is wanted at all. */
export const heuristicParse: CvParseFn = async (request) => ({
  parsed: parseCvHeuristically({ text: request.text, links: request.links }),
  mode: "no_ai",
  provider: null,
  model: null,
  injectionSuspected: false,
});

/** Grounded items in one section, used to decide whether a second pass improved it. */
function groundedCount(parsed: ParsedCv, kind: SecondPassSection, found: (text: string) => boolean): number {
  switch (kind) {
    case "experience":
      return parsed.experience.reduce(
        (n, e) => n + (found(e.company) ? 1 : 0) + e.bullets.filter((b) => found(b.text)).length,
        0,
      );
    case "projects":
      return parsed.projects.reduce(
        (n, p) => n + (found(p.name) ? 1 : 0) + p.bullets.filter((b) => found(b.text)).length,
        0,
      );
    case "education":
      return parsed.education.filter((e) => found(e.institution)).length;
    case "certifications":
      return parsed.certifications.filter((c) => found(c.name)).length;
    case "skills":
      return parsed.skills.explicit.length;
  }
}

function replaceSection(base: ParsedCv, from: ParsedCv, kind: SecondPassSection): ParsedCv {
  if (kind === "skills") return { ...base, skills: { ...base.skills, explicit: from.skills.explicit } };
  return { ...base, [kind]: from[kind] };
}

export async function analyseCv(
  file: { bytes: Uint8Array; kind: CvFileKind; fileName: string },
  deps: { parse: CvParseFn; now: Date; onStage?: (stage: "parsing" | "verifying" | "second_pass") => void },
): Promise<CvAnalysis> {
  const extracted = await extractCvText(file.bytes, file.kind);
  const { sections } = detectSections(splitLines(extracted.text));
  const reference = parseCvHeuristically({ text: extracted.text, links: extracted.links });
  const sectionHeadings = sections.map((s) => s.heading);

  deps.onStage?.("parsing");
  const first = await deps.parse({
    text: extracted.text,
    links: extracted.links,
    pdf: file.kind === "pdf" ? { data: file.bytes, filename: file.fileName } : undefined,
    sectionHeadings,
  });

  deps.onStage?.("verifying");
  let parsed = first.parsed;
  let verified = verifyCv(parsed, { extracted, sections, reference, now: deps.now });

  // A second pass only helps when an AI answered; the deterministic parser would return the same thing.
  if (first.mode !== "no_ai" && verified.incompleteSections.length) {
    deps.onStage?.("second_pass");
    const { found } = groundingIndex(extracted.text);
    const requested: SectionKind[] = [];
    const improved: SectionKind[] = [];
    for (const kind of verified.incompleteSections) {
      const sectionText = sections
        .filter((s) => s.kind === kind)
        .map((s) => [s.heading, ...s.lines].join("\n"))
        .join("\n\n");
      requested.push(kind);
      const retry = await deps.parse({
        text: extracted.text,
        links: extracted.links,
        sectionHeadings,
        onlySection: { kind, heading: sections.find((s) => s.kind === kind)?.heading ?? kind, text: sectionText },
      });
      if (groundedCount(retry.parsed, kind, found) > groundedCount(parsed, kind, found)) {
        parsed = replaceSection(parsed, retry.parsed, kind);
        improved.push(kind);
      }
    }
    verified = verifyCv(parsed, { extracted, sections, reference, now: deps.now, secondPass: { requested, improved } });
  }

  const parse = {
    mode: first.mode,
    provider: first.provider,
    model: first.model,
    injectionSuspected: first.injectionSuspected,
  };
  return { ...verified, extracted, sections, parse };
}
