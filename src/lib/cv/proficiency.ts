// Skill usage and suggested proficiency (SPEC §9.3). A transparent rule in code: years used, recency and how many
// roles and projects show the skill. The user confirms or changes the level; the AI never sets it.
import { currentYearMonth, experienceTotals } from "./dates";
import { mentionsCatalogueSkill, mentionsSkill, skillKeysIn } from "./evidence";
import type { CvDraft } from "./schema";

export type SkillUsage = {
  /** Months across roles that show the skill, overlapping roles counted once. */
  months: number;
  lastUsedYear: number | null;
  roles: number;
  projects: number;
  /** Listed in the CV's skills section. */
  listed: boolean;
  /** Skills that imply this one and were the only evidence somewhere ("Next.js" for React). */
  via: string[];
};

/**
 * Where and for how long the CV shows a skill: a role counts when its technologies or bullets name the skill, or
 * name a skill that implies it (the catalogue says Next.js implies React, so Next.js work is React work).
 */
export function skillUsage(
  draft: Pick<CvDraft, "experience" | "projects">,
  name: string,
  listed: boolean,
  now: Date,
  impliedBy: string[] = [],
  /** Other names of the skill ("WCAG" for Web accessibility), which count as using it. */
  aliases: string[] = [],
): SkillUsage {
  const via = new Set<string>();
  const uses = (text: string) => {
    const keys = skillKeysIn(text);
    if (mentionsCatalogueSkill(text, keys, { name, aliases })) return true;
    const implying = impliedBy.find((other) => mentionsSkill(keys, other));
    if (implying) via.add(implying);
    return Boolean(implying);
  };
  const roles = draft.experience.filter((role) =>
    uses([role.technologies.join(", "), ...role.bullets.map((b) => b.text)].join("\n")),
  );
  const projects = draft.projects.filter((project) =>
    uses(
      [project.technologies.join(", "), project.description ?? "", ...project.bullets.map((b) => b.text)].join("\n"),
    ),
  );
  const intervals = roles.filter((r) => r.startDate).map((r) => ({ start: r.startDate!, end: r.endDate }));
  const thisYear = Number(currentYearMonth(now).slice(0, 4));
  const years = [
    ...roles.map((r) => (r.isCurrent || !r.endDate ? thisYear : Number(r.endDate.slice(0, 4)))),
    ...projects.filter((p) => p.endDate || p.startDate).map((p) => Number((p.endDate ?? p.startDate)!.slice(0, 4))),
  ];
  return {
    months: experienceTotals(intervals, now).totalMonths,
    lastUsedYear: years.length ? Math.max(...years) : null,
    roles: roles.length,
    projects: projects.length,
    listed,
    via: [...via],
  };
}

export type ProficiencySuggestion = { level: 1 | 2 | 3 | 4 | 5; reason: string };

const yearsText = (months: number) => {
  const years = Math.round((months / 12) * 10) / 10;
  return years === 1 ? "1 year" : `${years} years`;
};

/**
 * 1 beginner … 5 expert. Base from years used (<1: 1, 1–3: 2, 3–5: 3, 5+: 4), +1 for breadth (3+ roles and
 * projects with 3+ years), −1 when not used in the last two years. A skill only listed or only used in projects
 * starts at 2 ("working knowledge"): it says the skill is there, but not how deep it goes.
 */
export function suggestProficiency(usage: SkillUsage, currentYear: number): ProficiencySuggestion {
  const years = usage.months / 12;
  let level = years >= 5 ? 4 : years >= 3 ? 3 : years >= 1 ? 2 : 1;
  if (usage.months === 0 && (usage.projects > 0 || usage.listed)) level = 2;
  if (usage.roles + usage.projects >= 3 && years >= 3) level++;
  const stale = usage.lastUsedYear !== null && currentYear - usage.lastUsedYear > 2;
  if (stale) level--;
  const clamped = Math.min(5, Math.max(1, level)) as ProficiencySuggestion["level"];

  const parts: string[] = [];
  if (usage.roles) {
    parts.push(`used for ${yearsText(usage.months)} in ${usage.roles} role${usage.roles > 1 ? "s" : ""}`);
  }
  if (usage.projects) parts.push(`${usage.projects} project${usage.projects > 1 ? "s" : ""}`);
  if (!parts.length) parts.push(usage.listed ? "listed in the skills section only" : "mentioned once");
  if (usage.via.length) parts.push(`counting work with ${usage.via.join(" and ")}`);
  if (usage.lastUsedYear && (usage.roles || usage.projects)) parts.push(`last used in ${usage.lastUsedYear}`);
  const reason = parts.join(", ");
  return { level: clamped, reason: reason.charAt(0).toUpperCase() + reason.slice(1) + "." };
}
