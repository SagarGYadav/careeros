// Skill name matching (SPEC §9.3, §10.5): "React.js", "ReactJS" and "react js" are the same skill.

/**
 * Lower-cases and removes spaces, dots, hyphens, underscores and slashes, but keeps "#" and "+"
 * so C# and C++ stay distinct from C.
 */
export function skillKey(name: string): string {
  return name
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[\s._\-/]+/g, "")
    .replace(/[^a-z0-9#+]/g, "");
}

export type SkillCatalogueEntry = { id: string; slug: string; name: string; aliases: string[] };

/** Index from every name and alias key to the catalogue entry. Earlier entries win on conflicts. */
export function buildSkillIndex<T extends SkillCatalogueEntry>(catalogue: T[]): Map<string, T> {
  const index = new Map<string, T>();
  for (const entry of catalogue) {
    for (const name of [entry.name, entry.slug, ...entry.aliases]) {
      const key = skillKey(name);
      if (key && !index.has(key)) index.set(key, entry);
    }
  }
  return index;
}

/** The catalogue skill a name refers to, or null when it's not in the catalogue. */
export function matchSkill<T extends SkillCatalogueEntry>(index: Map<string, T>, name: string): T | null {
  const key = skillKey(name);
  if (!key) return null;
  return index.get(key) ?? (key.endsWith("js") ? (index.get(key.slice(0, -2)) ?? null) : null);
}
