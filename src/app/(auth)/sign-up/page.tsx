import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { serverEnv } from "@/server/env";
import { RedirectIfSignedIn } from "../redirect-if-signed-in";
import { SignUpForm } from "./sign-up-form";

export const metadata: Metadata = { title: "Create account" };

export default function SignUpPage() {
  const { ALLOW_SIGNUP } = serverEnv();

  return (
    <>
      <Suspense fallback={null}>
        <RedirectIfSignedIn />
      </Suspense>
      <Card>
        <CardHeader>
          <CardTitle as="h1">{ALLOW_SIGNUP ? "Create your account" : "Sign-ups are closed"}</CardTitle>
          <CardDescription>
            {ALLOW_SIGNUP
              ? "Your CV, jobs and applications stay private to your account."
              : "This CareerOS instance isn't accepting new accounts."}
          </CardDescription>
        </CardHeader>
        {ALLOW_SIGNUP && (
          <CardContent>
            <SignUpForm />
          </CardContent>
        )}
      </Card>
      <p className="text-center text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link href="/sign-in" className="text-foreground underline underline-offset-4">
          Sign in
        </Link>
      </p>
    </>
  );
}
