// "Copy report" (SPEC §12.4): the Fit Report as plain text, for notes or a message. Ids are kept so every claim
// can still be traced back to the CV line or requirement it cites.
import type { ConditionCheck, FitComponent, ScoreGain } from "@/lib/scoring/fit";
import { COMPONENT_LABELS } from "@/lib/scoring/config";
import type { Claim, FitReport } from "./schema";

export const RECOMMENDATION_LABELS = { APPLY: "Apply", CONSIDER: "Consider", LOW_PRIORITY: "Low priority" } as const;
export const ACTION_LABELS = {
  apply_now: "Apply now",
  tailor_first: "Tailor the CV first",
  seek_referral: "Seek a referral",
  skip: "Skip",
} as const;
export const MITIGATION_LABELS = {
  surface_evidence: "Surface existing evidence",
  cover_note: "Mention in a cover note",
  interview_prep: "Prepare for the interview",
  learn: "Learn it",
} as const;

export type PlainTextInput = {
  title: string;
  company: string;
  scoreTotal: number;
  recommendation: keyof typeof RECOMMENDATION_LABELS;
  components: FitComponent[];
  gains: ScoreGain[];
  conditions: ConditionCheck[];
  requirements: { reqId: string; text: string; importance: string; status: string; note: string }[];
  report: Pick<FitReport, "summary" | "roleDecoded" | "recruiterView" | "risks" | "strategy">;
};

const cite = (c: Claim) => {
  const ids = [...c.evidenceIds, ...c.requirementIds, ...c.statIds];
  return ids.length ? ` [${ids.join(", ")}]` : "";
};
const line = (c: Claim) => `${c.text}${cite(c)}`;
const bullets = (items: string[]) => items.map((i) => `- ${i}`).join("\n");

export function fitReportToText(input: PlainTextInput): string {
  const { report } = input;
  const sections = [
    `Fit Report: ${input.title} at ${input.company}`,
    `Fit score ${input.scoreTotal}/100 · ${RECOMMENDATION_LABELS[input.recommendation]}`,
    line(report.summary),
    `ROLE\n${line(report.roleDecoded.whatTheRoleIs)}\n${line(report.roleDecoded.seniority)}`,
    `REQUIREMENTS\n${bullets(input.requirements.map((r) => `${r.reqId} ${r.text} (${r.importance}): ${r.status}${r.note ? ` — ${r.note}` : ""}`))}`,
    `SCORE\n${bullets(input.components.map((c) => `${COMPONENT_LABELS[c.key]}: ${Math.round(c.points)}/${c.max} — ${c.reason}`))}` +
      (input.gains.length ? `\n${bullets(input.gains.map((g) => `+${g.points} with ${g.skillName}`))}` : ""),
    input.conditions.length ? `CONDITIONS\n${bullets(input.conditions.map((c) => c.message))}` : "",
    report.recruiterView.standsOut.length || report.recruiterView.redFlags.length
      ? `RECRUITER VIEW\n${bullets([
          ...report.recruiterView.standsOut.map((c) => `+ ${line(c)}`),
          ...report.recruiterView.redFlags.map((c) => `! (${c.severity}) ${line(c)}`),
        ])}`
      : "",
    report.risks.length
      ? `RISKS\n${bullets(report.risks.map((r) => `${line(r)} → ${MITIGATION_LABELS[r.mitigation]}`))}`
      : "",
    `STRATEGY: ${ACTION_LABELS[report.strategy.action]}\n${line(report.strategy.reasoning)}` +
      (report.strategy.emphasise.length ? `\nLead with:\n${bullets(report.strategy.emphasise.map(line))}` : "") +
      (report.strategy.questions.length ? `\nAsk the recruiter:\n${bullets(report.strategy.questions)}` : ""),
  ];
  return sections.filter(Boolean).join("\n\n");
}
