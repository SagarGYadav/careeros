"use client";

import { ErrorState } from "@/components/error-state";

// Catches errors outside the app shell (e.g. auth pages). Server errors arrive with a generic message and a
// `digest` that matches the server log line, so no internal details reach the browser (SPEC §23).
export default function RootError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <ErrorState className="w-full max-w-md" reference={error.digest} onRetry={retry} />
    </main>
  );
}
