import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { SquareKanban } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { LinkButton } from "@/components/link-button";
import { PageHeader } from "@/components/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { ApplicationsTable } from "@/features/applications/applications-table";
import { PipelineBoard } from "@/features/applications/pipeline-board";
import { cn } from "@/lib/utils";
import { getCurrentUser } from "@/server/auth/session";
import { getPipeline } from "@/server/services/pipeline";

export const metadata: Metadata = { title: "Applications" };

export default function ApplicationsPage({ searchParams }: PageProps<"/applications">) {
  return (
    <>
      <PageHeader
        title="Applications"
        description="Every job you applied to, by stage. Drag a card to a new stage, or open it for its timeline and rounds."
      />
      <Suspense fallback={<PipelineSkeleton />}>
        <Pipeline searchParams={searchParams} />
      </Suspense>
    </>
  );
}

function PipelineSkeleton() {
  return (
    <div
      className="grid grid-cols-[repeat(auto-fill,minmax(13rem,1fr))] gap-3"
      role="status"
      aria-busy="true"
      aria-label="Loading applications"
    >
      {Array.from({ length: 5 }, (_, i) => (
        <Skeleton key={i} className="h-80 rounded-xl" />
      ))}
    </div>
  );
}

async function Pipeline({ searchParams }: { searchParams: PageProps<"/applications">["searchParams"] }) {
  // Idle days depend on the current time.
  await connection();
  const [user, params] = await Promise.all([getCurrentUser(), searchParams]);
  const view = params.view === "table" ? "table" : "board";
  const { cards, saved } = await getPipeline(user.id);

  if (cards.length === 0 && saved.length === 0) {
    return (
      <EmptyState
        icon={SquareKanban}
        title="No applications yet"
        description="Apply on the job's own site, then use “Mark as applied” on the job page here. Saved jobs also show up on the board."
        action={<LinkButton href="/jobs">Open For you</LinkButton>}
      />
    );
  }

  return (
    <div className="space-y-4">
      <nav aria-label="View" className="inline-flex rounded-lg border p-0.5 text-sm">
        {(["board", "table"] as const).map((v) => (
          <Link
            key={v}
            href={v === "board" ? "/applications" : "/applications?view=table"}
            aria-current={view === v ? "page" : undefined}
            className={cn(
              "rounded-md px-3 py-1 font-medium",
              view === v ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {v === "board" ? "Board" : "Table"}
          </Link>
        ))}
      </nav>
      {view === "board" ? <PipelineBoard cards={cards} saved={saved} /> : <ApplicationsTable cards={cards} />}
    </div>
  );
}
