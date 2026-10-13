import "server-only";
import { createHash } from "node:crypto";
import { AppError } from "@/lib/errors";
import { readConditions } from "@/lib/jobs/conditions";
import type { RequirementImportance, RequirementKind } from "@/lib/jobs/extraction";
import { canonicalCity } from "@/lib/jobs/normalize";
import { finalizeRequirements, type FinalRequirement } from "@/lib/jobs/requirements";
import { readScoringConfig } from "@/lib/scoring/config";
import { scoreFit, type FitJob, type FitProfile, type FitRequirement, type FitScore } from "@/lib/scoring/fit";
import { SALARY_CONTEXT_DAYS, salaryContext, type SalaryContext } from "@/lib/scoring/salary-context";
import { buildSkillIndex } from "@/lib/skills/normalize";
import { storedDealbreakersSchema } from "@/lib/validation/profile";
import { extractJobWithAi, JOB_EXTRACTOR_PROMPT_VERSION } from "@/server/ai/job-extractor";
import { ai } from "@/server/ai/runner";
import {
  findJobAnalysis,
  getActiveScoringConfig,
  getJobForAnalysis,
  listJobRequirements,
  listSalarySamples,
  saveJobAnalysis,
  saveJobExtraction,
} from "@/server/repositories/job-analysis";
import { getCareerProfile } from "@/server/repositories/profile";
import { getDefaultResume } from "@/server/repositories/resumes";
import {
  listSkillCatalogue,
  listSkillImplicationIds,
  listSkillRelatedIds,
  listUserSkills,
} from "@/server/repositories/skills";
import { listRoleFamilies, listTargetRoles } from "@/server/repositories/target-roles";

/** Bump when the scoring code changes, so cached analyses are recomputed. */
const SCORING_MODEL_VERSION = "1";

export type ExtractionOutcome = {
  requirements: FinalRequirement[];
  mode: string;
  reused: boolean;
  dropped: string[];
};

/**
 * Reads a job's requirements with JobExtractor (fast tier) and the code checks in lib/jobs/requirements. A job
 * already extracted from the same description with the same prompt version is not extracted again.
 */
export async function extractJobRequirements(userId: string, jobId: string): Promise<ExtractionOutcome> {
  const job = await getJobForAnalysis(userId, jobId);
  if (!job) throw new AppError("NOT_FOUND");
  if (
    job.extractedAt &&
    job.extractionPromptVersion === JOB_EXTRACTOR_PROMPT_VERSION &&
    job.extractionSourceHash === job.descriptionHash
  ) {
    const stored = await listJobRequirements(userId, jobId);
    return {
      requirements: stored.map((r) => ({
        reqId: r.reqId,
        skillId: r.skillId,
        skillName: r.skill?.name ?? (r.kind === "skill" ? r.text : null),
        text: r.text,
        kind: r.kind as RequirementKind,
        importance: r.importance as RequirementImportance,
        yearsRequired: r.yearsRequired,
        quote: r.quote,
        source: r.source as FinalRequirement["source"],
        sortOrder: r.sortOrder,
      })),
      mode: job.extractionMode ?? "ai",
      reused: true,
      dropped: [],
    };
  }

  const [families, catalogue] = await Promise.all([listRoleFamilies(), listSkillCatalogue(userId)]);
  const result = await extractJobWithAi(
    ai,
    {
      text: job.descriptionRaw,
      title: job.title,
      company: job.companyName,
      skills: catalogue.map((s) => ({ name: s.name, aliases: s.aliases })),
      families: families.map((f) => ({ slug: f.slug, name: f.name, titleVariants: f.titleVariants })),
    },
    userId,
  );
  const extraction = result.extraction;
  const { requirements, dropped } = finalizeRequirements(
    extraction.requirements,
    job.descriptionRaw,
    catalogue,
    buildSkillIndex(catalogue),
  );
  const family = families.find((f) => f.slug === extraction.roleFamilySlug) ?? null;
  // Values read from the posting by regex at search time stay; the extraction fills what they left empty.
  const keepRegexYears = job.expMinYears !== null || job.expMaxYears !== null;
  await saveJobExtraction(
    userId,
    jobId,
    {
      responsibilities: extraction.responsibilities.slice(0, 12),
      extraction: {
        domain: extraction.domain,
        employmentType: extraction.employmentType,
        seniority: extraction.seniority,
        experience: extraction.experience,
        roleFamilySlug: extraction.roleFamilySlug,
        workMode: extraction.workMode,
        droppedRequirements: dropped,
        provider: result.provider,
      },
      mode: result.mode,
      model: result.model,
      promptVersion: JOB_EXTRACTOR_PROMPT_VERSION,
      sourceHash: job.descriptionHash,
      injectionSuspected: result.injectionSuspected,
      roleFamilyId: job.roleFamilyId ?? family?.id ?? null,
      expMinYears: keepRegexYears ? job.expMinYears : extraction.experience.min,
      expMaxYears: keepRegexYears ? job.expMaxYears : extraction.experience.max,
      seniority: job.seniority ?? extraction.seniority,
    },
    requirements,
  );
  return { requirements, mode: result.mode, reused: false, dropped };
}

/** The user's profile as the Fit score sees it. */
async function fitProfile(userId: string): Promise<FitProfile> {
  const [career, userSkills, implies, related, roles, families] = await Promise.all([
    getCareerProfile(userId),
    listUserSkills(userId),
    listSkillImplicationIds(userId),
    listSkillRelatedIds(userId),
    listTargetRoles(userId),
    listRoleFamilies(),
  ]);
  const chosen = roles.some((r) => r.selected) ? roles.filter((r) => r.selected) : roles;
  const targetFamilyIds = [...new Set(chosen.map((r) => r.roleFamilyId).filter((id): id is string => Boolean(id)))];
  const bySlug = new Map(families.map((f) => [f.slug, f.id]));
  const adjacentFamilyIds = [
    ...new Set(
      families
        .filter((f) => targetFamilyIds.includes(f.id))
        .flatMap((f) => f.adjacentSlugs.map((slug) => bySlug.get(slug)))
        .filter((id): id is string => Boolean(id) && !targetFamilyIds.includes(id!)),
    ),
  ];
  const workModes = career?.workModes ?? [];
  const cities = [
    ...new Set((career?.preferredLocations ?? []).map(canonicalCity).filter((c): c is string => Boolean(c))),
  ];
  return {
    years: career?.yearsExperience ?? null,
    skills: new Map(
      userSkills.map((s) => [s.skillId, { name: s.skill.name, proficiency: s.proficiency, years: s.years }]),
    ),
    implies,
    related,
    targetFamilyIds,
    adjacentFamilyIds,
    targetTitles: chosen.flatMap((r) => [r.title, ...r.titleVariants]),
    locations: workModes.includes("remote") ? [...cities, "Remote-India"] : cities,
    workModes,
    openToRelocate: career?.openToRelocate ?? false,
    expectedSalaryMin: career?.expectedCtcMin ?? null,
    noticePeriodDays: career?.noticePeriodDays ?? null,
    dealbreakers: storedDealbreakersSchema.parse(career?.dealbreakers ?? {}),
  };
}

export type FitAnalysis = {
  id: string;
  jobId: string;
  score: FitScore;
  salaryContext: SalaryContext | null;
  scoringConfigVersion: number;
  requirements: FinalRequirement[];
  extractionMode: string;
};

/**
 * Fit analysis of one job (SPEC §12.2, §12.5): extract requirements if needed, then score in code. The result is
 * saved per input hash, so the same job, profile and settings give the same stored analysis.
 */
export async function analyseJobFit(userId: string, jobId: string, now = new Date()): Promise<FitAnalysis> {
  const extracted = await extractJobRequirements(userId, jobId);
  const [job, profile, configRow, resume] = await Promise.all([
    getJobForAnalysis(userId, jobId),
    fitProfile(userId),
    getActiveScoringConfig(userId),
    getDefaultResume(userId),
  ]);
  if (!job) throw new AppError("NOT_FOUND");
  const config = readScoringConfig(configRow);

  const requirements: FitRequirement[] = extracted.requirements.map((r) => ({
    reqId: r.reqId,
    kind: r.kind,
    importance: r.importance,
    skillId: r.skillId,
    skillName: r.skillName,
    yearsRequired: r.yearsRequired,
    text: r.text,
  }));
  const fitJob: FitJob = {
    title: job.title,
    roleFamilyId: job.roleFamilyId,
    expMinYears: job.expMinYears,
    expMaxYears: job.expMaxYears,
    city: job.locationCity,
    workMode: job.workMode,
    salaryMinAnnual: job.salaryMinAnnual,
    salaryMaxAnnual: job.salaryMaxAnnual,
    salaryDisclosed: job.salaryDisclosed,
    conditions: readConditions(job.conditions),
  };
  const score = scoreFit(requirements, fitJob, profile, config);
  const samples =
    job.roleFamilyId && job.locationCity
      ? await listSalarySamples(userId, {
          roleFamilyId: job.roleFamilyId,
          city: job.locationCity,
          since: new Date(now.getTime() - SALARY_CONTEXT_DAYS * 86_400_000),
          excludeJobId: job.id,
        })
      : [];
  const context = salaryContext(samples.map((s) => ({ min: s.salaryMinAnnual, max: s.salaryMaxAnnual })));

  const inputHash = createHash("sha256")
    .update(
      JSON.stringify({
        v: SCORING_MODEL_VERSION,
        requirements,
        fitJob,
        profile: {
          ...profile,
          skills: [...profile.skills],
          implies: [...profile.implies],
          related: [...profile.related],
        },
        config,
        context,
        resume: resume?.id ?? null,
      }),
    )
    .digest("hex")
    .slice(0, 32);
  const existing = await findJobAnalysis(userId, jobId, inputHash);
  const saved =
    existing ??
    (await saveJobAnalysis(userId, {
      jobId,
      resumeVersionId: resume?.id ?? null,
      scoringConfigVersion: config.version,
      scoreTotal: score.total,
      breakdown: { components: score.components, requirements: score.requirements, conditions: score.conditions },
      recommendation: score.recommendation,
      blockers: score.blockers,
      gains: score.gains,
      salaryContext: context,
      inputHash,
    }));
  return {
    id: saved.id,
    jobId,
    score,
    salaryContext: context,
    scoringConfigVersion: config.version,
    requirements: extracted.requirements,
    extractionMode: extracted.mode,
  };
}
