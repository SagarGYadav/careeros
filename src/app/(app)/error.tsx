"use client";

import { ErrorState } from "@/components/error-state";

// Errors inside the app keep the sidebar and header visible; only the page area shows the error.
export default function AppError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <ErrorState
      title="This page couldn't load."
      description="Your data is safe. Try again, and if it keeps happening, note the reference below."
      reference={error.digest}
      onRetry={retry}
    />
  );
}
