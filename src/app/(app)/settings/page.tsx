import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { getCurrentUser } from "@/server/auth/session";
import { AppearanceSetting } from "./appearance-setting";
import { SignOutButton } from "./sign-out-button";

export const metadata: Metadata = { title: "Settings" };

export default function SettingsPage() {
  return (
    <>
      <PageHeader title="Settings" description="Your account and preferences." />
      <Card>
        <CardHeader>
          <CardTitle>Account</CardTitle>
          <CardDescription>Signed in with email and password.</CardDescription>
        </CardHeader>
        <CardContent>
          <Suspense fallback={<Skeleton className="h-16 w-full" />}>
            <AccountDetails />
          </Suspense>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Appearance</CardTitle>
          <CardDescription>Light, dark, or follow your system setting.</CardDescription>
        </CardHeader>
        <CardContent>
          <AppearanceSetting />
        </CardContent>
      </Card>
    </>
  );
}

async function AccountDetails() {
  const user = await getCurrentUser();
  return (
    <div className="flex flex-wrap items-center justify-between gap-4">
      <dl className="grid gap-1 text-sm">
        <div className="flex gap-2">
          <dt className="w-14 text-muted-foreground">Name</dt>
          <dd className="font-medium">{user.name}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="w-14 text-muted-foreground">Email</dt>
          <dd className="font-medium">{user.email}</dd>
        </div>
      </dl>
      <SignOutButton />
    </div>
  );
}
