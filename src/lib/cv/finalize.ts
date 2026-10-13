// After the user edits a draft on the review screen: recompute everything code owns (durations, totals, metric
// flags) and rebuild the evidence catalog against the CV text. Numbers sent by the browser are never trusted.
import { currentYearMonth, monthsBetween } from "./dates";
import { buildEvidenceCatalog, pageLocator } from "./evidence";
import type { CvDraft, EvidenceItem } from "./schema";
import { hasMetric } from "./text";
import { computeExperienceTotals, groundingIndex } from "./verify";

export type CvSource = { text: string; pages: string[]; isPdf: boolean };

export function finalizeDraft(
  input: CvDraft,
  source: CvSource,
  now: Date,
): { draft: CvDraft; evidence: EvidenceItem[] } {
  const currentMonth = currentYearMonth(now);
  const experience = input.experience.map((role) => {
    const endDate = role.isCurrent ? null : role.endDate;
    return {
      ...role,
      endDate,
      durationMonths: role.startDate ? monthsBetween(role.startDate, endDate ?? currentMonth) : null,
      bullets: role.bullets.map((b) => ({ ...b, text: b.text.trim(), hasMetric: hasMetric(b.text) })),
    };
  });
  const projects = input.projects.map((project) => ({
    ...project,
    bullets: project.bullets.map((b) => ({ ...b, text: b.text.trim(), hasMetric: hasMetric(b.text) })),
  }));
  const draft: CvDraft = { ...input, experience, projects, computed: computeExperienceTotals(experience, now) };

  const index = groundingIndex(source.text);
  const evidence = buildEvidenceCatalog(draft, {
    isGrounded: (text) => index.found(text) || index.skillFound(text),
    pageOf: pageLocator(source.isPdf ? source.pages : []),
  });
  return { draft, evidence };
}

/**
 * After a profile edit of experience or project bullets: existing bullets keep their evidence id (so citations
 * stay valid), new bullets get the next free id, changed text is updated and re-checked against the CV.
 */
export function syncBulletEvidence(
  evidence: EvidenceItem[],
  entries: { bullets: { id: string; text: string }[] }[],
  kind: "experience_bullet" | "project_bullet",
  isGrounded: (text: string) => boolean,
): EvidenceItem[] {
  const section = kind === "experience_bullet" ? "experience" : "projects";
  let next = Math.max(0, ...evidence.map((e) => Number(e.id.slice(1)))) + 1;
  const kept = new Map(evidence.filter((e) => e.kind !== kind).map((e) => [e.id, e]));
  const previous = new Map(evidence.filter((e) => e.kind === kind).map((e) => [e.id, e]));
  const synced: EvidenceItem[] = [];
  const used = new Set<string>();
  entries.forEach((entry, entryIndex) => {
    for (const bullet of entry.bullets) {
      const before = previous.get(bullet.id);
      if (!before || used.has(bullet.id)) bullet.id = `E${next++}`;
      used.add(bullet.id);
      synced.push({
        id: bullet.id,
        kind,
        text: bullet.text,
        section,
        entry: entryIndex,
        page: before?.text === bullet.text ? before.page : null,
        grounded: before?.text === bullet.text ? before.grounded : isGrounded(bullet.text),
      });
    }
  });
  return [...kept.values(), ...synced].sort((a, b) => Number(a.id.slice(1)) - Number(b.id.slice(1)));
}
