import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { AlertTriangle, ExternalLink } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ApplicationPanel } from "@/features/applications/application-panel";
import { AnalyseButton } from "@/features/fit-report/analyse-button";
import { DescriptionTools } from "@/features/fit-report/description-tools";
import { FitReportView } from "@/features/fit-report/fit-report";
import { ReportActions } from "@/features/fit-report/report-actions";
import { Relevance } from "@/features/search/top-matches";
import { isAppError } from "@/lib/errors";
import { formatDate, formatRelative } from "@/lib/format";
import { fitReportToText } from "@/lib/fit-report/plain-text";
import { getCurrentUser } from "@/server/auth/session";
import { getApplicationPanel, type ApplicationPanelView } from "@/server/services/applications";
import { getJobView, type JobView } from "@/server/services/job-view";

export const metadata: Metadata = { title: "Job" };

export default function JobPage({ params }: PageProps<"/jobs/[jobId]">) {
  return (
    <>
      <nav aria-label="Breadcrumb" className="-mb-3 text-sm text-muted-foreground" data-print-hide>
        <Link href="/jobs" className="hover:text-foreground">
          For you
        </Link>{" "}
        / Job
      </nav>
      <Suspense fallback={<JobSkeleton />}>
        <Job params={params} />
      </Suspense>
    </>
  );
}

function JobSkeleton() {
  return (
    <div className="space-y-4" role="status" aria-busy="true" aria-label="Loading the job">
      <Skeleton className="h-16 w-full max-w-2xl rounded-lg" />
      <Skeleton className="h-40 w-full rounded-xl" />
      <Skeleton className="h-80 w-full rounded-xl" />
    </div>
  );
}

function copyText(view: JobView): string | null {
  const analysis = view.analysis;
  if (!analysis?.report) return null;
  const ai = new Map(analysis.report.requirements.map((r) => [r.reqId, r]));
  const code = new Map(analysis.assessments.map((a) => [a.reqId, a]));
  return fitReportToText({
    title: view.job.title,
    company: view.job.companyName,
    scoreTotal: analysis.scoreTotal,
    recommendation: analysis.recommendation,
    components: analysis.components,
    gains: analysis.gains,
    conditions: analysis.conditions,
    requirements: view.requirements.map((r) => {
      const c = code.get(r.reqId);
      const a = ai.get(r.reqId);
      return {
        reqId: r.reqId,
        text: r.text,
        importance: r.importance,
        status: c && c.status !== "unscored" ? c.status : (a?.status ?? "not judged"),
        note: a?.note ?? c?.reason ?? "",
      };
    }),
    report: analysis.report,
  });
}

async function Job({ params }: { params: Promise<{ jobId: string }> }) {
  // Relative dates and the report's age depend on the current time.
  await connection();
  const [user, { jobId }] = await Promise.all([getCurrentUser(), params]);
  let view: JobView;
  let panel: ApplicationPanelView;
  try {
    [view, panel] = await Promise.all([getJobView(user.id, jobId), getApplicationPanel(user.id, jobId)]);
  } catch (error) {
    if (isAppError(error) && error.code === "NOT_FOUND") notFound();
    throw error;
  }
  const { job, analysis } = view;
  const text = copyText(view);

  return (
    <div className="space-y-4">
      <PageHeader
        title={job.title}
        description={[
          job.companyName,
          job.city?.replace("Remote-India", "Remote") ?? job.location,
          job.workMode,
          job.salary,
        ]
          .filter(Boolean)
          .join(" · ")}
      />
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        {job.direct && <Badge variant="brand">Direct from company site</Badge>}
        {job.staffing && <Badge variant="outline">Staffing agency</Badge>}
        {job.stale && <Badge variant="outline">Older than 30 days</Badge>}
        {job.origin !== "search" && <Badge variant="outline">Added by you</Badge>}
        <span>
          {job.postedVia ? `via ${job.postedVia}` : job.provider !== "manual" && `from ${job.provider}`}
          {job.postedAt && <span suppressHydrationWarning> · posted {formatRelative(job.postedAt)}</span>}
          <span suppressHydrationWarning>
            {" "}
            · found {formatDate(job.foundAt)} · last seen in a search {formatDate(job.lastSeenAt)}
          </span>
        </span>
        {job.provider === "adzuna" && (
          <a href="https://www.adzuna.in" target="_blank" rel="noopener noreferrer" className="underline">
            Jobs by Adzuna
          </a>
        )}
        {!analysis && <Relevance score={job.relevance} parts={job.relevanceParts} />}
      </div>
      {job.applyLinks.length > 0 && (
        <div className="flex flex-wrap gap-2" data-print-hide>
          {job.applyLinks.slice(0, 4).map((link) => (
            <a
              key={link.url}
              href={link.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-8 items-center gap-1.5 rounded-md border px-3 text-sm font-medium hover:bg-muted"
            >
              Open on {link.site}
              <ExternalLink className="size-3.5" aria-hidden="true" />
              <span className="sr-only">(opens in a new tab)</span>
            </a>
          ))}
        </div>
      )}
      <ApplicationPanel jobId={job.id} panel={panel} />
      {job.closedAt && (
        <p className="flex gap-1.5 text-sm text-warning">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span suppressHydrationWarning>
            <span className="font-medium">Closed.</span> The company removed this posting from its careers site (noticed{" "}
            {formatDate(job.closedAt)}). It reopens here if the company lists it again.
          </span>
        </p>
      )}
      {job.notFitReasons.length > 0 && (
        <p className="flex gap-1.5 text-sm text-warning">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>
            <span className="font-medium">Not a fit:</span> {job.notFitReasons.join(" ")}
          </span>
        </p>
      )}
      {job.injectionSuspected && (
        <p className="text-sm text-warning">
          This posting contains text that looks like instructions to an AI. It was treated as plain text.
        </p>
      )}
      {job.descriptionTruncated && (
        <div className="space-y-2 rounded-xl border border-warning/40 p-4">
          <p className="flex gap-1.5 text-sm">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />
            <span>
              <span className="font-medium">Partial description.</span> The job site sent only part of it, so the
              requirements and the report may miss things.
            </span>
          </p>
          <DescriptionTools jobId={job.id} canFetch={job.applyLinks.length > 0} />
        </div>
      )}

      {analysis ? (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground" suppressHydrationWarning>
              Analysed {formatRelative(analysis.analysedAt)}
              {!analysis.report && " (score only; the report wasn't written yet)"}
            </p>
            <div className="flex flex-wrap items-start gap-2">
              {text && <ReportActions text={text} />}
              <AnalyseButton jobId={job.id} again />
            </div>
          </div>
          <FitReportView view={view} analysis={analysis} />
        </>
      ) : (
        <section className="space-y-3 rounded-xl border p-4" aria-labelledby="no-report">
          <h2 id="no-report" className="text-base font-semibold">
            Fit Report
          </h2>
          <p className="text-sm text-muted-foreground">
            Reads every requirement of this job, scores your fit in code and writes a report that cites your CV for each
            claim. Uses two or three AI requests from the free daily allowance.
          </p>
          <AnalyseButton jobId={job.id} />
        </section>
      )}

      <details className="rounded-xl border p-4" data-print-hide>
        <summary className="cursor-pointer text-sm font-medium">Job description</summary>
        <div className="mt-3 text-sm whitespace-pre-line text-muted-foreground">{job.description}</div>
      </details>
    </div>
  );
}
