// CV evidence catalog (SPEC §8.4). Every bullet, technology list, certification, degree, skills group and the
// summary gets a stable id (E1…En) in reading order. AI claims cite these ids; the UI renders evidence chips from
// this catalog, never from AI text.
import { skillKey } from "@/lib/skills/normalize";
import type { CvDraft, EvidenceItem } from "./schema";
import { bestMatchScore, normalizeForMatch } from "./text";

/** Skill-name keys of every 1–4 word run in a text, so "React Testing Library" and "Next.js" can be found. */
export function skillKeysIn(text: string): Set<string> {
  const tokens = text.split(/[\s,;:()|·•/]+/).filter(Boolean);
  const keys = new Set<string>();
  for (let size = 1; size <= 4; size++) {
    for (let i = 0; i + size <= tokens.length; i++) {
      const key = skillKey(tokens.slice(i, i + size).join(" "));
      if (!key) continue;
      keys.add(key);
      if (key.endsWith("js") && key.length > 3) keys.add(key.slice(0, -2));
    }
  }
  return keys;
}

export function mentionsSkill(keys: Set<string>, name: string): boolean {
  const key = skillKey(name);
  return Boolean(key) && (keys.has(key) || keys.has(`${key}js`) || (key.endsWith("js") && keys.has(key.slice(0, -2))));
}

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

type PageLocator = (text: string) => number | null;

/** The page a quote is on (PDFs only), or null. */
export function pageLocator(pages: string[]): PageLocator {
  if (pages.length <= 1) return () => (pages.length === 1 ? 1 : null);
  const normalized = pages.map(normalizeForMatch);
  return (text) => {
    const needle = normalizeForMatch(text);
    const index = normalized.findIndex((page) => page.includes(needle) || bestMatchScore(page, needle) >= 0.9);
    return index >= 0 ? index + 1 : null;
  };
}

type Draft = Omit<CvDraft, "computed">;

/**
 * Assigns evidence ids in place (bullet ids, education and certification evidence ids, skill evidence ids) and
 * returns the catalog. `grounded` says whether each text was found in the CV.
 */
export function buildEvidenceCatalog(
  draft: Draft,
  options: { isGrounded: (text: string) => boolean; pageOf: PageLocator },
): EvidenceItem[] {
  const items: EvidenceItem[] = [];
  const add = (kind: EvidenceItem["kind"], text: string, section: string, entry: number | null, grounded?: boolean) => {
    const id = `E${items.length + 1}`;
    items.push({
      id,
      kind,
      text,
      section,
      entry,
      page: options.pageOf(text),
      grounded: grounded ?? options.isGrounded(text),
    });
    return id;
  };

  draft.experience.forEach((role, index) => {
    for (const bullet of role.bullets) bullet.id = add("experience_bullet", bullet.text, "experience", index);
    role.technologiesEvidenceId = role.technologies.length
      ? add(
          "technologies",
          role.technologies.join(", "),
          "experience",
          index,
          role.technologies.every((t) => options.isGrounded(t)),
        )
      : null;
  });
  draft.projects.forEach((project, index) => {
    if (project.description) add("project_description", project.description, "projects", index);
    for (const bullet of project.bullets) bullet.id = add("project_bullet", bullet.text, "projects", index);
    if (project.technologies.length) {
      const grounded = project.technologies.every((t) => options.isGrounded(t));
      add("technologies", project.technologies.join(", "), "projects", index, grounded);
    }
  });
  draft.certifications.forEach((cert, index) => {
    const text = options.isGrounded(cert.sourceQuote) && cert.sourceQuote ? cert.sourceQuote : cert.name;
    cert.evidenceId = add("certification", text, "certifications", index);
  });
  draft.education.forEach((degree, index) => {
    const text =
      options.isGrounded(degree.sourceQuote) && degree.sourceQuote
        ? degree.sourceQuote
        : [degree.degree, degree.field, degree.institution].filter(Boolean).join(", ");
    degree.evidenceId = add("education", text, "education", index);
  });

  // One item per skills group, as listed: "Frameworks: React, Next.js".
  const groups = new Map<string, string[]>();
  for (const skill of draft.skills.explicit) {
    const group = skill.category ?? "";
    groups.set(group, [...(groups.get(group) ?? []), skill.name]);
  }
  const groupIds = new Map<string, string>();
  for (const [group, names] of groups) {
    const text = group ? `${group}: ${names.join(", ")}` : names.join(", ");
    groupIds.set(
      group,
      add(
        "skills",
        text,
        "skills",
        null,
        names.every((n) => options.isGrounded(n)),
      ),
    );
  }

  if (draft.summary) add("summary", draft.summary, "summary", null);
  draft.otherSections.forEach((section, index) => {
    if (section.kind !== "awards" && section.kind !== "publications" && section.kind !== "volunteering") return;
    for (const item of section.items) add("other", item, section.kind, index);
  });

  // Skill evidence: the skills-group item plus every bullet, technology list or summary that names the skill.
  const keyed = items
    .filter((item) => item.kind !== "skills" && item.kind !== "education")
    .map((item) => ({ id: item.id, keys: skillKeysIn(item.text) }));
  const mentions = (name: string) => keyed.filter((item) => mentionsSkill(item.keys, name)).map((item) => item.id);
  for (const skill of draft.skills.explicit) {
    skill.evidenceIds = [groupIds.get(skill.category ?? "")!, ...mentions(skill.name)];
  }
  for (const skill of draft.skills.inferred) skill.evidenceIds = mentions(skill.name);

  return items;
}

/** A skill name as a case-insensitive pattern that also matches spacing variants ("Next JS", "next-js"). */
function namePattern(name: string): RegExp {
  const parts = name
    .split(/[\s.\-]+/)
    .filter(Boolean)
    .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  return new RegExp(parts.join("[\\s.\\-]*"), "gi");
}

/**
 * The catalogue skills a text names, without counting a shorter name inside a longer one: "GitHub Actions" is not
 * also "GitHub". Longer names are matched first and taken out of the text. Results keep the catalogue's order.
 */
export function catalogueSkillsIn<T extends { name: string; aliases: string[] }>(text: string, catalogue: T[]): T[] {
  const longest = (skill: T) => Math.max(...[skill.name, ...skill.aliases].map((n) => n.length));
  const byLength = [...catalogue].sort((a, b) => longest(b) - longest(a));
  const found = new Set<T>();
  let remaining = text;
  let keys = skillKeysIn(remaining);
  for (const skill of byLength) {
    if (!mentionsCatalogueSkill(remaining, keys, skill)) continue;
    found.add(skill);
    for (const name of [skill.name, ...skill.aliases]) {
      remaining = remaining.replace(namePattern(name), " ");
    }
    keys = skillKeysIn(remaining);
  }
  return catalogue.filter((skill) => found.has(skill));
}
