import "server-only";
import { z } from "zod";
import { evidenceItemSchema } from "@/lib/cv/schema";
import { normalizeForMatch, similarity } from "@/lib/cv/text";
import { AppError } from "@/lib/errors";
import { checkClaim } from "@/lib/evidence/validate";
import {
  categoryFor,
  coreSkillCoverage,
  DEFAULT_SENIORITY_BANDS,
  seniorityFor,
  type RoleCategory,
  type SeniorityBand,
} from "@/lib/roles/categorize";
import type { RoleSuggestInput } from "@/lib/roles/suggest-heuristic";
import { buildSkillIndex, matchSkill } from "@/lib/skills/normalize";
import { ai } from "@/server/ai/runner";
import { roleSuggesterFacts, suggestRolesWithAi } from "@/server/ai/role-suggester";
import { getCareerProfile } from "@/server/repositories/profile";
import { getDefaultResume } from "@/server/repositories/resumes";
import { listSkillCatalogue, listSkillImplicationIds, listUserSkills } from "@/server/repositories/skills";
import {
  createTargetRole,
  listRoleFamilies,
  listTargetRoles,
  replaceSuggestedRoles,
  setSelectedRoles,
  type TargetRoleInput,
} from "@/server/repositories/target-roles";

const MAX_ROLES = 10;
const MAX_VARIANTS = 6;
const MAX_KEYWORDS = 10;
/** Evidence the suggester reads: the parts of the CV that show work, not personal details. */
const EVIDENCE_KINDS = new Set([
  "experience_bullet",
  "project_bullet",
  "project_description",
  "technologies",
  "skills",
  "summary",
  "certification",
]);

const bandsSchema = z
  .array(z.object({ level: z.string(), minYears: z.number(), maxYears: z.number() }))
  .catch(DEFAULT_SENIORITY_BANDS);

const unique = (items: string[]) => {
  const seen = new Set<string>();
  return items.map((s) => s.trim()).filter((s) => s && !seen.has(s.toLowerCase()) && seen.add(s.toLowerCase()));
};

type Family = Awaited<ReturnType<typeof listRoleFamilies>>[number];

/** The catalog family a title belongs to: an exact or near match with its name or one of its title variants. */
function familyForTitle(families: Family[], title: string): Family | null {
  const t = normalizeForMatch(title);
  let best: { family: Family; score: number } | null = null;
  for (const family of families) {
    for (const name of [family.name, ...family.titleVariants]) {
      const score = similarity(t, normalizeForMatch(name));
      if (!best || score > best.score) best = { family, score };
    }
  }
  return best && best.score >= 0.85 ? best.family : null;
}

async function loadContext(userId: string) {
  const [resume, profile, userSkills, families, catalogue, implications] = await Promise.all([
    getDefaultResume(userId),
    getCareerProfile(userId),
    listUserSkills(userId),
    listRoleFamilies(),
    listSkillCatalogue(userId),
    listSkillImplicationIds(userId),
  ]);
  return { resume, profile, userSkills, families, catalogue, implications };
}

type Context = Awaited<ReturnType<typeof loadContext>>;

/** Category, coverage and seniority for one role, computed from the user's current skills and years. */
function assess(context: Context, role: { roleFamilyId: string | null; keywords: string[] }) {
  const family = role.roleFamilyId ? context.families.find((f) => f.id === role.roleFamilyId) : undefined;
  // Roles outside the catalog are measured against the keywords that are known skills.
  const index = buildSkillIndex(context.catalogue);
  const core = family
    ? family.coreSkills.map((c) => ({ id: c.skill.id, name: c.skill.name }))
    : role.keywords.flatMap((k) => {
        const skill = matchSkill(index, k);
        return skill ? [{ id: skill.id, name: skill.name }] : [];
      });
  const coverage = coreSkillCoverage(core, context.userSkills, context.implications);
  const bands = family ? bandsSchema.parse(family.seniorityBands) : DEFAULT_SENIORITY_BANDS;
  return {
    coverage,
    category: categoryFor(coverage.share) as RoleCategory,
    seniority: seniorityFor(context.profile?.yearsExperience ?? null, bands as SeniorityBand[]),
  };
}

function suggestInput(context: Context): RoleSuggestInput {
  const evidence = evidenceItemSchema
    .array()
    .catch([])
    .parse(context.resume?.evidence ?? [])
    .filter((e) => EVIDENCE_KINDS.has(e.kind))
    .slice(0, 80)
    .map((e) => ({ id: e.id, kind: e.kind, text: e.text.slice(0, 400) }));
  return {
    years: context.profile?.yearsExperience ?? null,
    headline: context.profile?.headline ?? null,
    domains: context.profile?.domains ?? [],
    skills: context.userSkills.slice(0, 40).map((s) => ({ name: s.skill.name, proficiency: s.proficiency })),
    evidence,
    families: context.families.map((f) => ({
      slug: f.slug,
      name: f.name,
      titleVariants: f.titleVariants,
      coreSkills: f.coreSkills.map((c) => c.skill.name),
    })),
  };
}

/**
 * Suggest roles (SPEC §10.1): the AI proposes, code checks. Unknown slugs are matched by title, duplicates dropped,
 * reasons checked against the evidence catalog, and earlier unselected suggestions replaced. If nothing is selected
 * yet, the Core roles (up to three) are selected so a first search has something to use.
 */
export async function suggestTargetRoles(userId: string) {
  const context = await loadContext(userId);
  if (!context.resume) throw new AppError("VALIDATION", { message: "Upload and confirm your CV first." });

  const input = suggestInput(context);
  const result = await suggestRolesWithAi(ai, input, userId);
  const catalog = new Map(input.evidence.map((e) => [e.id, e]));
  const facts = roleSuggesterFacts(input);

  const existing = await listTargetRoles(userId);
  const kept = existing.filter((r) => r.source === "user" || r.selected);
  const keyOf = (familyId: string | null, title: string) => familyId ?? normalizeForMatch(title);
  const seen = new Set(kept.map((r) => keyOf(r.roleFamilyId, r.title)));

  const roles: TargetRoleInput[] = [];
  for (const suggestion of result.roles) {
    const family =
      context.families.find((f) => f.slug === suggestion.roleFamilySlug) ??
      familyForTitle(context.families, suggestion.title);
    const key = keyOf(family?.id ?? null, suggestion.title);
    if (seen.has(key) || roles.length + kept.length >= MAX_ROLES) continue;
    seen.add(key);
    const check = checkClaim(suggestion.fitReason, suggestion.evidenceIds, catalog, facts);
    roles.push({
      roleFamilyId: family?.id ?? null,
      title: suggestion.title.trim(),
      reason: suggestion.fitReason.trim(),
      reasonVerified: check.verified,
      evidenceIds: check.evidenceIds,
      titleVariants: unique([suggestion.title, ...suggestion.titleVariants]).slice(0, MAX_VARIANTS),
      keywords: unique(suggestion.keywords).slice(0, MAX_KEYWORDS),
      source: result.mode === "no_ai" ? "no_ai" : "ai",
      selected: false,
    });
  }
  await replaceSuggestedRoles(userId, roles);

  if (!kept.some((r) => r.selected)) {
    const saved = await listTargetRoles(userId);
    const core = saved
      .filter((r) => assess(context, r).category === "core")
      .slice(0, 3)
      .map((r) => r.id);
    if (core.length) await setSelectedRoles(userId, core);
  }
  return { added: roles.length, mode: result.mode, provider: result.provider };
}

/** A role the user types in. Catalog roles get their title variants and core skills as keywords. */
export async function addCustomRole(userId: string, title: string) {
  const families = await listRoleFamilies();
  const family = familyForTitle(families, title);
  return createTargetRole(userId, {
    roleFamilyId: family?.id ?? null,
    title: title.trim(),
    reason: null,
    reasonVerified: true,
    evidenceIds: [],
    titleVariants: unique([title, ...(family?.titleVariants ?? [])]).slice(0, MAX_VARIANTS),
    keywords: family ? family.coreSkills.map((c) => c.skill.name).slice(0, MAX_KEYWORDS) : [],
    source: "user",
    selected: true,
  });
}

export type TargetRoleView = {
  id: string;
  roleFamilyId: string | null;
  title: string;
  familyName: string | null;
  category: RoleCategory;
  seniority: string;
  coverage: { held: string[]; missing: string[]; total: number };
  reason: string | null;
  reasonVerified: boolean;
  evidence: { id: string; text: string }[];
  titleVariants: string[];
  keywords: string[];
  source: "ai" | "no_ai" | "user";
  selected: boolean;
};

/** Target roles for the page, with category, coverage and seniority computed now and evidence quotes attached. */
export async function listTargetRolesView(userId: string): Promise<{ roles: TargetRoleView[]; hasCv: boolean }> {
  const [context, roles] = await Promise.all([loadContext(userId), listTargetRoles(userId)]);
  const catalog = new Map(
    evidenceItemSchema
      .array()
      .catch([])
      .parse(context.resume?.evidence ?? [])
      .map((e) => [e.id, e.text]),
  );
  return {
    hasCv: Boolean(context.resume),
    roles: roles.map((role) => {
      const { coverage, category, seniority } = assess(context, role);
      return {
        id: role.id,
        roleFamilyId: role.roleFamilyId,
        title: role.title,
        familyName: role.roleFamily?.name ?? null,
        category,
        seniority,
        coverage: { held: coverage.held, missing: coverage.missing, total: coverage.total },
        reason: role.reason,
        reasonVerified: role.reasonVerified,
        evidence: role.evidenceIds.flatMap((id) => (catalog.has(id) ? [{ id, text: catalog.get(id)! }] : [])),
        titleVariants: role.titleVariants,
        keywords: role.keywords,
        source: (role.source === "user" || role.source === "no_ai" ? role.source : "ai") as TargetRoleView["source"],
        selected: role.selected,
      };
    }),
  };
}
