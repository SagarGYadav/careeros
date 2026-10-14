// The Fit Report (SPEC §12.4). Every section says where it comes from: CALC (computed in code) or AI (FitAnalyst,
// with model and time). Evidence chips are rendered from the stored CV catalog, requirement chips from the stored
// requirements; claims the validator could not verify carry an "Unverified" badge.
import { AlertTriangle, CircleAlert, CircleCheck, CircleDashed, CircleMinus } from "lucide-react";
import { EvidenceChip } from "@/components/evidence-chip";
import { TrustBadge } from "@/components/trust-badge";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatLpa } from "@/lib/format";
import { ACTION_LABELS, MITIGATION_LABELS, RECOMMENDATION_LABELS } from "@/lib/fit-report/plain-text";
import type { Claim } from "@/lib/fit-report/schema";
import { COMPONENT_LABELS } from "@/lib/scoring/config";
import { cn } from "@/lib/utils";
import type { AnalysisView, JobView } from "@/server/services/job-view";

const RECOMMENDATION_VARIANT = { APPLY: "success", CONSIDER: "warning", LOW_PRIORITY: "outline" } as const;
const STATUS = {
  strong: { label: "Strong", icon: CircleCheck, className: "text-success" },
  partial: { label: "Partial", icon: CircleMinus, className: "text-warning" },
  missing: { label: "Missing", icon: CircleAlert, className: "text-destructive" },
  unclear: { label: "Unclear", icon: CircleDashed, className: "text-muted-foreground" },
  unscored: { label: "Not judged", icon: CircleDashed, className: "text-muted-foreground" },
} as const;
const IMPORTANCE_LABELS: Record<string, string> = {
  required: "Required",
  preferred: "Preferred",
  nice_to_have: "Nice to have",
  implied: "Implied",
};
const SEVERITY_VARIANT = { high: "destructive", medium: "warning", low: "outline" } as const;

type Context = {
  evidence: Record<string, string>;
  requirements: Map<string, string>;
  stats: Map<string, string>;
  issues: { path: string; message: string }[];
};

function Section({
  id,
  title,
  trust,
  model,
  at,
  children,
}: {
  id: string;
  title: string;
  trust: "calc" | "ai";
  model?: string | null;
  at?: string;
  children: React.ReactNode;
}) {
  return (
    <section aria-labelledby={id} className="space-y-3 rounded-xl border p-4" data-print-section>
      <h2 id={id} className="flex flex-wrap items-center gap-2 text-base font-semibold">
        {title}
        <TrustBadge kind={trust} model={model ?? undefined} generatedAt={at} />
      </h2>
      {children}
    </section>
  );
}

function Unverified({ path, ctx }: { path: string; ctx: Context }) {
  const problems = ctx.issues.filter((i) => i.path === path || i.path.startsWith(`${path}.`));
  if (!problems.length) return null;
  return (
    <Badge variant="warning" title={problems.map((p) => p.message).join(" ")}>
      Unverified
    </Badge>
  );
}

function Ids({ claim, ctx }: { claim: Pick<Claim, "evidenceIds" | "requirementIds" | "statIds">; ctx: Context }) {
  const chips = [
    ...claim.evidenceIds.filter((id) => ctx.evidence[id]).map((id) => ({ id, text: ctx.evidence[id] })),
    ...claim.requirementIds
      .filter((id) => ctx.requirements.has(id))
      .map((id) => ({ id, text: ctx.requirements.get(id)! })),
    ...claim.statIds.filter((id) => ctx.stats.has(id)).map((id) => ({ id, text: ctx.stats.get(id)! })),
  ];
  if (!chips.length) return null;
  return (
    <span className="ml-1 inline-flex flex-wrap gap-1 align-middle">
      {chips.map((c) => (
        <EvidenceChip key={c.id} id={c.id} text={c.text} />
      ))}
    </span>
  );
}

function ClaimLine({ claim, path, ctx, className }: { claim: Claim; path: string; ctx: Context; className?: string }) {
  return (
    <p className={cn("text-sm", className)}>
      {claim.text} <Ids claim={claim} ctx={ctx} /> <Unverified path={path} ctx={ctx} />
    </p>
  );
}

export function FitReportView({ view, analysis }: { view: JobView; analysis: AnalysisView }) {
  const report = analysis.report;
  const ctx: Context = {
    evidence: view.evidence,
    requirements: new Map(
      view.requirements.map((r) => [r.reqId, `${r.text} (${IMPORTANCE_LABELS[r.importance] ?? r.importance})`]),
    ),
    stats: new Map((report?.stats ?? []).map((s) => [s.id, s.text])),
    issues: analysis.validation?.issues ?? [],
  };
  const at = analysis.analysedAt;
  const aiModel = report?.mode === "no_ai" ? "Written without AI" : analysis.model;
  const assessed = new Map(analysis.assessments.map((a) => [a.reqId, a]));
  const aiAssessed = new Map((report?.requirements ?? []).map((a, i) => [a.reqId, { ...a, index: i }]));
  const salary = analysis.components.find((c) => c.key === "salary");

  return (
    <div className="space-y-4">
      {/* 1. Verdict */}
      <Section id="verdict" title="Verdict" trust="calc">
        <div className="flex flex-wrap items-center gap-4">
          <p className="text-4xl font-semibold tabular-nums">
            {analysis.scoreTotal}
            <span className="text-base font-normal text-muted-foreground"> / 100 Fit score</span>
          </p>
          <Badge variant={RECOMMENDATION_VARIANT[analysis.recommendation]} className="text-sm">
            {RECOMMENDATION_LABELS[analysis.recommendation]}
          </Badge>
          {report && (
            <span className="text-xs text-muted-foreground">
              Report confidence: <span className="font-medium">{report.confidence.level}</span>
              {report.confidence.reasons.length > 0 && ` (${report.confidence.reasons.join(" ")})`}
            </span>
          )}
        </div>
        {analysis.blockers.length > 0 && (
          <ul className="space-y-1 text-sm">
            {analysis.blockers.map((b) => (
              <li key={b.message} className="flex gap-1.5 text-destructive">
                <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                <span>
                  <span className="font-medium">Blocker:</span> {b.message}
                </span>
              </li>
            ))}
          </ul>
        )}
        {analysis.validation && analysis.validation.acceptedSemanticMatches.length > 0 && (
          <p className="text-xs text-muted-foreground">
            Includes {analysis.validation.acceptedSemanticMatches.length} skill match
            {analysis.validation.acceptedSemanticMatches.length === 1 ? "" : "es"} the report found under another name
            (AI inference); without them the score is {analysis.validation.codeOnlyTotal}.
          </p>
        )}
        {report && (
          <div className="space-y-1.5 border-t pt-3">
            <p className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
              Summary <TrustBadge kind="ai" model={aiModel ?? undefined} generatedAt={at} />
            </p>
            <ClaimLine claim={report.summary} path="summary" ctx={ctx} />
          </div>
        )}
      </Section>

      {report && (
        <Section id="role" title="Role decoded" trust="ai" model={aiModel} at={at}>
          <ClaimLine claim={report.roleDecoded.whatTheRoleIs} path="roleDecoded.whatTheRoleIs" ctx={ctx} />
          <ClaimLine claim={report.roleDecoded.seniority} path="roleDecoded.seniority" ctx={ctx} />
          {report.roleDecoded.technologyDepth.length > 0 && (
            <ul className="flex flex-wrap gap-1.5" aria-label="Depth expected per technology">
              {report.roleDecoded.technologyDepth.map((t) => (
                <li key={t.technology}>
                  <Badge variant="outline">
                    {t.technology}: {t.depth}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </Section>
      )}

      {/* 3. Requirements */}
      <Section id="requirements" title="Requirement by requirement" trust="calc">
        <p className="text-xs text-muted-foreground">
          Skill and experience statuses are calculated from your profile; the others are judged in the report from your
          CV (marked AI).
        </p>
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Requirement</TableHead>
                <TableHead>Your status</TableHead>
                <TableHead>Evidence and note</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {view.requirements.map((req) => {
                const code = assessed.get(req.reqId);
                const ai = aiAssessed.get(req.reqId);
                const byAi = !code || code.status === "unscored" || code.via === "semantic";
                const status = byAi ? (ai?.status ?? code?.status ?? "unscored") : code.status;
                const { label, icon: Icon, className } = STATUS[status];
                return (
                  <TableRow key={req.reqId}>
                    <TableCell className="align-top">
                      <span className="mr-1.5 font-mono text-xs text-muted-foreground">{req.reqId}</span>
                      <span className="font-medium">{req.text}</span>
                      <div className="text-xs text-muted-foreground">
                        {IMPORTANCE_LABELS[req.importance] ?? req.importance}
                      </div>
                    </TableCell>
                    <TableCell className="align-top">
                      <span className={cn("inline-flex items-center gap-1 text-sm", className)}>
                        <Icon className="size-4" aria-hidden="true" />
                        {label}
                      </span>
                      {byAi && ai && <div className="text-xs text-muted-foreground">AI</div>}
                      {code?.via === "semantic" && <div className="text-xs text-muted-foreground">AI inference</div>}
                    </TableCell>
                    <TableCell className="align-top text-sm whitespace-normal">
                      {code && code.status !== "unscored" && (
                        <p className="text-xs text-muted-foreground">{code.reason}</p>
                      )}
                      {ai && (
                        <p>
                          {ai.note}{" "}
                          <Ids
                            claim={{ evidenceIds: ai.evidenceIds, requirementIds: [], statIds: ai.statIds ?? [] }}
                            ctx={ctx}
                          />{" "}
                          <Unverified path={`requirements.${ai.index}`} ctx={ctx} />
                        </p>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </Section>

      {report && (
        <Section id="experience" title="Experience relevance" trust="ai" model={aiModel} at={at}>
          {report.matches.length > 0 && (
            <div className="space-y-1.5">
              <p className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                Duties matched to your CV by meaning <TrustBadge kind="calc" />
              </p>
              <ul className="space-y-1 text-sm">
                {report.matches.map((m) => (
                  <li key={m.responsibility}>
                    {m.responsibility} <span className="text-muted-foreground">↔</span>{" "}
                    <EvidenceChip id={m.evidenceId} text={view.evidence[m.evidenceId] ?? m.evidenceId} />{" "}
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {Math.round(m.similarity * 100)}% similar
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {report.experienceRelevance.roles.map((c, i) => (
            <ClaimLine key={i} claim={c} path={`experienceRelevance.roles.${i}`} ctx={ctx} />
          ))}
          <ClaimLine
            claim={report.experienceRelevance.domainAndScale}
            path="experienceRelevance.domainAndScale"
            ctx={ctx}
          />
        </Section>
      )}

      <Section id="score" title="Score breakdown and gains" trust="calc">
        <ul className="space-y-2">
          {analysis.components.map((c) => (
            <li key={c.key} className="space-y-1">
              <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
                <span className="font-medium">{COMPONENT_LABELS[c.key]}</span>
                <span className="tabular-nums">
                  {Math.round(c.points)} / {c.max}
                  {c.flagged && <span className="text-xs text-muted-foreground"> (unknown input, middle value)</span>}
                </span>
              </div>
              <div className="h-1.5 rounded-full bg-muted" aria-hidden="true">
                <div
                  className="h-full rounded-full bg-brand"
                  style={{ width: `${c.max ? (c.points / c.max) * 100 : 0}%` }}
                />
              </div>
              <p className="text-xs text-muted-foreground">{c.reason}</p>
            </li>
          ))}
        </ul>
        {analysis.gains.length > 0 && (
          <div className="space-y-1 border-t pt-3">
            <p className="text-sm font-medium">What would raise the score</p>
            <ul className="flex flex-wrap gap-1.5">
              {analysis.gains.map((g) => (
                <li key={g.skillName}>
                  <Badge variant="outline">
                    +{g.points} with {g.skillName}
                  </Badge>
                </li>
              ))}
            </ul>
            <p className="text-xs text-muted-foreground">Each skill re-scored as if you held it at level 3.</p>
          </div>
        )}
        <p className="text-xs text-muted-foreground">
          Scoring settings version {analysis.scoringConfigVersion === 0 ? "default" : analysis.scoringConfigVersion}.
        </p>
      </Section>

      <Section id="conditions" title="Conditions and logistics" trust="calc">
        {analysis.conditions.length ? (
          <ul className="space-y-1 text-sm">
            {analysis.conditions.map((c) => (
              <li key={c.key} className="flex gap-1.5">
                <Badge
                  variant={c.status === "blocker" ? "destructive" : c.status === "warning" ? "warning" : "outline"}
                >
                  {c.status === "ok" ? "OK" : c.status === "warning" ? "Check" : "Blocker"}
                </Badge>
                {c.message}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">
            The posting states no notice period, bond, shifts or office days.
          </p>
        )}
        {salary && <p className="text-sm">{salary.reason}</p>}
        <p className="text-sm">
          {analysis.salaryContext
            ? `Similar jobs (same role and city, last 90 days): median ${formatLpa(analysis.salaryContext.median)}, ${formatLpa(analysis.salaryContext.min)}–${formatLpa(analysis.salaryContext.max)}, from ${analysis.salaryContext.n} disclosed salaries.`
            : "Salary context needs at least 5 disclosed salaries for this role and city; there aren't enough yet."}
        </p>
      </Section>

      {report && (
        <>
          <Section id="recruiter" title="Recruiter's 30-second view" trust="ai" model={aiModel} at={at}>
            {report.recruiterView.standsOut.length > 0 && (
              <div className="space-y-1">
                <p className="text-sm font-medium">Stands out</p>
                {report.recruiterView.standsOut.map((c, i) => (
                  <ClaimLine key={i} claim={c} path={`recruiterView.standsOut.${i}`} ctx={ctx} />
                ))}
              </div>
            )}
            {report.recruiterView.redFlags.length > 0 && (
              <div className="space-y-1">
                <p className="text-sm font-medium">Red flags</p>
                {report.recruiterView.redFlags.map((c, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <Badge variant={SEVERITY_VARIANT[c.severity]}>{c.severity}</Badge>
                    <ClaimLine claim={c} path={`recruiterView.redFlags.${i}`} ctx={ctx} />
                  </div>
                ))}
              </div>
            )}
            {!report.recruiterView.standsOut.length && !report.recruiterView.redFlags.length && (
              <p className="text-sm text-muted-foreground">Nothing notable either way.</p>
            )}
          </Section>

          <Section id="ats" title="ATS keyword check" trust="calc">
            <p className="text-xs text-muted-foreground">
              Skill keywords from the posting found in your CV text, aliases included.
            </p>
            <div className="flex flex-wrap gap-1.5">
              {report.ats.present.map((k) => (
                <Badge key={k.keyword} variant="success">
                  <CircleCheck aria-hidden="true" /> {k.keyword}
                </Badge>
              ))}
              {report.ats.missing.map((k) => (
                <Badge key={k.keyword} variant="outline">
                  <span className="sr-only">Missing: </span>
                  {k.keyword}
                  {k.importance === "required" && " (required)"}
                </Badge>
              ))}
            </div>
          </Section>

          <Section id="risks" title="Risks and how to address them" trust="ai" model={aiModel} at={at}>
            {report.risks.length ? (
              <ul className="space-y-2">
                {report.risks.map((r, i) => (
                  <li key={i} className="space-y-0.5">
                    <ClaimLine claim={r} path={`risks.${i}`} ctx={ctx} />
                    <p className="text-xs text-muted-foreground">
                      {MITIGATION_LABELS[r.mitigation]}
                      {r.effort && ` · effort to learn: ${r.effort}`}
                    </p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">No gaps worth addressing.</p>
            )}
          </Section>

          <Section id="strategy" title="Application strategy" trust="ai" model={aiModel} at={at}>
            <p className="text-sm font-medium">
              {ACTION_LABELS[report.strategy.action]} <Unverified path="strategy.action" ctx={ctx} />
            </p>
            <ClaimLine claim={report.strategy.reasoning} path="strategy.reasoning" ctx={ctx} />
            {report.strategy.emphasise.length > 0 && (
              <div className="space-y-1">
                <p className="text-sm font-medium">Lead with</p>
                {report.strategy.emphasise.map((c, i) => (
                  <ClaimLine key={i} claim={c} path={`strategy.emphasise.${i}`} ctx={ctx} />
                ))}
              </div>
            )}
            {report.strategy.questions.length > 0 && (
              <div className="space-y-1">
                <p className="text-sm font-medium">Ask the recruiter</p>
                <ul className="list-disc space-y-0.5 pl-5 text-sm">
                  {report.strategy.questions.map((q) => (
                    <li key={q}>{q}</li>
                  ))}
                </ul>
              </div>
            )}
          </Section>
        </>
      )}
    </div>
  );
}
