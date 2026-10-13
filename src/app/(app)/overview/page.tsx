import type { Metadata } from "next";
import { Suspense } from "react";
import { Circle, CircleCheck } from "lucide-react";
import { LinkButton } from "@/components/link-button";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { firstName } from "@/lib/format";
import { getCurrentUser } from "@/server/auth/session";
import { getOnboardingChecklist } from "@/server/services/onboarding";

export const metadata: Metadata = { title: "Overview" };

export default function OverviewPage() {
  return (
    <>
      <PageHeader title="Overview" description="How your job search is going." />
      <Suspense fallback={<Skeleton className="h-80 w-full rounded-xl" />}>
        <Welcome />
      </Suspense>
    </>
  );
}

async function Welcome() {
  const user = await getCurrentUser();
  const steps = await getOnboardingChecklist(user.id);
  const done = steps.filter((step) => step.done).length;
  const next = steps.find((step) => !step.done);

  return (
    <Card>
      <CardHeader>
        <CardTitle as="h2">Welcome, {firstName(user.name)}</CardTitle>
        <CardDescription>
          {next
            ? `Getting started: ${done} of ${steps.length} steps done.`
            : "You're set up. New matches appear in For you after each search."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {next ? (
          <ol className="space-y-3" aria-label="Getting started">
            {steps.map((step) => (
              <li key={step.id} className="flex items-start gap-3">
                {step.done ? (
                  <CircleCheck className="mt-0.5 size-5 shrink-0 text-success" aria-hidden="true" />
                ) : (
                  <Circle className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
                )}
                <div className="min-w-0 flex-1">
                  <p className={step.done ? "text-sm text-muted-foreground line-through" : "text-sm font-medium"}>
                    {step.title}
                    <span className="sr-only">{step.done ? " (done)" : " (to do)"}</span>
                  </p>
                  {!step.done && <p className="text-xs text-muted-foreground">{step.description}</p>}
                </div>
                {step === next && (
                  <LinkButton size="sm" href={step.href}>
                    {step.actionLabel}
                  </LinkButton>
                )}
              </li>
            ))}
          </ol>
        ) : (
          <div className="flex flex-wrap gap-2">
            <LinkButton href="/jobs">Open For you</LinkButton>
            <LinkButton variant="outline" href="/jobs/roles">
              Target roles
            </LinkButton>
          </div>
        )}
        {next && <p className="mt-4 text-xs text-muted-foreground">Steps tick themselves off as you go.</p>}
      </CardContent>
    </Card>
  );
}
