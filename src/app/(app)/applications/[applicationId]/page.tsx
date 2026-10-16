import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { ExternalLink } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { ApplicationDetail } from "@/features/applications/application-detail";
import { isAppError } from "@/lib/errors";
import { getCurrentUser } from "@/server/auth/session";
import { getApplicationPage, type ApplicationDetailView } from "@/server/services/pipeline";

export const metadata: Metadata = { title: "Application" };

export default function ApplicationPage({ params }: PageProps<"/applications/[applicationId]">) {
  return (
    <>
      <nav aria-label="Breadcrumb" className="-mb-3 text-sm text-muted-foreground">
        <Link href="/applications" className="hover:text-foreground">
          Applications
        </Link>{" "}
        / Application
      </nav>
      <Suspense
        fallback={
          <div className="space-y-4" role="status" aria-busy="true" aria-label="Loading the application">
            <Skeleton className="h-16 w-full max-w-2xl rounded-lg" />
            <Skeleton className="h-60 w-full rounded-xl" />
          </div>
        }
      >
        <Application params={params} />
      </Suspense>
    </>
  );
}

async function Application({ params }: { params: Promise<{ applicationId: string }> }) {
  // Idle days depend on the current time.
  await connection();
  const [user, { applicationId }] = await Promise.all([getCurrentUser(), params]);
  let view: ApplicationDetailView;
  try {
    view = await getApplicationPage(user.id, applicationId);
  } catch (error) {
    if (isAppError(error) && error.code === "NOT_FOUND") notFound();
    throw error;
  }
  const job = view.snapshot.job;

  return (
    <div className="space-y-4">
      <PageHeader
        title={job.title}
        description={[job.companyName, job.location, job.workMode, job.salary].filter(Boolean).join(" · ")}
      />
      <div className="flex flex-wrap gap-2">
        {view.jobId && (
          <Link
            href={`/jobs/${view.jobId}`}
            className="inline-flex h-8 items-center rounded-md border px-3 text-sm font-medium hover:bg-muted"
          >
            Job and Fit Report
          </Link>
        )}
        {view.applyLinks.slice(0, 2).map((link) => (
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
      <ApplicationDetail view={view} />
    </div>
  );
}
