// Fit score (SPEC §12.2), computed in code from a job's requirements and the user's profile. Each component has
// a reason; an unknown input scores a fixed middle value and is flagged. Blockers, the recommendation and score gains
// are derived from the same numbers. AI explains these results later; it never changes them.
import { normalizeForMatch, similarity } from "@/lib/cv/text";
import { formatLpa } from "@/lib/format";
import type { Conditions } from "@/lib/jobs/conditions";
import type { ComponentKey, ScoringConfigValues } from "./config";

export type Importance = "required" | "preferred" | "nice_to_have" | "implied";

/** How much a skill requirement counts in the skills component. */
export const IMPORTANCE_WEIGHT: Record<Importance, number> = {
  required: 3,
  preferred: 1.5,
  implied: 1,
  nice_to_have: 0.5,
};

/** Raw points of the non-skill components, on the spec's default scale (scaled to the configured maximum). */
const RAW = {
  experience: { max: 20, inRange: 20, belowOne: 12, belowTwo: 6, over: 14, unknown: 14 },
  roleAlignment: { max: 15, target: 15, adjacent: 8, noTargets: 8 },
  location: { max: 10, match: 10, partial: 5, unknown: 6 },
  salary: { max: 10, overlap: 10, near: 5, unknown: 6 },
};

/** A related skill held at this level or above gives half credit. */
const RELATED_MIN_LEVEL = 3;
/** "Too senior" blocker: the job asks this many years more than the user has. */
const EXPERIENCE_BLOCKER_GAP = 2;
/** "Missing must-haves" blocker. */
const MISSING_REQUIRED_BLOCKER = 2;

export type FitRequirement = {
  reqId: string;
  kind: string;
  importance: Importance;
  skillId: string | null;
  skillName: string | null;
  yearsRequired: number | null;
  text: string;
};

export type FitProfile = {
  years: number | null;
  /** skillId → the user's level (1–5) and years with it. */
  skills: Map<string, { name: string; proficiency: number; years: number | null }>;
  /** skillId → skills that imply it (Next.js implies React). */
  implies: Map<string, string[]>;
  /** skillId → related skills, both directions (Redux ↔ Zustand). */
  related: Map<string, string[]>;
  targetFamilyIds: string[];
  adjacentFamilyIds: string[];
  /** Titles and title variants of the user's target roles (for roles outside the catalogue). */
  targetTitles: string[];
  /** Canonical cities ("Bengaluru", "Remote-India"). */
  locations: string[];
  workModes: string[];
  openToRelocate: boolean;
  expectedSalaryMin: number | null;
  noticePeriodDays: number | null;
  dealbreakers: { bond: boolean; nightShift: boolean; contractToHire: boolean; maxWfoDaysPerWeek: number | null };
};

export type FitJob = {
  title: string;
  roleFamilyId: string | null;
  expMinYears: number | null;
  expMaxYears: number | null;
  city: string | null;
  workMode: string | null;
  salaryMinAnnual: number | null;
  salaryMaxAnnual: number | null;
  salaryDisclosed: boolean;
  conditions: Conditions;
};

export type RequirementStatus = "strong" | "partial" | "missing" | "unscored";

export type RequirementAssessment = {
  reqId: string;
  status: RequirementStatus;
  /** 0, 0.5 or 1 for skills; null when code can't judge it (FitAnalyst assesses those with CV evidence). */
  match: number | null;
  /** "semantic": FitAnalyst showed the skill in the CV under another name and code accepted it (AI inference). */
  via: "direct" | "implied" | "related" | "semantic" | null;
  reason: string;
};

export type FitComponent = { key: ComponentKey; max: number; points: number; reason: string; flagged: boolean };

export type ConditionCheck = {
  key: "notice" | "bond" | "shift" | "contract" | "wfo";
  status: "ok" | "warning" | "blocker";
  message: string;
};

export type Blocker = { kind: "experience" | "skills" | "notice" | "dealbreaker"; message: string };
export type Recommendation = "APPLY" | "CONSIDER" | "LOW_PRIORITY";
export type ScoreGain = { skillName: string; reqIds: string[]; points: number };

export type FitScore = {
  total: number;
  components: FitComponent[];
  requirements: RequirementAssessment[];
  conditions: ConditionCheck[];
  blockers: Blocker[];
  recommendation: Recommendation;
  gains: ScoreGain[];
};

const years = (n: number) => String(Math.round(n * 10) / 10);
const levelMatch = (level: number) => (level >= 3 ? 1 : level === 2 ? 0.5 : 0);

/** How well the user covers one skill requirement: directly, through a skill that implies it, or a related one. */
export function assessSkill(req: FitRequirement, profile: FitProfile): RequirementAssessment {
  const name = req.skillName ?? req.text;
  if (!req.skillId) {
    return { reqId: req.reqId, status: "missing", match: 0, via: null, reason: `${name} is not among your skills.` };
  }
  const direct = profile.skills.get(req.skillId);
  let level = direct?.proficiency ?? 0;
  let skillYears = direct?.years ?? null;
  let via: RequirementAssessment["via"] = direct ? "direct" : null;
  let source = direct?.name ?? name;
  for (const fromId of profile.implies.get(req.skillId) ?? []) {
    const implying = profile.skills.get(fromId);
    if (implying && implying.proficiency > level) {
      level = implying.proficiency;
      skillYears = implying.years;
      via = "implied";
      source = implying.name;
    }
  }
  let match = levelMatch(level);
  let reason =
    match === 0
      ? level
        ? `${name} at level ${level}; level 2+ counts.`
        : `${name} is not among your skills.`
      : via === "implied"
        ? `${source} (level ${level}) implies ${name}.`
        : `${name} at level ${level}.`;
  // Fewer years than the posting asks drops one level (only when the user's years with the skill are known).
  if (match > 0 && req.yearsRequired !== null && skillYears !== null && skillYears < req.yearsRequired) {
    match = match === 1 ? 0.5 : 0;
    reason = `${reason.slice(0, -1)}, ${years(skillYears)} of ${years(req.yearsRequired)} years asked.`;
  }
  if (match < 0.5) {
    const related = (profile.related.get(req.skillId) ?? [])
      .map((id) => profile.skills.get(id))
      .find((s) => s && s.proficiency >= RELATED_MIN_LEVEL);
    if (related) {
      match = 0.5;
      via = "related";
      reason = `Related: ${related.name} (level ${related.proficiency}).`;
    }
  }
  return {
    reqId: req.reqId,
    status: match === 1 ? "strong" : match === 0.5 ? "partial" : "missing",
    match,
    via: match > 0 ? via : null,
    reason,
  };
}

function assessOther(req: FitRequirement, profile: FitProfile): RequirementAssessment {
  if (req.kind === "experience" && req.yearsRequired !== null && profile.years !== null) {
    const gap = req.yearsRequired - profile.years;
    return {
      reqId: req.reqId,
      status: gap <= 0 ? "strong" : gap <= 1 ? "partial" : "missing",
      match: null,
      via: null,
      reason: `Asks ${years(req.yearsRequired)}+ years; you have ${years(profile.years)}.`,
    };
  }
  return {
    reqId: req.reqId,
    status: "unscored",
    match: null,
    via: null,
    reason: "Assessed against your CV in the report.",
  };
}

function skillsComponent(reqs: FitRequirement[], assessed: Map<string, RequirementAssessment>, max: number) {
  const skillReqs = reqs.filter((r) => r.kind === "skill");
  if (!skillReqs.length) {
    return { points: max * 0.5, reason: "The posting names no skills we could match.", flagged: true };
  }
  let weighted = 0;
  let total = 0;
  for (const req of skillReqs) {
    const w = IMPORTANCE_WEIGHT[req.importance];
    weighted += w * (assessed.get(req.reqId)?.match ?? 0);
    total += w;
  }
  const count = (status: RequirementStatus) => skillReqs.filter((r) => assessed.get(r.reqId)?.status === status).length;
  const required = skillReqs.filter((r) => r.importance === "required");
  const requiredStrong = required.filter((r) => assessed.get(r.reqId)?.status === "strong").length;
  return {
    points: (weighted / total) * max,
    reason: `${count("strong")} strong, ${count("partial")} partial, ${count("missing")} missing of ${skillReqs.length} skills${required.length ? ` (required: ${requiredStrong} of ${required.length} strong)` : ""}.`,
    flagged: false,
  };
}

function experienceComponent(job: FitJob, profile: FitProfile) {
  const r = RAW.experience;
  const y = profile.years;
  const { expMinYears: min, expMaxYears: max } = job;
  if (y === null) return { raw: r.unknown, reason: "Your years of experience are unknown.", flagged: true };
  if (min === null && max === null)
    return { raw: r.unknown, reason: "The posting states no experience.", flagged: true };
  if (min !== null && y < min) {
    const gap = min - y;
    return {
      raw: gap <= 1 ? r.belowOne : gap <= 2 ? r.belowTwo : 0,
      reason: `Asks ${years(min)}+ years; you have ${years(y)}.`,
      flagged: false,
    };
  }
  if (max !== null && y > max + 3) {
    return { raw: r.over, reason: `For up to ${years(max)} years; you have ${years(y)}.`, flagged: false };
  }
  const range =
    min !== null && max !== null
      ? `${years(min)}–${years(max)}`
      : min !== null
        ? `${years(min)}+`
        : `up to ${years(max!)}`;
  return { raw: r.inRange, reason: `Asks ${range} years; you have ${years(y)}.`, flagged: false };
}

function roleComponent(job: FitJob, profile: FitProfile) {
  const r = RAW.roleAlignment;
  const title = normalizeForMatch(job.title);
  if (job.roleFamilyId && profile.targetFamilyIds.includes(job.roleFamilyId)) {
    return { raw: r.target, reason: "One of your target roles.", flagged: false };
  }
  if (profile.targetTitles.some((t) => similarity(title, normalizeForMatch(t)) >= 0.85)) {
    return { raw: r.target, reason: "The title matches one of your target roles.", flagged: false };
  }
  if (job.roleFamilyId && profile.adjacentFamilyIds.includes(job.roleFamilyId)) {
    return { raw: r.adjacent, reason: "Adjacent to your target roles.", flagged: false };
  }
  if (!profile.targetFamilyIds.length && !profile.targetTitles.length) {
    return { raw: r.noTargets, reason: "You have no target roles yet.", flagged: true };
  }
  return { raw: 0, reason: "Not one of your target roles.", flagged: false };
}

function locationComponent(job: FitJob, profile: FitProfile) {
  const r = RAW.location;
  const remote = job.workMode === "remote" || job.city === "Remote-India";
  const acceptsRemote = !profile.workModes.length || profile.workModes.includes("remote");
  const city: "match" | "relocate" | "mismatch" | "unknown" = remote
    ? acceptsRemote
      ? "match"
      : "mismatch"
    : !job.city || !profile.locations.length
      ? "unknown"
      : profile.locations.includes(job.city)
        ? "match"
        : profile.openToRelocate
          ? "relocate"
          : "mismatch";
  const mode: "match" | "mismatch" | "unknown" =
    !job.workMode || !profile.workModes.length
      ? "unknown"
      : profile.workModes.includes(job.workMode)
        ? "match"
        : "mismatch";
  const where = remote ? "Remote" : (job.city ?? "Location not stated");
  const how = job.workMode && !remote ? `, ${job.workMode}` : "";
  if (city === "mismatch")
    return { raw: 0, reason: `${where}${how}: outside your locations or work modes.`, flagged: false };
  if (city === "unknown" && mode !== "match") return { raw: r.unknown, reason: `${where}${how}.`, flagged: true };
  if (city === "match" && mode !== "mismatch")
    return { raw: r.match, reason: `${where}${how}: matches your preferences.`, flagged: false };
  if (city === "relocate")
    return { raw: r.partial, reason: `${where}${how}: you are open to relocating.`, flagged: false };
  if (city === "unknown")
    return { raw: r.unknown, reason: `${where}${how}: work mode matches; city unknown.`, flagged: true };
  return { raw: r.partial, reason: `${where}${how}: the city fits but not the work mode.`, flagged: false };
}

function salaryComponent(job: FitJob, profile: FitProfile) {
  const r = RAW.salary;
  const top = job.salaryMaxAnnual ?? job.salaryMinAnnual;
  if (!job.salaryDisclosed || top === null) return { raw: r.unknown, reason: "Salary not disclosed.", flagged: true };
  const expected = profile.expectedSalaryMin;
  if (expected === null) return { raw: r.unknown, reason: "Set your expected salary to compare.", flagged: true };
  const offered = `Up to ${formatLpa(top)}; you expect ${formatLpa(expected)}+.`;
  if (top >= expected) return { raw: r.overlap, reason: offered, flagged: false };
  if (top >= expected * 0.85) return { raw: r.near, reason: `${offered} Within 15% below.`, flagged: false };
  return { raw: 0, reason: `${offered} More than 15% below.`, flagged: false };
}

/** Conditions the posting states, checked against the user's notice period and dealbreakers. */
export function checkConditions(job: FitJob, profile: FitProfile): ConditionCheck[] {
  const c = job.conditions;
  const d = profile.dealbreakers;
  const checks: ConditionCheck[] = [];
  if (c.noticePeriodMaxDays !== null) {
    const wants = c.immediateJoiner ? "Wants immediate joiners" : `Wants joiners within ${c.noticePeriodMaxDays} days`;
    if (profile.noticePeriodDays === null) {
      checks.push({ key: "notice", status: "warning", message: `${wants}; set your notice period to check.` });
    } else if (profile.noticePeriodDays > c.noticePeriodMaxDays) {
      checks.push({
        key: "notice",
        status: "blocker",
        message: `${wants}; your notice is ${profile.noticePeriodDays} days.`,
      });
    } else {
      checks.push({
        key: "notice",
        status: "ok",
        message: `${wants}; your notice of ${profile.noticePeriodDays} days fits.`,
      });
    }
  }
  if (c.bond) checks.push({ key: "bond", status: d.bond ? "blocker" : "warning", message: "Service bond." });
  if (c.shift === "night") {
    checks.push({ key: "shift", status: d.nightShift ? "blocker" : "warning", message: "Night or rotational shifts." });
  }
  if (c.contractToHire) {
    checks.push({ key: "contract", status: d.contractToHire ? "blocker" : "warning", message: "Contract-to-hire." });
  }
  if (c.wfoDaysPerWeek !== null) {
    const over = d.maxWfoDaysPerWeek !== null && c.wfoDaysPerWeek > d.maxWfoDaysPerWeek;
    checks.push({
      key: "wfo",
      status: over ? "blocker" : "ok",
      message: `Office ${c.wfoDaysPerWeek} days a week${over ? ` (you accept ${d.maxWfoDaysPerWeek})` : ""}.`,
    });
  }
  return checks;
}

export function recommend(total: number, blockers: number, config: ScoringConfigValues): Recommendation {
  const { apply, consider } = config.thresholds;
  if (total >= apply && blockers === 0) return "APPLY";
  // A blocker costs one level: a top score with one blocker is still worth considering; a middle score is not.
  if ((total >= consider && blockers === 0) || (total >= apply && blockers === 1)) return "CONSIDER";
  return "LOW_PRIORITY";
}

/** Skill assessment with accepted semantic matches applied: a skill code found missing counts half (SPEC §12.2). */
function assessWithSemantic(req: FitRequirement, profile: FitProfile, semantic: ReadonlySet<string>) {
  const assessed = assessSkill(req, profile);
  if (assessed.status !== "missing" || !semantic.has(req.reqId)) return assessed;
  return {
    ...assessed,
    status: "partial" as const,
    match: 0.5,
    via: "semantic" as const,
    reason: "The report found it in your CV under another name (AI inference).",
  };
}

export function scoreFit(
  requirements: FitRequirement[],
  job: FitJob,
  profile: FitProfile,
  config: ScoringConfigValues,
  semanticMatches: ReadonlySet<string> = new Set(),
): FitScore {
  const assess = (req: FitRequirement, p: FitProfile) =>
    req.kind === "skill" ? assessWithSemantic(req, p, semanticMatches) : assessOther(req, p);
  const assessed = new Map(requirements.map((req) => [req.reqId, assess(req, profile)]));
  const w = config.weights;
  const skills = skillsComponent(requirements, assessed, w.skills);
  const scaled = (part: { raw: number; reason: string; flagged: boolean }, key: Exclude<ComponentKey, "skills">) => ({
    key,
    max: w[key],
    points: (part.raw / RAW[key].max) * w[key],
    reason: part.reason,
    flagged: part.flagged,
  });
  const components: FitComponent[] = [
    { key: "skills", max: w.skills, ...skills },
    scaled(experienceComponent(job, profile), "experience"),
    scaled(roleComponent(job, profile), "roleAlignment"),
    scaled(locationComponent(job, profile), "location"),
    scaled(salaryComponent(job, profile), "salary"),
  ];
  const total = Math.round(components.reduce((sum, c) => sum + c.points, 0));

  const conditions = checkConditions(job, profile);
  const blockers: Blocker[] = [];
  if (job.expMinYears !== null && profile.years !== null && job.expMinYears > profile.years + EXPERIENCE_BLOCKER_GAP) {
    blockers.push({
      kind: "experience",
      message: `Asks ${years(job.expMinYears)}+ years; you have ${years(profile.years)}.`,
    });
  }
  const missingRequired = requirements.filter(
    (r) => r.kind === "skill" && r.importance === "required" && assessed.get(r.reqId)?.status === "missing",
  );
  if (missingRequired.length >= MISSING_REQUIRED_BLOCKER) {
    blockers.push({
      kind: "skills",
      message: `Missing ${missingRequired.length} required skills: ${missingRequired.map((r) => r.skillName ?? r.text).join(", ")}.`,
    });
  }
  for (const check of conditions.filter((c) => c.status === "blocker")) {
    blockers.push({ kind: check.key === "notice" ? "notice" : "dealbreaker", message: check.message });
  }

  // Score gains: each skill not yet strong, re-scored as if held at level 3 (other components don't change).
  const skillPoints = components[0].points;
  const gainsBySkill = new Map<string, ScoreGain>();
  for (const req of requirements) {
    if (req.kind !== "skill" || !req.skillId || assessed.get(req.reqId)?.status === "strong") continue;
    if (gainsBySkill.has(req.skillId)) {
      gainsBySkill.get(req.skillId)!.reqIds.push(req.reqId);
      continue;
    }
    const name = req.skillName ?? req.text;
    const learned: FitProfile = {
      ...profile,
      skills: new Map([...profile.skills, [req.skillId, { name, proficiency: 3, years: null }]]),
    };
    const relearned = new Map(
      requirements.map((r) => [r.reqId, r.kind === "skill" ? assess(r, learned) : assessed.get(r.reqId)!]),
    );
    const points = Math.round(skillsComponent(requirements, relearned, w.skills).points - skillPoints);
    if (points >= 1) gainsBySkill.set(req.skillId, { skillName: name, reqIds: [req.reqId], points });
  }

  return {
    total,
    components,
    requirements: requirements.map((r) => assessed.get(r.reqId)!),
    conditions,
    blockers,
    recommendation: recommend(total, blockers.length, config),
    gains: [...gainsBySkill.values()].sort((a, b) => b.points - a.points),
  };
}
