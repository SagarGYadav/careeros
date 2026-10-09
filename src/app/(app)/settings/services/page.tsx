import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ProviderChainTable, type ProviderRow } from "@/features/services/provider-chain-table";
import { loadAiProviders } from "@/server/ai/runner";
import { getAiServiceSummary } from "@/server/services/service-status";

export const metadata: Metadata = { title: "Services" };

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
      <Suspense fallback={<Skeleton className="h-64 w-full rounded-xl" />}>
        <AiServiceCard />
      </Suspense>
    </>
  );
}

async function AiServiceCard() {
  const [summary, { providers }] = await Promise.all([getAiServiceSummary(), loadAiProviders()]);
  const models = new Map(providers.map((p) => [p.name, [...new Set(Object.values(p.models))].join(" · ")]));
  const rows: ProviderRow[] = summary.providers.map((p) => ({
    ...p,
    until: p.until?.toISOString() ?? null,
    lastSuccessAt: p.lastSuccessAt?.toISOString() ?? null,
    models: models.get(p.name) ?? "",
  }));

  return (
    <Card>
      <CardHeader>
        <CardTitle as="h2">AI</CardTitle>
        <CardDescription>
          Reads your CV and writes analysis. Requests go to the first available provider in this order.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <ProviderChainTable service="ai" rows={rows} />
        <p className="text-xs text-muted-foreground">
          API keys are read from <code>.env</code> and never stored in the database. The chain comes from{" "}
          <code>AI_PROVIDERS</code>; order and on/off changes here apply to the whole app.
        </p>
      </CardContent>
    </Card>
  );
}
