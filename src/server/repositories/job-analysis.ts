import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import type { FinalRequirement } from "@/lib/jobs/requirements";
import type { ScoringSettings } from "@/lib/scoring/config";
import { db } from "@/server/db";

const json = (value: unknown) => value as Prisma.InputJsonValue;
// Neon may take a few seconds to hand out a connection after being idle; Prisma's default wait is 2 s.
const TRANSACTION_OPTIONS = { maxWait: 10_000, timeout: 20_000 };

/** Everything Fit analysis needs from one job. */
export async function getJobForAnalysis(userId: string, jobId: string) {
  return db.job.findFirst({
    where: { id: jobId, userId },
    select: {
      id: true,
      title: true,
      companyName: true,
      descriptionRaw: true,
      descriptionHash: true,
      descriptionTruncated: true,
      locationCity: true,
      workMode: true,
      salaryMinAnnual: true,
      salaryMaxAnnual: true,
      salaryDisclosed: true,
      expMinYears: true,
      expMaxYears: true,
      seniority: true,
      roleFamilyId: true,
      conditions: true,
      responsibilities: true,
      extraction: true,
      extractedAt: true,
      extractionMode: true,
      extractionModel: true,
      extractionPromptVersion: true,
      extractionSourceHash: true,
      injectionSuspected: true,
    },
  });
}

/** Replaces a job's requirements and saves what the extraction found, in one transaction. */
export async function saveJobExtraction(
  userId: string,
  jobId: string,
  data: {
    responsibilities: string[];
    extraction: unknown;
    mode: string;
    model: string | null;
    promptVersion: string;
    sourceHash: string;
    injectionSuspected: boolean;
    roleFamilyId: string | null;
    expMinYears: number | null;
    expMaxYears: number | null;
    seniority: string | null;
  },
  requirements: FinalRequirement[],
) {
  await db.$transaction(
    [
      db.jobRequirement.deleteMany({ where: { userId, jobId } }),
      db.jobRequirement.createMany({
        data: requirements.map((r) => ({
          userId,
          jobId,
          reqId: r.reqId,
          skillId: r.skillId,
          text: r.text,
          kind: r.kind,
          importance: r.importance,
          yearsRequired: r.yearsRequired,
          quote: r.quote,
          source: r.source,
          sortOrder: r.sortOrder,
        })),
      }),
      db.job.updateMany({
        where: { id: jobId, userId },
        data: {
          responsibilities: data.responsibilities,
          extraction: json(data.extraction),
          extractedAt: new Date(),
          extractionMode: data.mode,
          extractionModel: data.model,
          extractionPromptVersion: data.promptVersion,
          extractionSourceHash: data.sourceHash,
          injectionSuspected: data.injectionSuspected,
          roleFamilyId: data.roleFamilyId,
          expMinYears: data.expMinYears,
          expMaxYears: data.expMaxYears,
          seniority: data.seniority,
        },
      }),
    ],
    TRANSACTION_OPTIONS,
  );
}

export async function listJobRequirements(userId: string, jobId: string) {
  return db.jobRequirement.findMany({
    where: { userId, jobId },
    orderBy: { sortOrder: "asc" },
    include: { skill: { select: { name: true } } },
  });
}

export async function getActiveScoringConfig(userId: string) {
  return db.scoringConfig.findFirst({ where: { userId, active: true }, orderBy: { version: "desc" } });
}

/** Saves settings as a new version and makes it the active one. */
export async function saveScoringConfig(userId: string, settings: ScoringSettings) {
  return db.$transaction(async (tx) => {
    const latest = await tx.scoringConfig.findFirst({ where: { userId }, orderBy: { version: "desc" } });
    await tx.scoringConfig.updateMany({ where: { userId, active: true }, data: { active: false } });
    return tx.scoringConfig.create({
      data: {
        userId,
        version: (latest?.version ?? 0) + 1,
        weights: json(settings.weights),
        thresholds: json(settings.thresholds),
      },
    });
  });
}

/** Back to the built-in defaults (version 0): no config is active. */
export async function deactivateScoringConfigs(userId: string) {
  await db.scoringConfig.updateMany({ where: { userId, active: true }, data: { active: false } });
}

export type JobAnalysisData = {
  jobId: string;
  resumeVersionId: string | null;
  scoringConfigVersion: number;
  scoreTotal: number;
  breakdown: unknown;
  recommendation: string;
  blockers: unknown;
  gains: unknown;
  salaryContext: unknown;
  inputHash: string;
};

/** Saves an analysis; the same inputs (same hash) update the existing row instead of adding another. */
export async function saveJobAnalysis(userId: string, data: JobAnalysisData) {
  const values = {
    resumeVersionId: data.resumeVersionId,
    scoringConfigVersion: data.scoringConfigVersion,
    scoreTotal: data.scoreTotal,
    breakdown: json(data.breakdown),
    recommendation: data.recommendation,
    blockers: json(data.blockers),
    gains: json(data.gains),
    salaryContext: data.salaryContext === null ? undefined : json(data.salaryContext),
  };
  const [saved] = await db.$transaction(
    [
      db.jobAnalysis.upsert({
        where: { userId_jobId_inputHash: { userId, jobId: data.jobId, inputHash: data.inputHash } },
        create: { userId, jobId: data.jobId, inputHash: data.inputHash, ...values },
        update: values,
      }),
      // The job carries its latest Fit score, so the feed can sort and filter by it.
      db.job.updateMany({
        where: { id: data.jobId, userId },
        data: { fitScore: data.scoreTotal, fitRecommendation: data.recommendation, sortScore: data.scoreTotal },
      }),
    ],
    TRANSACTION_OPTIONS,
  );
  return saved;
}

export async function findJobAnalysis(userId: string, jobId: string, inputHash: string) {
  return db.jobAnalysis.findUnique({ where: { userId_jobId_inputHash: { userId, jobId, inputHash } } });
}

export async function getLatestJobAnalysis(userId: string, jobId: string) {
  return db.jobAnalysis.findFirst({ where: { userId, jobId }, orderBy: { updatedAt: "desc" } });
}

/** Disclosed salaries of the user's other jobs in the same role family and city since `since` (salary context). */
export async function listSalarySamples(
  userId: string,
  filter: { roleFamilyId: string; city: string; since: Date; excludeJobId: string },
) {
  return db.job.findMany({
    where: {
      userId,
      id: { not: filter.excludeJobId },
      roleFamilyId: filter.roleFamilyId,
      locationCity: filter.city,
      salaryDisclosed: true,
      OR: [{ postedAt: { gte: filter.since } }, { postedAt: null, discoveredAt: { gte: filter.since } }],
    },
    select: { salaryMinAnnual: true, salaryMaxAnnual: true },
  });
}

/** Stores FitAnalyst's report on an analysis, with the validator's result and what produced it. */
export async function saveFitReport(
  userId: string,
  analysisId: string,
  data: { report: unknown; validation: unknown; model: string | null; promptVersion: string },
) {
  await db.jobAnalysis.updateMany({
    where: { id: analysisId, userId },
    data: {
      report: json(data.report),
      validation: json(data.validation),
      model: data.model,
      promptVersion: data.promptVersion,
    },
  });
}

/** Fit Reports written since `since` (the AI wrote or rewrote them), for the hourly cap. */
export async function countFitReportsSince(userId: string, since: Date) {
  return db.jobAnalysis.count({ where: { userId, promptVersion: { not: null }, updatedAt: { gte: since } } });
}
