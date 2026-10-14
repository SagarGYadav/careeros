import "server-only";
import { z } from "zod";
import { evidenceItemSchema } from "@/lib/cv/schema";
import { cosine } from "@/lib/embeddings/providers";
import { atsKeywordCheck, reportConfidence, type AtsCheck, type ReportConfidence } from "@/lib/fit-report/calc";
import { buildStats, type AnalystInput, type ResponsibilityMatch } from "@/lib/fit-report/context";
import type { FitReport } from "@/lib/fit-report/schema";
import type { ValidationResult } from "@/lib/fit-report/validate";
import { FIT_ANALYST_PROMPT_VERSION, writeFitReport } from "@/server/ai/fit-analyst";
import { ai } from "@/server/ai/runner";
import { embeddings } from "@/server/embeddings/runner";
import { saveFitReport } from "@/server/repositories/job-analysis";
import { listSkillCatalogue, listSkillImplicationIds, listUserSkills } from "@/server/repositories/skills";
import { analyseJobFit, type FitAnalysis } from "./job-analysis";

/** A duty and a CV line closer than this (cosine, bge-small) count as a match worth showing. */
const MATCH_THRESHOLD = 0.6;
/** CV lines that describe work (not skill lists or degrees), compared with the job's duties. */
const WORK_EVIDENCE = new Set(["experience_bullet", "project_bullet", "project_description"]);

export type FitReportStage = "requirements" | "evidence" | "writing" | "saving";

/** Everything the Fit Report page shows (SPEC §12.4): the AI-written parts plus the parts computed in code. */
export type StoredFitReport = Omit<FitReport, "risks"> & {
  risks: (FitReport["risks"][number] & { effort: "small" | "medium" | "large" | null })[];
  ats: AtsCheck;
  confidence: ReportConfidence;
  matches: ResponsibilityMatch[];
  mode: "ai" | "cache" | "no_ai";
  provider: string | null;
};

export type StoredValidation = ValidationResult & { repaired: boolean; codeOnlyTotal: number };

export type FitReportView = {
  analysis: FitAnalysis;
  report: StoredFitReport;
  validation: StoredValidation;
  cached: boolean;
};

const EFFORT = { 1: "small", 2: "medium", 3: "large" } as const;

/** Each duty's closest CV line by meaning; empty when no embedding service answers (the report still works). */
async function matchDuties(duties: string[], evidence: { id: string; text: string }[]): Promise<ResponsibilityMatch[]> {
  if (!duties.length || !evidence.length) return [];
  const result = await embeddings.embed([...duties, ...evidence.map((e) => e.text)]);
  if (!result) return [];
  const dutyVectors = result.vectors.slice(0, duties.length);
  const evidenceVectors = result.vectors.slice(duties.length);
  return duties.flatMap((duty, i) => {
    let best = { index: -1, similarity: 0 };
    evidenceVectors.forEach((vector, j) => {
      const similarity = cosine(dutyVectors[i], vector);
      if (similarity > best.similarity) best = { index: j, similarity };
    });
    return best.similarity >= MATCH_THRESHOLD
      ? [
          {
            responsibility: duty,
            evidenceId: evidence[best.index].id,
            similarity: Math.round(best.similarity * 100) / 100,
          },
        ]
      : [];
  });
}

/**
 * The Fit Report for one job (SPEC §12.5): requirements and score from code, then FitAnalyst, the validator and one
 * repair. Reports are stored with the analysis, so the same inputs never call the AI twice.
 */
export async function generateFitReport(
  userId: string,
  jobId: string,
  options: { now?: Date; onStage?: (stage: FitReportStage) => void } = {},
): Promise<FitReportView> {
  const now = options.now ?? new Date();
  options.onStage?.("requirements");
  let analysis = await analyseJobFit(userId, jobId, now);
  if (analysis.stored.report && analysis.stored.promptVersion === FIT_ANALYST_PROMPT_VERSION) {
    return {
      analysis,
      report: analysis.stored.report as StoredFitReport,
      validation: analysis.stored.validation as StoredValidation,
      cached: true,
    };
  }

  options.onStage?.("evidence");
  const { job, profile, resume, score } = analysis;
  const [userSkills, implies, catalogue] = await Promise.all([
    listUserSkills(userId),
    listSkillImplicationIds(userId),
    listSkillCatalogue(userId),
  ]);
  const evidence = evidenceItemSchema
    .array()
    .catch([])
    .parse(resume?.evidence ?? []);
  const skillEvidence = new Map(userSkills.map((s) => [s.skillId, s.evidenceIds]));
  const skillInfo = new Map(catalogue.map((s) => [s.id, s]));
  const assessed = new Map(score.requirements.map((r) => [r.reqId, r]));
  const matches = await matchDuties(
    job.responsibilities,
    evidence.filter((e) => WORK_EVIDENCE.has(e.kind)),
  );
  const { stats, blockerStatIds } = buildStats({
    score,
    years: profile.years,
    job: {
      expMinYears: job.expMinYears,
      expMaxYears: job.expMaxYears,
      salaryMin: job.salaryMinAnnual,
      salaryMax: job.salaryMaxAnnual,
      salaryDisclosed: job.salaryDisclosed,
    },
    expectedSalaryMin: profile.expectedSalaryMin,
    noticePeriodDays: profile.noticePeriodDays,
    salaryContext: analysis.salaryContext,
  });
  const extraction = z.object({ domain: z.string().nullable() }).catch({ domain: null }).parse(job.extraction);
  const input: AnalystInput = {
    job: {
      title: job.title,
      company: job.companyName,
      seniority: job.seniority,
      domain: extraction.domain,
      responsibilities: job.responsibilities,
    },
    requirements: analysis.requirements.map((r) => {
      // Evidence for a skill: where the user's own skill appears, or a skill that implies it (Next.js → React).
      const ids = r.skillId
        ? [r.skillId, ...(implies.get(r.skillId) ?? [])].flatMap((id) => skillEvidence.get(id) ?? [])
        : [];
      const status = assessed.get(r.reqId);
      return {
        reqId: r.reqId,
        text: r.text,
        kind: r.kind,
        importance: r.importance,
        quote: r.quote,
        codeStatus: status?.status ?? "unscored",
        codeReason: status?.reason ?? "",
        evidenceIds: [...new Set(ids)].slice(0, 5),
        learningEffort: r.skillId ? (skillInfo.get(r.skillId)?.learningEffort ?? null) : null,
      };
    }),
    evidence: evidence.map((e) => ({ id: e.id, text: e.text, section: e.section })),
    stats,
    recommendation: score.recommendation,
    blockerStatIds,
    matches,
  };

  options.onStage?.("writing");
  const written = await writeFitReport(ai, input, job.descriptionRaw, userId);

  options.onStage?.("saving");
  const codeOnlyTotal = score.total;
  if (written.validation.acceptedSemanticMatches.length) {
    analysis = await analyseJobFit(userId, jobId, now, {
      semanticMatches: written.validation.acceptedSemanticMatches,
    });
  }
  const effortOf = (reqIds: string[]) => {
    const level = input.requirements.find((r) => reqIds.includes(r.reqId))?.learningEffort;
    return level === 1 || level === 2 || level === 3 ? EFFORT[level] : null;
  };
  const extracted = z.object({ droppedRequirements: z.array(z.string()) }).catch({ droppedRequirements: [] });
  const report: StoredFitReport = {
    ...written.report,
    risks: written.report.risks.map((r) => ({
      ...r,
      effort: r.mitigation === "learn" ? effortOf(r.requirementIds) : null,
    })),
    ats: atsKeywordCheck(
      analysis.requirements
        .filter((r) => r.kind === "skill")
        .map((r) => ({
          reqId: r.reqId,
          skillName: r.skillName,
          importance: r.importance,
          aliases: r.skillId ? (skillInfo.get(r.skillId)?.aliases ?? []) : [],
        })),
      resume?.extractedText ?? "",
    ),
    confidence: reportConfidence({
      descriptionTruncated: job.descriptionTruncated,
      descriptionWords: job.descriptionRaw.split(/\s+/).filter(Boolean).length,
      requirementCount: analysis.requirements.length,
      droppedRequirements: extracted.parse(job.extraction).droppedRequirements.length,
      extractionMode: analysis.extractionMode,
      reportVerified: written.validation.passed,
    }),
    matches,
    mode: written.mode,
    provider: written.provider,
  };
  const validation: StoredValidation = { ...written.validation, repaired: written.repaired, codeOnlyTotal };
  await saveFitReport(userId, analysis.id, {
    report,
    validation,
    model: written.model,
    promptVersion: FIT_ANALYST_PROMPT_VERSION,
  });
  return { analysis, report, validation, cached: false };
}
