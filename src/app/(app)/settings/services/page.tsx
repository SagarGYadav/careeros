import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ProviderChainTable, type ProviderRow } from "@/features/services/provider-chain-table";
import { getCurrentUser } from "@/server/auth/session";
import { getSearchUsage } from "@/server/services/feed";
import { SERVICES, getServiceSummary, type BuiltService } from "@/server/services/service-status";

export const metadata: Metadata = { title: "Services" };

const CARDS: { service: BuiltService; description: string; envVar: string }[] = [
  {
    service: "ai",
    description: "Reads your CV and writes analysis. Requests go to the first available provider in this order.",
    envVar: "AI_PROVIDERS",
  },
  {
    service: "job_search",
    description:
      "Finds openings on job sites. Each query goes to the first available provider; SerpApi also answers a few priority queries every run while its monthly allowance lasts.",
    envVar: "JOB_SEARCH_PROVIDERS",
  },
  {
    service: "embeddings",
    description:
      "Turns your profile and job descriptions into vectors for semantic matching. Every provider runs the same model, so their results can be compared.",
    envVar: "EMBEDDING_PROVIDERS",
  },
];

export default function ServicesPage() {
  return (
    <>
      <nav aria-label="Breadcrumb" className="-mb-3 text-sm text-muted-foreground">
        <Link href="/settings" className="hover:text-foreground">
          Settings
        </Link>{" "}
        / Services
      </nav>
      <PageHeader
        title="Services"
        description="Every outside service has a main provider and free backups. CareerOS switches automatically before a free limit runs out."
      />
      {CARDS.map((card) => (
        <Suspense key={card.service} fallback={<Skeleton className="h-64 w-full rounded-xl" />}>
          <ServiceCard {...card} />
        </Suspense>
      ))}
      <Suspense fallback={<Skeleton className="h-32 w-full rounded-xl" />}>
        <SearchUsageCard />
      </Suspense>
      <p className="text-xs text-muted-foreground">
        API keys are read from <code>.env</code> and never stored in the database. Order and on/off changes here apply
        to the whole app.
      </p>
    </>
  );
}

async function ServiceCard({ service, description, envVar }: (typeof CARDS)[number]) {
  const [summary, { providers }] = await Promise.all([getServiceSummary(service), SERVICES[service].load()]);
  const models = new Map(
    providers.map((p) => {
      const info = p as { models?: Record<string, string>; model?: string };
      return [p.name, info.models ? [...new Set(Object.values(info.models))].join(" · ") : (info.model ?? "")];
    }),
  );
  const rows: ProviderRow[] = summary.providers.map((p) => ({
    ...p,
    until: p.until?.toISOString() ?? null,
    lastSuccessAt: p.lastSuccessAt?.toISOString() ?? null,
    models: models.get(p.name) ?? "",
  }));

  return (
    <Card>
      <CardHeader>
        <CardTitle as="h2">{SERVICES[service].label}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <ProviderChainTable service={service} rows={rows} />
        <p className="text-xs text-muted-foreground">
          The chain comes from <code>{envVar}</code>.
        </p>
      </CardContent>
    </Card>
  );
}

const PROVIDER_LABELS: Record<string, string> = {
  adzuna: "Adzuna",
  jooble: "Jooble",
  serpapi: "SerpApi",
  mock: "Mock",
};

/** Your own job-search use this month, next to the chain limits above (SPEC §8.5). */
async function SearchUsageCard() {
  // "This month" depends on the current time, so this card renders per request.
  await connection();
  const user = await getCurrentUser();
  const usage = await getSearchUsage(user.id);
  const providers = Object.entries(usage.requests).sort((a, b) => b[1] - a[1]);
  return (
    <Card>
      <CardHeader>
        <CardTitle as="h2">Your searches this month</CardTitle>
        <CardDescription>Counted from your search runs since the 1st (UTC).</CardDescription>
      </CardHeader>
      <CardContent>
        {usage.runs === 0 ? (
          <p className="text-sm text-muted-foreground">No searches yet this month.</p>
        ) : (
          <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[auto_1fr]">
            <dt className="text-muted-foreground">Searches</dt>
            <dd className="tabular-nums">
              {usage.runs} ({usage.finishedRuns} finished)
            </dd>
            <dt className="text-muted-foreground">Requests</dt>
            <dd className="tabular-nums">
              {providers.length
                ? providers.map(([name, count]) => `${PROVIDER_LABELS[name] ?? name} ${count}`).join(" · ")
                : "None"}
            </dd>
            <dt className="text-muted-foreground">Postings found</dt>
            <dd className="tabular-nums">
              {usage.found} ({usage.newJobs} new)
            </dd>
          </dl>
        )}
      </CardContent>
    </Card>
  );
}
