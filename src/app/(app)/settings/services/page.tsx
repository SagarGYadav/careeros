import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ProviderChainTable, type ProviderRow } from "@/features/services/provider-chain-table";
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
