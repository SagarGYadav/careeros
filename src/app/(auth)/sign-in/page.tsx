import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { serverEnv } from "@/server/env";
import { AuthFormSkeleton } from "../auth-form-skeleton";
import { RedirectIfSignedIn } from "../redirect-if-signed-in";
import { SignInForm } from "./sign-in-form";

export const metadata: Metadata = { title: "Sign in" };

export default function SignInPage() {
  const { ALLOW_SIGNUP } = serverEnv();

  return (
    <>
      <Suspense fallback={null}>
        <RedirectIfSignedIn />
      </Suspense>
      <Card>
        <CardHeader>
          <CardTitle as="h1">Sign in</CardTitle>
          <CardDescription>Welcome back to CareerOS.</CardDescription>
        </CardHeader>
        <CardContent>
          {/* The form reads ?next= from the URL, which is only known at request time. */}
          <Suspense fallback={<AuthFormSkeleton fields={2} />}>
            <SignInForm />
          </Suspense>
        </CardContent>
      </Card>
      {ALLOW_SIGNUP && (
        <p className="text-center text-sm text-muted-foreground">
          New to CareerOS?{" "}
          <Link href="/sign-up" className="text-foreground underline underline-offset-4">
            Create an account
          </Link>
        </p>
      )}
    </>
  );
}
