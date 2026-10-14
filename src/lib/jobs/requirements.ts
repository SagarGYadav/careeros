// Code checks on JobExtractor's requirements (SPEC §8.4, §12.5) before anything is scored or cited:
// 1. Every quote must appear in the posting (fuzzy ≥ 0.85); a requirement whose words can't be found is dropped.
// 2. Skill names map to the catalogue (aliases included), so scoring compares like with like.
// 3. Catalogue skills the posting names that no requirement covers are added as "implied" (source "keyword").
// 4. Duplicates merge (the higher importance wins), then requirements get ids R1…Rn, must-haves first.
import { catalogueSkillsIn, skillKeysIn } from "@/lib/cv/evidence";
import { bestMatchScore, normalizeForMatch, splitLines } from "@/lib/cv/text";
import { matchSkill, type SkillCatalogueEntry } from "@/lib/skills/normalize";
import { mentionsCatalogueSkill } from "./extract-heuristic";
import {
  IMPORTANCE_RANK,
  type ExtractedRequirement,
  type RequirementImportance,
  type RequirementKind,
} from "./extraction";

const GROUNDING_THRESHOLD = 0.85;
const MAX_REQUIREMENTS = 40;

export type FinalRequirement = {
  reqId: string;
  skillId: string | null;
  skillName: string | null;
  text: string;
  kind: RequirementKind;
  importance: RequirementImportance;
  yearsRequired: number | null;
  quote: string;
  source: "ai" | "keyword" | "user";
  sortOrder: number;
};

export type FinalizeResult = { requirements: FinalRequirement[]; dropped: string[] };

function grounded(haystack: string, text: string): boolean {
  const needle = normalizeForMatch(text);
  return needle.length > 0 && bestMatchScore(haystack, needle) >= GROUNDING_THRESHOLD;
}

/** The posting line that names a skill, for a keyword requirement's quote. */
function lineNaming(text: string, skill: SkillCatalogueEntry): string {
  return (splitLines(text).find((line) => mentionsCatalogueSkill(line, skillKeysIn(line), skill)) ?? skill.name).slice(
    0,
    300,
  );
}

/**
 * The one catalogue skill a longer name contains: "Web performance tuning" → Web performance, "Web accessibility
 * (WCAG)" → Web accessibility. Null when it names none or several (those should be separate requirements).
 */
function containedSkill<T extends SkillCatalogueEntry>(name: string, catalogue: T[]): T | null {
  const keys = skillKeysIn(name);
  const found = catalogue.filter((skill) => mentionsCatalogueSkill(name, keys, skill));
  return found.length === 1 ? found[0] : null;
}

export function finalizeRequirements<T extends SkillCatalogueEntry>(
  extracted: ExtractedRequirement[],
  descriptionText: string,
  catalogue: T[],
  index: Map<string, T>,
  source: "ai" | "user" = "ai",
): FinalizeResult {
  const haystack = normalizeForMatch(descriptionText);
  const dropped: string[] = [];
  type Draft = Omit<FinalRequirement, "reqId" | "sortOrder"> & { order: number };
  const drafts: Draft[] = [];

  extracted.forEach((req, order) => {
    const quote = grounded(haystack, req.quote) ? req.quote : grounded(haystack, req.text) ? req.text : null;
    if (!quote) {
      dropped.push(req.text);
      return;
    }
    const skill =
      (req.skillName ? matchSkill(index, req.skillName) : null) ??
      (req.kind === "skill" ? matchSkill(index, req.text) : null) ??
      (req.kind === "skill" ? containedSkill(req.skillName ?? req.text, catalogue) : null);
    // "3+ years of React" may come back as an experience requirement; with a known skill it is a skill requirement.
    const kind: RequirementKind = skill && (req.kind === "skill" || req.kind === "experience") ? "skill" : req.kind;
    drafts.push({
      skillId: skill?.id ?? null,
      skillName: skill?.name ?? (kind === "skill" ? (req.skillName ?? req.text) : null),
      text: kind === "skill" && skill ? skill.name : req.text,
      kind,
      importance: req.importance,
      yearsRequired: req.yearsRequired,
      quote: quote.slice(0, 500),
      source,
      order,
    });
  });

  const covered = new Set(drafts.map((d) => d.skillId).filter(Boolean));
  for (const skill of catalogueSkillsIn(descriptionText, catalogue)) {
    if (covered.has(skill.id)) continue;
    covered.add(skill.id);
    drafts.push({
      skillId: skill.id,
      skillName: skill.name,
      text: skill.name,
      kind: "skill",
      importance: "implied",
      yearsRequired: null,
      quote: lineNaming(descriptionText, skill),
      source: "keyword",
      order: drafts.length + 1000,
    });
  }

  // Merge duplicates: the same catalogue skill, or the same text for other kinds.
  const merged = new Map<string, Draft>();
  for (const draft of drafts) {
    const key = draft.skillId ? `skill:${draft.skillId}` : `${draft.kind}:${normalizeForMatch(draft.text)}`;
    const existing = merged.get(key);
    if (!existing) {
      merged.set(key, draft);
      continue;
    }
    if (IMPORTANCE_RANK[draft.importance] < IMPORTANCE_RANK[existing.importance]) {
      existing.importance = draft.importance;
      existing.quote = draft.quote;
    }
    if (draft.yearsRequired !== null) {
      existing.yearsRequired = Math.max(existing.yearsRequired ?? 0, draft.yearsRequired);
    }
  }

  const ordered = [...merged.values()]
    .sort((a, b) => IMPORTANCE_RANK[a.importance] - IMPORTANCE_RANK[b.importance] || a.order - b.order)
    .slice(0, MAX_REQUIREMENTS);
  return {
    dropped,
    requirements: ordered.map((d, i) => ({
      reqId: `R${i + 1}`,
      skillId: d.skillId,
      skillName: d.skillName,
      text: d.text,
      kind: d.kind,
      importance: d.importance,
      yearsRequired: d.yearsRequired,
      quote: d.quote,
      source: d.source,
      sortOrder: i,
    })),
  };
}
