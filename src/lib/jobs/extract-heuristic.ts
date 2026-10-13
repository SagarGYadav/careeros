// Deterministic JobExtractor (SPEC §8.1): reads section headings ("Requirements", "Good to have"), importance words
// ("must", "a plus") and catalogue skill names. It is the mock AI's answer in development and tests, and the no-AI
// fallback. It finds less than the AI does (no paraphrase, no domain sense), but never invents anything.
import { mentionsSkill, skillKeysIn } from "@/lib/cv/evidence";
import { normalizeForMatch, similarity, splitLines, stripBullet } from "@/lib/cv/text";
import { skillKey } from "@/lib/skills/normalize";
import { parseExperience, seniorityFromPosting } from "./conditions";
import type { ExtractedRequirement, JobExtraction, RequirementImportance, RequirementKind } from "./extraction";
import { IMPORTANCE_RANK } from "./extraction";
import { detectWorkMode } from "./normalize";

export type HeuristicExtractInput = {
  text: string;
  title: string;
  /** Catalogue skills; aliases help find "ReactJS" or "Postgres". */
  skills: { name: string; aliases: string[] }[];
  families: { slug: string; name: string; titleVariants: string[] }[];
};

type Section = "responsibilities" | "required" | "preferred" | "other" | null;

const HEADINGS: [Section, RegExp][] = [
  ["preferred", /nice[\s-]to[\s-]have|good[\s-]to[\s-]have|preferred|bonus|plus points|desirable|added advantage/i],
  [
    "responsibilities",
    /responsibilit|what you('|’)?ll do|what you will do|your role|the role|day[\s-]to[\s-]day|key duties|job description/i,
  ],
  [
    "required",
    /requirement|qualification|must[\s-]have|looking for|what you('|’)?ll need|what you need|skills required|required skills|you have|who you are|eligibility|tech stack|skills/i,
  ],
  ["other", /about (us|the company|the team)|benefits|perks|why join|what we offer|compensation|equal opportunity/i],
];

const PREFERRED_WORDS = /good to have|is a plus|\ba plus\b|\bplus\b|preferred|bonus|desirable|advantage|exposure to/i;
const NICE_WORDS = /nice to have/i;
const EDUCATION =
  /\b(bachelor|b\.?\s?tech|b\.?e\.?|degree|graduate|master|m\.?\s?tech|mca|bca|b\.?sc|computer science)\b/i;
const SOFT =
  /communication|team player|collaborat|ownership|problem[\s-]solving|stakeholder|attention to detail|self[\s-]starter/i;
const DOMAINS =
  /\b(fintech|payments|e-?commerce|healthcare|healthtech|edtech|saas|banking|insurance|logistics|gaming|adtech|travel|retail|crypto|telecom)\b/i;
const ACTION_START =
  /^(build|develop|design|own|work|collaborate|write|lead|maintain|implement|ensure|drive|create|optimi[sz]e|mentor|deliver|participate|review|improve|contribute|translate|architect|ship|debug|test)\b/i;
const YEARS = /(\d{1,2}(?:\.\d)?)\s*\+?\s*(?:-|–|to)?\s*(?:\d{1,2}\s*)?\+?\s*(?:years?|yrs?)/i;

/** Short or common-word skill names ("Go", "Express") must appear capitalised as a whole word to count. */
const AMBIGUOUS = new Set([
  "go",
  "r",
  "c",
  "express",
  "spring",
  "swift",
  "rust",
  "dart",
  "ember",
  "less",
  "jest",
  "make",
]);

export function mentionsCatalogueSkill(text: string, keys: Set<string>, skill: { name: string; aliases: string[] }) {
  for (const name of [skill.name, ...skill.aliases]) {
    const key = skillKey(name);
    if (AMBIGUOUS.has(key) || key.length <= 2) {
      const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      if (new RegExp(`(^|[^A-Za-z0-9])${escaped}($|[^A-Za-z0-9#+])`).test(text) && /^[A-Z]/.test(name)) return true;
      continue;
    }
    if (mentionsSkill(keys, name)) return true;
  }
  return false;
}

/** Words a heading starts with; without a colon, "Strong communication skills" is a requirement, not a heading. */
const HEADING_START =
  /^(what|key|your|the|about|requirements?|responsibilities|qualifications?|skills|must|nice|good|preferred|bonus|who|benefits|perks|why|tech|job|role|eligibility|desired|required|minimum|basic|additional|technical)\b/i;

function headingOf(line: string): Section | undefined {
  const bare = line.replace(/[:\-–—]+$/, "").trim();
  const words = bare.split(/\s+/).length;
  const colon = /:$/.test(line);
  if (words > 7 || (!colon && (words > 4 || !HEADING_START.test(bare)))) return undefined;
  for (const [section, pattern] of HEADINGS) if (pattern.test(bare)) return section;
  return undefined;
}

/** Lines split into sentences, so "GraphQL is a plus" only marks its own sentence (Adzuna sends one paragraph). */
function units(text: string): string[] {
  return splitLines(text).flatMap((line) =>
    line
      .split(/(?<=[.;!?])\s+(?=[A-Z0-9])/)
      .map((sentence) => sentence.trim())
      .filter(Boolean),
  );
}

export function extractJobHeuristically(input: HeuristicExtractInput): JobExtraction {
  const requirements: ExtractedRequirement[] = [];
  const responsibilities: string[] = [];
  let section: Section = null;
  let sawHeadings = false;

  for (const raw of units(input.text)) {
    const heading = headingOf(raw);
    if (heading !== undefined) {
      section = heading;
      sawHeadings = true;
      continue;
    }
    const line = stripBullet(raw);
    if (!line || section === "other") continue;

    const keys = skillKeysIn(line);
    const skills = input.skills.filter((s) => mentionsCatalogueSkill(line, keys, s)).map((s) => s.name);
    const inlineImportance: RequirementImportance | null = NICE_WORDS.test(line)
      ? "nice_to_have"
      : PREFERRED_WORDS.test(line)
        ? "preferred"
        : null;
    const isDuty = section === "responsibilities" || (!sawHeadings && ACTION_START.test(line) && !YEARS.test(line));
    if (isDuty) {
      if (responsibilities.length < 12) responsibilities.push(line);
      // Skills named only in the duties are implied requirements.
      for (const name of skills) push(name, "skill", "implied", null, line);
      continue;
    }
    const importance: RequirementImportance = inlineImportance ?? (section === "preferred" ? "preferred" : "required");
    const years = line.match(YEARS);
    const yearsRequired = years ? Number(years[1]) : null;
    if (skills.length) {
      for (const name of skills) push(name, "skill", importance, skills.length === 1 ? yearsRequired : null, line);
      continue;
    }
    if (yearsRequired !== null && /experience|exp\b/i.test(line))
      push(line, "experience", importance, yearsRequired, line);
    else if (EDUCATION.test(line)) push(line, "education", importance, null, line);
    else if (SOFT.test(line)) push(line, "soft", importance, null, line);
    else if (DOMAINS.test(line) && section !== null) push(line, "domain", importance, null, line);
  }

  function push(
    text: string,
    kind: RequirementKind,
    importance: RequirementImportance,
    yearsRequired: number | null,
    quote: string,
  ) {
    const existing = requirements.find((r) => r.kind === kind && r.text.toLowerCase() === text.toLowerCase());
    if (existing) {
      if (IMPORTANCE_RANK[importance] < IMPORTANCE_RANK[existing.importance]) existing.importance = importance;
      existing.yearsRequired ??= yearsRequired;
      return;
    }
    requirements.push({ text, skillName: kind === "skill" ? text : null, kind, importance, yearsRequired, quote });
  }

  const experience = parseExperience(input.text);
  const title = normalizeForMatch(input.title);
  let family: { slug: string; score: number } | null = null;
  for (const f of input.families) {
    for (const name of [f.name, ...f.titleVariants]) {
      const score = similarity(title, normalizeForMatch(name));
      if (!family || score > family.score) family = { slug: f.slug, score };
    }
  }
  return {
    title: null,
    company: null,
    location: null,
    workMode: detectWorkMode("", input.text, null),
    employmentType: /\binternship\b/i.test(input.text)
      ? "internship"
      : /\bcontract\b/i.test(input.text)
        ? "contract"
        : /\bfull[\s-]time\b/i.test(input.text)
          ? "full-time"
          : null,
    domain: input.text.match(DOMAINS)?.[1]?.toLowerCase() ?? null,
    seniority: seniorityFromPosting(input.title, experience),
    roleFamilySlug: family && family.score >= 0.85 ? family.slug : null,
    experience,
    responsibilities,
    requirements: requirements.slice(0, 40),
  };
}
