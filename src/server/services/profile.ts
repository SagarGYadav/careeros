import "server-only";
import { randomUUID } from "node:crypto";
import { currentYearMonth, monthsBetween } from "@/lib/cv/dates";
import { finalizeDraft, syncBulletEvidence } from "@/lib/cv/finalize";
import { parseCtcToAnnualInr, parseNoticePeriodDays, splitPreferredLocations } from "@/lib/cv/job-search";
import { skillUsage, suggestProficiency } from "@/lib/cv/proficiency";
import { cvDraftSchema, evidenceItemSchema, type CvDraft, type EvidenceItem } from "@/lib/cv/schema";
import { hasMetric } from "@/lib/cv/text";
import { computeExperienceTotals, groundingIndex } from "@/lib/cv/verify";
import { AppError } from "@/lib/errors";
import type { PreferencesInput } from "@/lib/validation/profile";
import { buildSkillIndex, matchSkill, skillKey } from "@/lib/skills/normalize";
import {
  getCareerProfile,
  replaceCertifications,
  replaceEducation,
  replaceExperience,
  replaceOtherSections,
  replaceProjects,
  runBatch,
  savePreferences,
  upsertCareerProfile,
  upsertPersonalDetails,
} from "@/server/repositories/profile";
import {
  confirmResumeStatements,
  getDefaultResume,
  getResumeVersion,
  updateResumeDraftStatement,
} from "@/server/repositories/resumes";
import {
  addSelfSkill,
  createUserOwnedSkills,
  deleteStaleCvSkills,
  listSkillCatalogue,
  listSkillImplications,
  listUserSkills,
  recordSkillHistory,
  upsertCvUserSkills,
  type UserSkillRow,
} from "@/server/repositories/skills";

const round1 = (n: number) => Math.round(n * 10) / 10;
const unique = <T>(items: T[]) => [...new Set(items)];

/** A URL-safe slug for a user-added skill: "C++" → "c-plus-plus", "Material UI" → "material-ui". */
export function skillSlug(name: string): string {
  const slug = name
    .normalize("NFKD")
    .toLowerCase()
    .replace(/\+/g, "-plus")
    .replace(/#/g, "-sharp")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || skillKey(name) || "skill";
}

/** The CV text with its page breaks (form feeds), as stored on the resume version. */
function cvSource(resume: { extractedText: string | null; pageCount: number | null }) {
  const text = resume.extractedText ?? "";
  return { text, pages: text.split("\f"), isPdf: resume.pageCount !== null };
}

/** Skills from a confirmed draft, matched to the catalogue, with usage-based proficiency suggestions. */
async function cvSkillRows(userId: string, draft: CvDraft, now: Date) {
  const [catalogue, implications] = await Promise.all([listSkillCatalogue(userId), listSkillImplications(userId)]);
  const index = buildSkillIndex(catalogue);
  const thisYear = Number(currentYearMonth(now).slice(0, 4));
  const newSkills: { id: string; slug: string; name: string }[] = [];
  const rows = new Map<string, UserSkillRow>();

  const candidates = [
    ...draft.skills.explicit.map((s) => ({ name: s.name, listed: true, evidenceIds: s.evidenceIds })),
    ...draft.skills.inferred.map((s) => ({ name: s.name, listed: false, evidenceIds: s.evidenceIds })),
  ];
  for (const candidate of candidates) {
    let skill = matchSkill(index, candidate.name);
    if (!skill) {
      const slug = skillSlug(candidate.name);
      skill = {
        id: randomUUID(),
        slug,
        name: candidate.name,
        aliases: [],
        category: "other",
        ownerKey: userId,
        learningEffort: 2,
      };
      newSkills.push({ id: skill.id, slug, name: candidate.name });
      index.set(skillKey(candidate.name), skill);
    }
    // "React" and "React.js" are one skill; the skills-section entry wins.
    if (rows.has(skill.id)) continue;
    const usage = skillUsage(
      draft,
      candidate.name,
      candidate.listed,
      now,
      implications.get(skill.id) ?? [],
      skill.aliases,
    );
    const suggestion = suggestProficiency(usage, thisYear);
    rows.set(skill.id, {
      skillId: skill.id,
      proficiency: suggestion.level,
      proficiencyReason: suggestion.reason,
      years: usage.months ? round1(usage.months / 12) : null,
      lastUsedYear: usage.lastUsedYear,
      evidenceIds: candidate.evidenceIds,
      source: candidate.listed ? "cv_section" : "cv_inferred",
    });
  }
  return { rows: [...rows.values()], newSkills };
}

/**
 * Confirm on the review screen (SPEC §9.1 step 5, §9.3): the edited draft becomes the profile and this CV becomes
 * the default resume version. Durations, totals and evidence are recomputed here; one batch transaction.
 */
export async function confirmResume(userId: string, resumeId: string, input: CvDraft, now = new Date()) {
  const resume = await getResumeVersion(userId, resumeId);
  if (!resume) throw new AppError("NOT_FOUND");
  if (resume.parseStatus !== "parsed" && resume.parseStatus !== "confirmed") {
    throw new AppError("VALIDATION", { message: "This CV hasn't been read yet. Upload it again." });
  }
  const { draft, evidence } = finalizeDraft(cvDraftSchema.parse(input), cvSource(resume), now);

  const [existingProfile, existingSkills, skills] = await Promise.all([
    getCareerProfile(userId),
    listUserSkills(userId),
    cvSkillRows(userId, draft, now),
  ]);

  // Preferences written in the CV fill only empty fields; the preferences page always wins.
  const js = draft.jobSearch;
  const split = splitPreferredLocations(js.preferredLocations);
  const expected = parseCtcToAnnualInr(js.expectedCtc);
  const profile = {
    headline: draft.headline,
    summary: draft.summary,
    yearsExperience: round1(draft.computed.totalExperienceMonths / 12),
    domains: unique(draft.experience.map((e) => e.domain).filter((d): d is string => Boolean(d))),
    ...(existingProfile?.noticePeriodDays == null && { noticePeriodDays: parseNoticePeriodDays(js.noticePeriod) }),
    ...(existingProfile?.currentCtc == null && { currentCtc: parseCtcToAnnualInr(js.currentCtc) }),
    ...(existingProfile?.expectedCtcMin == null && { expectedCtcMin: expected }),
    ...(!existingProfile?.preferredLocations.length && { preferredLocations: split.locations }),
    ...(!existingProfile?.workModes.length && { workModes: split.workModes }),
  };

  const before = new Map(existingSkills.map((s) => [s.skillId, s]));
  const history = skills.rows
    .filter((r) => {
      const old = before.get(r.skillId);
      return !old || (old.proficiencySource !== "user" && old.proficiency !== r.proficiency);
    })
    .map((r) => ({ skillId: r.skillId, proficiency: r.proficiency }));

  await runBatch([
    upsertPersonalDetails(userId, draft.personal),
    upsertCareerProfile(userId, profile),
    ...replaceExperience(userId, draft.experience),
    ...replaceProjects(userId, draft.projects),
    ...replaceEducation(userId, draft.education),
    ...replaceCertifications(userId, draft.certifications),
    ...replaceOtherSections(userId, draft.otherSections),
    ...(skills.newSkills.length ? [createUserOwnedSkills(userId, skills.newSkills)] : []),
    deleteStaleCvSkills(
      userId,
      skills.rows.map((r) => r.skillId),
    ),
    ...(skills.rows.length ? [upsertCvUserSkills(userId, skills.rows)] : []),
    ...(history.length ? [recordSkillHistory(userId, history)] : []),
    ...confirmResumeStatements(userId, resumeId, draft, evidence, now),
  ]);
  return { resumeId, skills: skills.rows.length };
}

async function requireDefaultResume(userId: string) {
  const resume = await getDefaultResume(userId);
  if (!resume) throw new AppError("VALIDATION", { message: "Upload and confirm your CV first." });
  const draft = cvDraftSchema.safeParse(resume.parsed);
  const evidence = evidenceItemSchema.array().safeParse(resume.evidence ?? []);
  if (!draft.success || !evidence.success) throw new AppError("DB_ERROR", { message: "The saved CV data is invalid." });
  return { resume, draft: draft.data, evidence: evidence.data };
}

/** Recomputes what code owns after an experience edit: durations, metric flags, totals. */
function normaliseExperience(experience: CvDraft["experience"], now: Date): CvDraft["experience"] {
  const currentMonth = currentYearMonth(now);
  return experience.map((role) => {
    const endDate = role.isCurrent ? null : role.endDate;
    return {
      ...role,
      endDate,
      durationMonths: role.startDate ? monthsBetween(role.startDate, endDate ?? currentMonth) : null,
      bullets: role.bullets.map((b) => ({ ...b, text: b.text.trim(), hasMetric: hasMetric(b.text) })),
    };
  });
}

export async function saveExperienceSection(userId: string, input: CvDraft["experience"], now = new Date()) {
  const { resume, draft, evidence } = await requireDefaultResume(userId);
  const experience = normaliseExperience(cvDraftSchema.shape.experience.parse(input), now);
  const { found } = groundingIndex(resume.extractedText ?? "");
  const synced: EvidenceItem[] = syncBulletEvidence(evidence, experience, "experience_bullet", found);
  const computed = computeExperienceTotals(experience, now);
  await runBatch([
    ...replaceExperience(userId, experience),
    upsertCareerProfile(userId, { yearsExperience: round1(computed.totalExperienceMonths / 12) }),
    updateResumeDraftStatement(userId, resume.id, { ...draft, experience, computed }, synced),
  ]);
}

export async function saveProjectsSection(userId: string, input: CvDraft["projects"]) {
  const { resume, draft, evidence } = await requireDefaultResume(userId);
  const projects = cvDraftSchema.shape.projects.parse(input).map((p) => ({
    ...p,
    bullets: p.bullets.map((b) => ({ ...b, text: b.text.trim(), hasMetric: hasMetric(b.text) })),
  }));
  const { found } = groundingIndex(resume.extractedText ?? "");
  const synced = syncBulletEvidence(evidence, projects, "project_bullet", found);
  await runBatch([
    ...replaceProjects(userId, projects),
    updateResumeDraftStatement(userId, resume.id, { ...draft, projects }, synced),
  ]);
}

export async function saveEducationSection(
  userId: string,
  input: { education: CvDraft["education"]; certifications: CvDraft["certifications"] },
) {
  const { resume, draft, evidence } = await requireDefaultResume(userId);
  const education = cvDraftSchema.shape.education.parse(input.education);
  const certifications = cvDraftSchema.shape.certifications.parse(input.certifications);
  await runBatch([
    ...replaceEducation(userId, education),
    ...replaceCertifications(userId, certifications),
    updateResumeDraftStatement(userId, resume.id, { ...draft, education, certifications }, evidence),
  ]);
}

export async function saveDetailsSection(
  userId: string,
  input: Pick<CvDraft, "personal" | "headline" | "summary" | "otherSections">,
) {
  const parsed = cvDraftSchema
    .pick({ personal: true, headline: true, summary: true, otherSections: true })
    .parse(input);
  const defaultResume = await getDefaultResume(userId);
  const statements = [
    upsertPersonalDetails(userId, parsed.personal),
    upsertCareerProfile(userId, { headline: parsed.headline, summary: parsed.summary }),
    ...replaceOtherSections(userId, parsed.otherSections),
  ];
  const draft = defaultResume ? cvDraftSchema.safeParse(defaultResume.parsed) : null;
  if (defaultResume && draft?.success) {
    statements.push(
      updateResumeDraftStatement(userId, defaultResume.id, { ...draft.data, ...parsed }, defaultResume.evidence ?? []),
    );
  }
  await runBatch(statements);
}

export async function savePreferencesFromForm(userId: string, input: PreferencesInput) {
  const toInr = (lpa: number | null) => (lpa == null ? null : Math.round(lpa * 100_000));
  await savePreferences(userId, {
    currentCtc: toInr(input.currentCtcLpa),
    expectedCtcMin: toInr(input.expectedMinLpa),
    expectedCtcMax: toInr(input.expectedMaxLpa),
    noticePeriodDays: input.noticePeriodDays,
    preferredLocations: unique(input.preferredLocations.map((l) => l.trim()).filter(Boolean)),
    workModes: unique(input.workModes),
    openToRelocate: input.openToRelocate,
    dealbreakers: input.dealbreakers,
  });
}

/** Adds a skill by name: a catalogue skill when the name matches one, otherwise the user's own unreviewed skill. */
export async function addSkillByName(userId: string, name: string, proficiency: number) {
  const catalogue = await listSkillCatalogue(userId);
  const match = matchSkill(buildSkillIndex(catalogue), name);
  const id = await addSelfSkill(
    userId,
    match
      ? { existingSkillId: match.id, newSkill: null }
      : { existingSkillId: null, newSkill: { slug: skillSlug(name), name: name.trim() } },
    proficiency,
  );
  if (!id) throw new AppError("INTERNAL");
  return { id, matched: Boolean(match) };
}
