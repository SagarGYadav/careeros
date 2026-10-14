import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { Building2 } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { DiscoverButton, SitesTable, WatchlistForm } from "@/features/career-sites/company-sites";
import { getCurrentUser } from "@/server/auth/session";
import { listCareerSitesView } from "@/server/services/career-sites";
import { listTargetRoles } from "@/server/repositories/target-roles";

export const metadata: Metadata = { title: "Company sites" };

export default function CompanySitesPage() {
  return (
    <>
      <PageHeader
        title="Company sites"
        description="Company career sites and job boards (Greenhouse, Lever, Ashby and others) found by web search or added by you. Many openings exist only there."
      />
      <Suspense
        fallback={<Skeleton className="h-96 w-full rounded-xl" role="status" aria-label="Loading company sites" />}
      >
        <Sites />
      </Suspense>
    </>
  );
}

async function Sites() {
  // Relative "last read" times depend on the current time.
  await connection();
  const user = await getCurrentUser();
  const [sites, roles] = await Promise.all([listCareerSitesView(user.id), listTargetRoles(user.id)]);
  const hasRoles = roles.some((r) => r.selected);
  const discovered = sites.filter((s) => s.source === "discovered").length;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle as="h2">Find sites</CardTitle>
          <CardDescription>
            Searches the web for job boards of companies hiring for your selected roles and places, and looks up
            companies from your job-site results. Uses a few searches from the free web-search allowance.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <DiscoverButton disabled={!hasRoles && !sites.some((s) => s.status === "unresolved")} />
          {!hasRoles && (
            <p className="text-xs text-muted-foreground">
              Select a target role first, so discovery knows what to look for.
            </p>
          )}
          <WatchlistForm />
        </CardContent>
      </Card>

      {sites.length ? (
        <section aria-labelledby="sites" className="space-y-2">
          <h2 id="sites" className="text-sm font-semibold">
            {sites.length} site{sites.length === 1 ? "" : "s"}{" "}
            <span className="font-normal text-muted-foreground">
              ({discovered} found by web search, {sites.length - discovered} on your watchlist)
            </span>
          </h2>
          <SitesTable sites={sites} />
        </section>
      ) : (
        <EmptyState
          icon={Building2}
          title="No company sites yet"
          description="Discover sites for your target roles, or add a company you'd like to work for to your watchlist."
        />
      )}
    </div>
  );
}
