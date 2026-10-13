// Deterministic role suggestions: the mock AI's answer and the no-AI fallback (SPEC §8.1). Ranks catalog role
// families by how many of their core skills the user holds, and cites the CV evidence that names them.
import { mentionsSkill, skillKeysIn } from "@/lib/cv/evidence";
import { skillKey } from "@/lib/skills/normalize";

export type RoleSuggestInput = {
  years: number | null;
  headline: string | null;
  domains: string[];
  /** The user's skills with their (confirmed or suggested) proficiency. */
  skills: { name: string; proficiency: number }[];
  /** CV evidence catalog: bullets, technology lists, skills lines. */
  evidence: { id: string; kind: string; text: string }[];
  families: { slug: string; name: string; titleVariants: string[]; coreSkills: string[] }[];
};

export type RoleSuggestion = {
  title: string;
  roleFamilySlug: string | null;
  fitReason: string;
  evidenceIds: string[];
  titleVariants: string[];
  keywords: string[];
};

const MAX_SUGGESTIONS = 6;

export function suggestRolesHeuristically(input: RoleSuggestInput): RoleSuggestion[] {
  const strong = new Set(input.skills.filter((s) => s.proficiency >= 3).map((s) => skillKey(s.name)));
  const keyed = input.evidence.map((e) => ({ id: e.id, keys: skillKeysIn(e.text) }));

  return input.families
    .map((family) => {
      const held = family.coreSkills.filter((name) => strong.has(skillKey(name)));
      return { family, held, share: family.coreSkills.length ? held.length / family.coreSkills.length : 0 };
    })
    .filter((f) => f.held.length > 0)
    .sort((a, b) => b.share - a.share || b.held.length - a.held.length)
    .slice(0, MAX_SUGGESTIONS)
    .map(({ family, held }) => {
      const shown = held.slice(0, 3);
      const evidenceIds = [
        ...new Set(shown.flatMap((name) => keyed.filter((e) => mentionsSkill(e.keys, name)).map((e) => e.id))),
      ].slice(0, 3);
      const cited = evidenceIds.map((id) => `[${id}]`).join("");
      return {
        title: family.name,
        roleFamilySlug: family.slug,
        fitReason: `Your CV shows work with ${shown.join(", ")}${cited ? ` ${cited}` : ""}.`,
        evidenceIds,
        titleVariants: family.titleVariants.slice(0, 4),
        keywords: family.coreSkills.slice(0, 8),
      };
    });
}
