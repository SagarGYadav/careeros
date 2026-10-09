import "server-only";
import { analyseCv, type CvAnalysis, type CvParseFn } from "@/lib/cv/analyse";
import { validateCvFile } from "@/lib/cv/files";
import { AppError, isAppError } from "@/lib/errors";
import { ai } from "@/server/ai/runner";
import { createResumeParser } from "@/server/ai/resume-parser";
import { logger } from "@/server/logger";
import { saveStoredFile } from "@/server/repositories/files";
import { createResumeVersion, markResumeFailed, saveResumeParse } from "@/server/repositories/resumes";

export type CvPipelineStage = "stored" | "parsing" | "verifying" | "second_pass" | "saved";

export type CvUploadResult = {
  resumeId: string;
  draft: CvAnalysis["draft"];
  evidence: CvAnalysis["evidence"];
  report: CvAnalysis["report"];
  parse: CvAnalysis["parse"];
};

/** "Ananya_CV-2026.pdf" → "Ananya_CV-2026": the default name of the resume version. */
function versionName(fileName: string): string {
  return fileName.replace(/\.(pdf|docx)$/i, "").trim() || "My CV";
}

/**
 * CV upload (SPEC §9.1): check the file's type from its bytes, store it, then extract → parse → verify and save
 * the draft for review. Nothing reaches the profile until the user confirms it on the review screen.
 */
export async function processCvUpload(
  userId: string,
  upload: { fileName: string; bytes: Uint8Array },
  options: { onStage?: (stage: CvPipelineStage) => void; now?: Date; parse?: CvParseFn } = {},
): Promise<CvUploadResult> {
  const { kind, mimeType } = validateCvFile(upload);
  // Only the base name is kept; paths and control characters from the browser are dropped.
  const fileName =
    upload.fileName
      .split(/[\\/]/)
      .pop()!
      .replace(/[\u0000-\u001f]/g, "")
      .slice(0, 200) || `cv.${kind}`;

  const stored = await saveStoredFile(userId, { fileName, mimeType, bytes: upload.bytes });
  const resume = await createResumeVersion(userId, { name: versionName(fileName), fileId: stored.id });
  options.onStage?.("stored");

  try {
    const analysis = await analyseCv(
      { bytes: upload.bytes, kind, fileName },
      {
        parse: options.parse ?? createResumeParser(ai, userId),
        now: options.now ?? new Date(),
        onStage: options.onStage,
      },
    );
    await saveResumeParse(userId, resume.id, {
      extractedText: analysis.extracted.text,
      pageCount: kind === "pdf" ? analysis.extracted.pages.length : null,
      links: analysis.extracted.links,
      parsed: analysis.draft,
      evidence: analysis.evidence,
      verification: analysis.report,
      parseMode: analysis.parse.mode,
      parseProvider: analysis.parse.provider,
      injectionSuspected: analysis.parse.injectionSuspected,
    });
    options.onStage?.("saved");
    return {
      resumeId: resume.id,
      draft: analysis.draft,
      evidence: analysis.evidence,
      report: analysis.report,
      parse: analysis.parse,
    };
  } catch (error) {
    await markResumeFailed(userId, resume.id);
    if (isAppError(error)) throw error;
    logger.error("cv pipeline failed", { error, resumeId: resume.id });
    throw new AppError("PARSE_FAILED", { cause: error });
  }
}
