import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { CalendarClock, Circle, CircleCheck, Clock, Gift, MailQuestion, Send } from "lucide-react";
import { LinkButton } from "@/components/link-button";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { TodayAction } from "@/lib/applications/activity";
import { firstName, formatDate } from "@/lib/format";
import { getCurrentUser } from "@/server/auth/session";
import { getOnboardingChecklist } from "@/server/services/onboarding";
import { getTodaysActions } from "@/server/services/pipeline";

export const metadata: Metadata = { title: "Overview" };

export default function OverviewPage() {
  return (
    <>
      <PageHeader title="Overview" description="How your job search is going." />
      <Suspense fallback={<Skeleton className="h-40 w-full rounded-xl" />}>
        <TodaysActions />
      </Suspense>
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

const ACTION_ICONS: Record<TodayAction["kind"], typeof Clock> = {
  interview: CalendarClock,
  follow_up: Send,
  offer: Gift,
  ghosted: MailQuestion,
  idle: Clock,
};

/** Today's actions (SPEC §2, §13): interviews, follow-ups, offers and quiet applications, computed in code. */
async function TodaysActions() {
  // What's due depends on the current time.
  await connection();
  const user = await getCurrentUser();
  const { actions, openCount } = await getTodaysActions(user.id);
  if (openCount === 0 && actions.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle as="h2">Today&apos;s actions</CardTitle>
        <CardDescription>
          {actions.length
            ? `${actions.length} of your ${openCount} open applications need something from you.`
            : `Nothing due today across your ${openCount} open applications.`}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {actions.length > 0 ? (
          <ul className="divide-y" aria-label="Today's actions">
            {actions.slice(0, 8).map((action) => {
              const Icon = ACTION_ICONS[action.kind];
              return (
                <li key={action.applicationId} className="flex items-start gap-3 py-2 first:pt-0 last:pb-0">
                  <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/applications/${action.applicationId}`}
                      className="text-sm font-medium hover:underline"
                    >
                      {action.title}
                    </Link>
                    <p className="text-xs text-muted-foreground">
                      {action.detail}
                      {(action.kind === "interview" || action.kind === "follow_up") && ` · ${formatDate(action.dueAt)}`}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <LinkButton size="sm" variant="outline" href="/applications">
            Open applications
          </LinkButton>
        )}
      </CardContent>
    </Card>
  );
}
