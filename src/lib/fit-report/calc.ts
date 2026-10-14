// Fit Report parts computed in code (CALC, SPEC §12.4): the ATS keyword check and the report's confidence.
import { skillKeysIn } from "@/lib/cv/evidence";
import { mentionsCatalogueSkill } from "@/lib/jobs/extract-heuristic";

export type AtsCheck = {
  present: { reqId: string; keyword: string }[];
  missing: { reqId: string; keyword: string; importance: string }[];
};

/** Which skill keywords of the posting the CV text contains, aliases included ("ReactJS" counts for React). */
export function atsKeywordCheck(
  requirements: { reqId: string; skillName: string | null; importance: string; aliases: string[] }[],
  cvText: string,
): AtsCheck {
  const keys = skillKeysIn(cvText);
  const result: AtsCheck = { present: [], missing: [] };
  const seen = new Set<string>();
  for (const req of requirements) {
    if (!req.skillName || seen.has(req.skillName)) continue;
    seen.add(req.skillName);
    if (mentionsCatalogueSkill(cvText, keys, { name: req.skillName, aliases: req.aliases })) {
      result.present.push({ reqId: req.reqId, keyword: req.skillName });
    } else {
      result.missing.push({ reqId: req.reqId, keyword: req.skillName, importance: req.importance });
    }
  }
  return result;
}

export type ReportConfidence = { level: "high" | "medium" | "low"; reasons: string[] };

/** How far to trust the report: a cut-off description or a thin extraction lowers it (SPEC §12.4.1). */
export function reportConfidence(input: {
  descriptionTruncated: boolean;
  descriptionWords: number;
  requirementCount: number;
  droppedRequirements: number;
  extractionMode: string;
  reportVerified: boolean;
}): ReportConfidence {
  const low: string[] = [];
  const medium: string[] = [];
  if (input.descriptionTruncated) low.push("The job site sent only part of the description.");
  if (input.requirementCount < 3) low.push("Fewer than 3 requirements could be read from the posting.");
  if (input.descriptionWords < 120) medium.push("The description is short.");
  if (input.extractionMode === "no_ai") medium.push("Requirements were read without AI.");
  if (input.droppedRequirements >= 3) medium.push("Several extracted requirements weren't found in the posting.");
  if (!input.reportVerified) medium.push("Some statements couldn't be verified.");
  return {
    level: low.length ? "low" : medium.length ? "medium" : "high",
    reasons: [...low, ...medium],
  };
}
