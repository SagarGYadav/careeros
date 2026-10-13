// Role category and seniority (SPEC §10.1), computed in code. The AI suggests roles; it never decides how well
// they fit.

export type SeniorityBand = { level: string; minYears: number; maxYears: number };
export type RoleCategory = "core" | "adjacent" | "stretch";

/** Default bands for roles outside the catalog (same as the seeded families). */
export const DEFAULT_SENIORITY_BANDS: SeniorityBand[] = [
  { level: "junior", minYears: 0, maxYears: 2 },
  { level: "mid", minYears: 2, maxYears: 5 },
  { level: "senior", minYears: 5, maxYears: 8 },
  { level: "lead", minYears: 8, maxYears: 40 },
];

export const SENIORITY_LABELS: Record<string, string> = {
  intern: "Intern",
  junior: "Junior",
  mid: "Mid-level",
  senior: "Senior",
  lead: "Lead",
};

/** The band the user's years fall in. "Intern" applies only with no experience at all. */
export function seniorityFor(years: number | null, bands: SeniorityBand[] = DEFAULT_SENIORITY_BANDS): string {
  const usable = bands.filter((b) => b.level !== "intern" || (years ?? 0) === 0);
  const y = Math.max(0, years ?? 0);
  return (usable.find((b) => y >= b.minYears && y < b.maxYears) ?? usable.at(-1))?.level ?? "mid";
}

export type Coverage = { held: string[]; missing: string[]; total: number; share: number };

/**
 * Share of the role's core skills the user holds at proficiency 3 or more. A skill also counts as held when the
 * user holds one that implies it at that level (Next.js at 4 counts for React).
 */
export function coreSkillCoverage(
  coreSkillIds: { id: string; name: string }[],
  userSkills: { skillId: string; proficiency: number }[],
  impliedBy: Map<string, string[]> = new Map(),
  minProficiency = 3,
): Coverage {
  const strong = new Set(userSkills.filter((s) => s.proficiency >= minProficiency).map((s) => s.skillId));
  const held: string[] = [];
  const missing: string[] = [];
  for (const skill of coreSkillIds) {
    const viaRelation = (impliedBy.get(skill.id) ?? []).some((id) => strong.has(id));
    (strong.has(skill.id) || viaRelation ? held : missing).push(skill.name);
  }
  const total = coreSkillIds.length;
  return { held, missing, total, share: total ? held.length / total : 0 };
}

/** Core ≥ 70%, Adjacent 40–69%, Stretch < 40% of core skills held. */
export function categoryFor(share: number): RoleCategory {
  if (share >= 0.7) return "core";
  if (share >= 0.4) return "adjacent";
  return "stretch";
}
