import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { Briefcase, SearchX } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { LinkButton } from "@/components/link-button";
import { PageHeader } from "@/components/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { FeedFilters, type FeedFilterValues } from "@/features/feed/feed-filters";
import { FeedList } from "@/features/feed/feed-list";
import { FEED_GROUPS, FEED_GROUP_LABELS, hasActiveFilters, parseFeedQuery, type FeedGroup } from "@/lib/jobs/feed";
import { cn } from "@/lib/utils";
import { getCurrentUser } from "@/server/auth/session";
import { getFeed } from "@/server/services/feed";

export const metadata: Metadata = { title: "For you" };

type SearchParams = Record<string, string | string[] | undefined>;

export default function ForYouPage({ searchParams }: PageProps<"/jobs">) {
  return (
    <>
      <PageHeader
        title="For you"
        description="Jobs from your searches, ranked by how well they match your profile. Jobs that don't fit are kept, just out of the way."
      />
      <Suspense fallback={<FeedSkeleton />}>
        <Feed searchParams={searchParams} />
      </Suspense>
    </>
  );
}

function FeedSkeleton() {
  return (
    <div className="space-y-3" role="status" aria-busy="true" aria-label="Loading jobs">
      <Skeleton className="h-9 w-full max-w-xl rounded-lg" />
      <Skeleton className="h-14 w-full rounded-lg" />
      {Array.from({ length: 4 }, (_, i) => (
        <Skeleton key={i} className="h-40 w-full rounded-xl" />
      ))}
    </div>
  );
}

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value) ?? "";

/** The current URL with some params changed; empty values are dropped and page 1 is left implicit. */
function feedHref(params: SearchParams, changes: Record<string, string | null>) {
  const next = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) if (first(value)) next.set(key, first(value));
  for (const [key, value] of Object.entries(changes)) {
    if (value) next.set(key, value);
    else next.delete(key);
  }
  if (next.get("group") === "for_you") next.delete("group");
  if (next.get("page") === "1") next.delete("page");
  const query = next.toString();
  return query ? `/jobs?${query}` : "/jobs";
}

async function Feed({ searchParams }: { searchParams: Promise<SearchParams> }) {
  // "Posted in the last N days" and the "New" badges compare with the current time, so this renders per request.
  await connection();
  const [user, params] = await Promise.all([getCurrentUser(), searchParams]);
  const query = parseFeedQuery(params);
  const feed = await getFeed(user.id, query);
  const group = query.filters.group;

  if (!feed.hasJobs) {
    return (
      <EmptyState
        icon={Briefcase}
        title="No jobs yet"
        description="Choose the roles you want on the Target roles page and run a search. Every job found is ranked and appears here."
        action={<LinkButton href="/jobs/roles">Go to Target roles</LinkButton>}
      />
    );
  }

  const values: FeedFilterValues = {
    role: first(params.role),
    city: first(params.city),
    mode: first(params.mode),
    posted: first(params.posted),
    source: first(params.source),
    direct: first(params.direct) === "1",
    salary: first(params.salary),
  };
  const shown: FeedGroup[] = ["for_you", "saved"];
  const hidden = FEED_GROUPS.filter((g) => !shown.includes(g));

  const groupLink = (g: FeedGroup) => (
    <Link
      key={g}
      href={feedHref(params, { group: g, page: null })}
      aria-current={g === group ? "page" : undefined}
      className={cn(
        "inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-sm hover:bg-muted",
        g === group && "bg-muted font-medium",
      )}
    >
      {FEED_GROUP_LABELS[g]}
      <span className="text-xs text-muted-foreground tabular-nums">{feed.counts[g]}</span>
    </Link>
  );

  return (
    <div className="space-y-4">
      <nav aria-label="Job groups" className="space-y-1.5">
        <div className="flex flex-wrap gap-1">{shown.map(groupLink)}</div>
        <div className="flex flex-wrap items-center gap-1">
          <span className="mr-1 text-xs text-muted-foreground">Hidden:</span>
          {hidden.map(groupLink)}
        </div>
      </nav>

      <FeedFilters
        group={group}
        values={values}
        roles={feed.roles}
        cities={feed.facets.cities}
        providers={feed.facets.providers}
      />

      {feed.cards.length === 0 ? (
        <EmptyState
          icon={SearchX}
          title={
            hasActiveFilters(query.filters) ? "No jobs match these filters" : `Nothing in "${FEED_GROUP_LABELS[group]}"`
          }
          description={
            hasActiveFilters(query.filters)
              ? "Try removing a filter."
              : group === "for_you"
                ? "Every job found so far is in one of the hidden groups. Run another search or widen your target roles."
                : "Jobs appear here when they belong to this group."
          }
        />
      ) : (
        <>
          <p className="text-sm text-muted-foreground" aria-live="polite">
            {feed.total} {feed.total === 1 ? "job" : "jobs"}
            {feed.pageCount > 1 && ` · page ${feed.page} of ${feed.pageCount}`}
          </p>
          <FeedList key={`${group}:${feed.page}`} cards={feed.cards} group={group} />
          {feed.pageCount > 1 && (
            <nav aria-label="Pages" className="flex items-center justify-between gap-3">
              {feed.page > 1 ? (
                <LinkButton variant="outline" href={feedHref(params, { page: String(feed.page - 1) })}>
                  Previous page
                </LinkButton>
              ) : (
                <span />
              )}
              <span className="text-sm text-muted-foreground">
                Page {feed.page} of {feed.pageCount}
              </span>
              {feed.page < feed.pageCount ? (
                <LinkButton variant="outline" href={feedHref(params, { page: String(feed.page + 1) })}>
                  Next page
                </LinkButton>
              ) : (
                <span />
              )}
            </nav>
          )}
        </>
      )}
    </div>
  );
}
