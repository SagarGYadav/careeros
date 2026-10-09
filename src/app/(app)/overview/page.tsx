import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "@/components/page-header";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { firstName } from "@/lib/format";
import { getCurrentUser } from "@/server/auth/session";

export const metadata: Metadata = { title: "Overview" };

export default function OverviewPage() {
  return (
    <>
      <PageHeader title="Overview" description="How your job search is going." />
      <Suspense fallback={<Skeleton className="h-24 w-full rounded-xl" />}>
        <Welcome />
      </Suspense>
    </>
  );
}

async function Welcome() {
  const user = await getCurrentUser();
  return (
    <Card>
      <CardHeader>
        <CardTitle>Welcome, {firstName(user.name)}</CardTitle>
        <CardDescription>
          Your workspace is ready. Your job-search summary and next actions will appear here as you add your CV and
          start tracking jobs.
        </CardDescription>
      </CardHeader>
    </Card>
  );
}
