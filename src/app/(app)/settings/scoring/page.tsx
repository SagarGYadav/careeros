import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { PageHeader } from "@/components/page-header";
import { TrustBadge } from "@/components/trust-badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ScoringForm } from "@/features/settings/scoring-form";
import { getCurrentUser } from "@/server/auth/session";
import { getScoringSettings } from "@/server/services/scoring-settings";

export const metadata: Metadata = { title: "Scoring" };

export default function ScoringPage() {
  return (
    <>
      <nav aria-label="Breadcrumb" className="-mb-3 text-sm text-muted-foreground">
        <Link href="/settings" className="hover:text-foreground">
          Settings
        </Link>{" "}
        / Scoring
      </nav>
      <PageHeader
        title="Scoring"
        description="How the Fit score adds up and when a job is marked Apply, Consider or Low priority."
      />
      <Suspense fallback={<Skeleton className="h-96 w-full rounded-xl" />}>
        <Settings />
      </Suspense>
    </>
  );
}

async function Settings() {
  const user = await getCurrentUser();
  const settings = await getScoringSettings(user.id);
  return (
    <Card>
      <CardHeader>
        <CardTitle as="h2" className="flex items-center gap-2">
          Fit score <TrustBadge kind="calc" />
        </CardTitle>
        <CardDescription>
          {settings.isDefault
            ? "Using the default settings."
            : `Using your settings, version ${settings.version}. Analyses made earlier keep the version they used.`}{" "}
          The score is always calculated in code; AI only explains it.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ScoringForm
          key={settings.version}
          defaultValues={{ weights: settings.weights, thresholds: settings.thresholds }}
          isDefault={settings.isDefault}
        />
      </CardContent>
    </Card>
  );
}
