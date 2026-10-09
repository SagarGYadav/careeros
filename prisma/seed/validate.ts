import { skillKey } from "../../src/lib/skills/normalize";
import { ROLE_FAMILIES } from "./role-families";
import { SKILL_RELATIONS, SKILLS } from "./skills";

/** Throws if the seed data is inconsistent. Also run by unit tests, so mistakes fail CI before they reach a DB. */
export function assertCatalogueConsistent() {
  // Two skills must never claim the same name or alias, or matching would depend on catalogue order.
  const seen = new Map<string, string>();
  for (const skill of SKILLS) {
    for (const name of [skill.name, skill.slug, ...(skill.aliases ?? [])]) {
      const key = skillKey(name);
      const owner = seen.get(key);
      if (owner && owner !== skill.slug) throw new Error(`"${name}" is claimed by both ${owner} and ${skill.slug}`);
      seen.set(key, skill.slug);
    }
  }
  const slugs = new Set(SKILLS.map((s) => s.slug));
  if (slugs.size !== SKILLS.length) throw new Error("Duplicate skill slug in the catalogue");
  for (const [from, to] of SKILL_RELATIONS) {
    if (!slugs.has(from) || !slugs.has(to)) throw new Error(`Unknown skill in relation ${from} -> ${to}`);
  }
  for (const family of ROLE_FAMILIES) {
    for (const slug of family.coreSkills) {
      if (!slugs.has(slug)) throw new Error(`Unknown core skill ${slug} in role family ${family.slug}`);
    }
    for (const adjacent of family.adjacent) {
      if (!ROLE_FAMILIES.some((f) => f.slug === adjacent)) throw new Error(`Unknown adjacent family ${adjacent}`);
    }
  }
}
