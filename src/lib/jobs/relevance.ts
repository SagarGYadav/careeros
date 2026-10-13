// Relevance ranking, "quick match" (SPEC §10.5): computed in code for every job, free. Each part has a weight, a
// value from 0 to 1 and a plain reason. Unknown inputs are neutral (0.5) and flagged; when the semantic part is
// unavailable its weight is spread over the other parts. "Not a fit" reasons (SPEC §10.2) are separate: they hide
// a job by default but never change its score.
import { mentionsSkill, skillKeysIn } from "@/lib/cv/evidence";
import { similarity } from "@/lib/cv/text";
import { formatLpa } from "@/lib/format";
import { skillKey } from "@/lib/skills/normalize";
import type { Conditions } from "./conditions";
import { titleKey } from "./dedupe";

export type PartKey = "skills" | "semantic" | "title" | "experience" | "location" | "salary";

export const WEIGHTS: Record<PartKey, number> = {
  skills: 30,
  semantic: 20,
  title: 20,
  experience: 15,
  location: 10,
  salary: 5,
};

export type ScorePart = {
  key: PartKey;
  /** Weight after redistribution (sums to 100 over the parts used). */
  weight: number;
  /** 0–1, or null when the part could not be computed (semantic pending). */
  value: number | null;
  points: number;
  reason: string;
  /** The input was unknown, so the part counts as neutral. */
  neutral?: boolean;
};

export type RankingProfile = {
  years: number | null;
  /** The user's skills with proficiency 1–5; implied skills already added by the caller. */
  skills: { name: string; proficiency: number }[];
  /** Title variants of the selected target roles. */
  titleVariants: string[];
  /** Canonical cities ("Bengaluru", "Remote-India"). */
  locations: string[];
  workModes: string[];
  openToRelocate: boolean;
  expectedSalaryMin: number | null;
  noticePeriodDays: number | null;
  dealbreakers: { bond: boolean; nightShift: boolean; contractToHire: boolean; maxWfoDaysPerWeek: number | null };
};

export type RankingJob = {
  title: string;
  description: string;
  city: string | null;
  workMode: string | null;
  salaryMinAnnual: number | null;
  salaryMaxAnnual: number | null;
  salaryDisclosed: boolean;
  salaryCurrency: string | null;
  expMinYears: number | null;
  expMaxYears: number | null;
  seniority: string | null;
  conditions: Conditions;
  /** Cosine similarity with the profile, or null while the job is not embedded yet. */
  semantic: number | null;
};

export type Relevance = {
  score: number;
  parts: ScorePart[];
  notFit: string[];
  jobSkills: string[];
  missingSkills: string[];
};

const clamp = (n: number) => Math.max(0, Math.min(1, n));
const years = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

function skillsPart(job: RankingJob, profile: RankingProfile, catalogue: string[]) {
  const keys = skillKeysIn(`${job.title}\n${job.description}`);
  const jobSkills = [...new Set(catalogue.filter((name) => mentionsSkill(keys, name)))];
  if (!jobSkills.length)
    return { value: 0.5, neutral: true, reason: "The posting names no skills we know.", jobSkills, missing: [] };
  const held = new Map(profile.skills.map((s) => [skillKey(s.name), s.proficiency]));
  const levelOf = (name: string) => held.get(skillKey(name)) ?? 0;
  const value = jobSkills.reduce((sum, name) => sum + Math.min(1, levelOf(name) / 3), 0) / jobSkills.length;
  const have = jobSkills.filter((name) => levelOf(name) > 0);
  const missing = jobSkills.filter((name) => levelOf(name) === 0);
  const reason = `You have ${have.length} of ${jobSkills.length} skills it names${have.length ? ` (${have.slice(0, 4).join(", ")})` : ""}${missing.length ? `; missing ${missing.slice(0, 3).join(", ")}` : ""}.`;
  return { value: clamp(value), neutral: false, reason, jobSkills, missing };
}

function titlePart(job: RankingJob, profile: RankingProfile) {
  if (!profile.titleVariants.length) return { value: 0.5, neutral: true, reason: "No target roles selected." };
  const jobTitle = titleKey(job.title);
  const jobWords = new Set(jobTitle.split(" "));
  let best = { score: 0, variant: "" };
  for (const variant of profile.titleVariants) {
    const v = titleKey(variant);
    const words = v.split(" ").filter(Boolean);
    const covered = words.filter((w) => jobWords.has(w)).length / Math.max(1, words.length);
    const score = Math.max(similarity(jobTitle, v), covered);
    if (score > best.score) best = { score, variant };
  }
  return {
    value: clamp(best.score),
    neutral: false,
    reason:
      best.score >= 0.8
        ? `Title matches “${best.variant}”.`
        : best.score >= 0.5
          ? `Title is close to “${best.variant}”.`
          : "Title differs from your target roles.",
  };
}

function experiencePart(job: RankingJob, profile: RankingProfile) {
  const { expMinYears: min, expMaxYears: max } = job;
  if (min === null && max === null) return { value: 0.5, neutral: true, reason: "Experience isn't stated." };
  if (profile.years === null)
    return { value: 0.5, neutral: true, reason: "Your years of experience aren't known yet." };
  const y = profile.years;
  const asks =
    max !== null && min !== null
      ? `${years(min)}–${years(max)}`
      : min !== null
        ? `${years(min)}+`
        : `up to ${years(max!)}`;
  let value = 1;
  if (min !== null && y < min) value = 1 - (min - y) / 3;
  else if (max !== null && y > max) value = Math.max(0.3, 1 - (y - max) / 6);
  return { value: clamp(value), neutral: false, reason: `Asks ${asks} years; you have ${years(y)}.` };
}

function locationPart(job: RankingJob, profile: RankingProfile) {
  const remoteJob = job.workMode === "remote" || job.city === "Remote-India";
  const wantsRemote = profile.workModes.includes("remote") || profile.locations.includes("Remote-India");
  if (!profile.locations.length && !profile.workModes.length) {
    return { value: 0.5, neutral: true, reason: "No location preferences set." };
  }
  if (remoteJob)
    return wantsRemote
      ? { value: 1, neutral: false, reason: "Remote, as you prefer." }
      : { value: 0.6, neutral: false, reason: "Remote role (not in your work modes)." };
  if (!job.city) return { value: 0.5, neutral: true, reason: "Location isn't stated." };
  const inCity = profile.locations.includes(job.city);
  const modeOk = !job.workMode || !profile.workModes.length || profile.workModes.includes(job.workMode);
  if (inCity && modeOk) return { value: 1, neutral: false, reason: `In ${job.city}, one of your locations.` };
  if (inCity)
    return { value: 0.6, neutral: false, reason: `In ${job.city}, but ${job.workMode} (not one of your work modes).` };
  if (profile.openToRelocate)
    return { value: 0.5, neutral: false, reason: `In ${job.city}; you're open to relocating.` };
  return { value: 0.1, neutral: false, reason: `In ${job.city}, outside your locations.` };
}

function salaryPart(job: RankingJob, profile: RankingProfile) {
  if (!job.salaryDisclosed || job.salaryMaxAnnual === null)
    return { value: 0.5, neutral: true, reason: "Salary not disclosed." };
  if (job.salaryCurrency && job.salaryCurrency !== "INR")
    return { value: 0.5, neutral: true, reason: `Salary in ${job.salaryCurrency}.` };
  const pays = `up to ${formatLpa(job.salaryMaxAnnual)}`;
  if (!profile.expectedSalaryMin)
    return { value: 0.5, neutral: true, reason: `Pays ${pays}; set your expected salary to compare.` };
  const value = clamp(job.salaryMaxAnnual / profile.expectedSalaryMin);
  return { value, neutral: false, reason: `Pays ${pays}; you expect ${formatLpa(profile.expectedSalaryMin)}+.` };
}

function semanticPart(job: RankingJob) {
  if (job.semantic === null) return { value: null, neutral: true, reason: "Not compared with your profile yet." };
  // bge-small: ~0.55 = unrelated text, ~0.85 = the same kind of job.
  const value = clamp((job.semantic - 0.55) / 0.3);
  const reason =
    value >= 0.7
      ? "Description is very close to your profile."
      : value >= 0.4
        ? "Description is fairly close to your profile."
        : "Description is not close to your profile.";
  return { value, neutral: false, reason };
}

/** Reasons to hide a job as "Not a fit" (seniority, location, dealbreakers). The score is unaffected. */
export function notFitReasons(job: RankingJob, profile: RankingProfile): string[] {
  const reasons: string[] = [];
  const y = profile.years;
  if (y !== null) {
    if (job.expMinYears !== null && job.expMinYears >= y + 4)
      reasons.push(`Asks ${years(job.expMinYears)}+ years; you have ${years(y)}.`);
    else if (job.seniority === "lead" && y < 5) reasons.push("Lead-level role.");
    if (job.expMaxYears !== null && job.expMaxYears <= y - 5)
      reasons.push(`For up to ${years(job.expMaxYears)} years of experience.`);
    else if ((job.seniority === "intern" && y >= 1) || (job.seniority === "junior" && y >= 4))
      reasons.push("Junior or intern role.");
  }
  const remoteJob = job.workMode === "remote" || job.city === "Remote-India";
  if (
    profile.locations.length &&
    job.city &&
    !remoteJob &&
    !profile.locations.includes(job.city) &&
    !profile.openToRelocate
  ) {
    reasons.push(`In ${job.city}, outside your locations.`);
  }
  const c = job.conditions;
  const d = profile.dealbreakers;
  if (d.bond && c.bond) reasons.push("Service bond.");
  if (d.nightShift && c.shift === "night") reasons.push("Night or rotational shifts.");
  if (d.contractToHire && c.contractToHire) reasons.push("Contract-to-hire.");
  if (d.maxWfoDaysPerWeek !== null && c.wfoDaysPerWeek !== null && c.wfoDaysPerWeek > d.maxWfoDaysPerWeek) {
    reasons.push(`Office ${c.wfoDaysPerWeek} days a week (you accept ${d.maxWfoDaysPerWeek}).`);
  }
  if (
    profile.noticePeriodDays !== null &&
    c.noticePeriodMaxDays !== null &&
    profile.noticePeriodDays > c.noticePeriodMaxDays + 15
  ) {
    reasons.push(`Wants joiners within ${c.noticePeriodMaxDays} days; your notice is ${profile.noticePeriodDays}.`);
  }
  return reasons;
}

export function scoreJob(job: RankingJob, profile: RankingProfile, catalogue: string[]): Relevance {
  const skills = skillsPart(job, profile, catalogue);
  const computed: Record<PartKey, { value: number | null; neutral: boolean; reason: string }> = {
    skills,
    semantic: semanticPart(job),
    title: titlePart(job, profile),
    experience: experiencePart(job, profile),
    location: locationPart(job, profile),
    salary: salaryPart(job, profile),
  };
  // Without the semantic part, its weight is spread over the others in proportion.
  const used = (Object.keys(WEIGHTS) as PartKey[]).filter((k) => computed[k].value !== null);
  const usedWeight = used.reduce((sum, k) => sum + WEIGHTS[k], 0);
  const parts: ScorePart[] = (Object.keys(WEIGHTS) as PartKey[]).map((key) => {
    const { value, neutral, reason } = computed[key];
    const weight = value === null ? 0 : (WEIGHTS[key] * 100) / usedWeight;
    return {
      key,
      weight: Math.round(weight * 10) / 10,
      value,
      points: value === null ? 0 : weight * value,
      reason,
      ...(neutral && { neutral }),
    };
  });
  const score = Math.round(parts.reduce((sum, p) => sum + p.points, 0));
  return {
    score: Math.max(0, Math.min(100, score)),
    parts: parts.map((p) => ({ ...p, points: Math.round(p.points * 10) / 10 })),
    notFit: notFitReasons(job, profile),
    jobSkills: skills.jobSkills,
    missingSkills: skills.missing,
  };
}
