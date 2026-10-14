import "server-only";
import { z } from "zod";
import { evidenceItemSchema } from "@/lib/cv/schema";
import { AppError } from "@/lib/errors";
import { formatSalaryRange } from "@/lib/format";
import type { ScorePart } from "@/lib/jobs/relevance";
import type { FitComponent, RequirementAssessment, ConditionCheck, Blocker, ScoreGain } from "@/lib/scoring/fit";
import type { SalaryContext } from "@/lib/scoring/salary-context";
import { getLatestJobAnalysis, listJobRequirements } from "@/server/repositories/job-analysis";
import { getJobDetail } from "@/server/repositories/jobs";
import { getDefaultResume } from "@/server/repositories/resumes";
import type { StoredFitReport, StoredValidation } from "./fit-report";
import { linksOf } from "./search-runs";

/** The Fit analysis as stored, with dates as strings so the page's client parts can render it. */
export type AnalysisView = {
  id: string;
  scoreTotal: number;
  recommendation: "APPLY" | "CONSIDER" | "LOW_PRIORITY";
  components: FitComponent[];
  assessments: RequirementAssessment[];
  conditions: ConditionCheck[];
  blockers: Blocker[];
  gains: ScoreGain[];
  salaryContext: SalaryContext | null;
  scoringConfigVersion: number;
  report: StoredFitReport | null;
  validation: StoredValidation | null;
  model: string | null;
  analysedAt: string;
};

export type JobView = {
  job: {
    id: string;
    title: string;
    companyName: string;
    location: string | null;
    city: string | null;
    workMode: string | null;
    employmentType: string | null;
    salary: string | null;
    provider: string;
    origin: string;
    postedVia: string | null;
    postedAt: string | null;
    applyLinks: { site: string; url: string }[];
    description: string;
    descriptionTruncated: boolean;
    direct: boolean;
    staffing: boolean;
    stale: boolean;
    relevance: number | null;
    relevanceParts: ScorePart[];
    notFitReasons: string[];
    injectionSuspected: boolean;
  };
  requirements: { reqId: string; text: string; kind: string; importance: string; quote: string; source: string }[];
  analysis: AnalysisView | null;
  /** CV evidence by id, for chips (rendered from the catalog, never from AI text). */
  evidence: Record<string, string>;
};

const breakdownSchema = z
  .object({
    components: z.array(z.custom<FitComponent>()).catch([]),
    requirements: z.array(z.custom<RequirementAssessment>()).catch([]),
    conditions: z.array(z.custom<ConditionCheck>()).catch([]),
  })
  .catch({ components: [], requirements: [], conditions: [] });

export async function getJobView(userId: string, jobId: string): Promise<JobView> {
  const [job, analysis, requirements, resume] = await Promise.all([
    getJobDetail(userId, jobId),
    getLatestJobAnalysis(userId, jobId),
    listJobRequirements(userId, jobId),
    getDefaultResume(userId),
  ]);
  if (!job) throw new AppError("NOT_FOUND");
  const evidence = evidenceItemSchema
    .array()
    .catch([])
    .parse(resume?.evidence ?? []);
  const breakdown = breakdownSchema.parse(analysis?.breakdown);
  return {
    job: {
      id: job.id,
      title: job.title,
      companyName: job.companyName,
      location: job.location,
      city: job.locationCity,
      workMode: job.workMode,
      employmentType: job.employmentType,
      salary: job.salaryDisclosed ? formatSalaryRange(job.salaryMinAnnual, job.salaryMaxAnnual) : null,
      provider: job.provider,
      origin: job.origin,
      postedVia: job.postedVia,
      postedAt: job.postedAt?.toISOString() ?? null,
      applyLinks: linksOf(job.applyLinks),
      description: job.descriptionRaw,
      descriptionTruncated: job.descriptionTruncated,
      direct: job.isDirectFromCompany,
      staffing: job.company?.isStaffingAgency ?? false,
      stale: job.isStale,
      relevance: job.quickScore,
      relevanceParts: z
        .object({ parts: z.array(z.custom<ScorePart>()) })
        .catch({ parts: [] })
        .parse(job.scoreParts).parts,
      notFitReasons: job.notFitReasons,
      injectionSuspected: job.injectionSuspected,
    },
    requirements: requirements.map((r) => ({
      reqId: r.reqId,
      text: r.text,
      kind: r.kind,
      importance: r.importance,
      quote: r.quote,
      source: r.source,
    })),
    analysis: analysis && {
      id: analysis.id,
      scoreTotal: analysis.scoreTotal,
      recommendation: analysis.recommendation as AnalysisView["recommendation"],
      components: breakdown.components,
      assessments: breakdown.requirements,
      conditions: breakdown.conditions,
      blockers: (analysis.blockers as Blocker[] | null) ?? [],
      gains: (analysis.gains as ScoreGain[] | null) ?? [],
      salaryContext: (analysis.salaryContext as SalaryContext | null) ?? null,
      scoringConfigVersion: analysis.scoringConfigVersion,
      report: (analysis.report as StoredFitReport | null) ?? null,
      validation: (analysis.validation as StoredValidation | null) ?? null,
      model: analysis.model,
      analysedAt: analysis.updatedAt.toISOString(),
    },
    evidence: Object.fromEntries(evidence.map((e) => [e.id, e.text])),
  };
}
