"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { ProgressSteps, type ProgressStep } from "@/components/progress-steps";
import { Button } from "@/components/ui/button";
import type { RunProgress } from "@/server/services/search-runs";

type ApiResult = { ok: true; data: RunProgress } | { ok: false; message: string };

async function post(url: string): Promise<RunProgress> {
  const response = await fetch(url, { method: "POST" });
  const result = (await response.json().catch(() => null)) as ApiResult | null;
  if (!result) throw new Error("The search service didn't answer. Try again.");
  if (!result.ok) throw new Error(result.message);
  return result.data;
}

function steps(p: RunProgress): ProgressStep[] {
  const searching = p.stage === "search";
  const order = ["search", "embed", "rank", "done"];
  const at = order.indexOf(p.stage);
  const status = (index: number) =>
    p.status === "failed" && index === at ? "error" : at > index ? "done" : at === index ? "running" : "pending";
  return [
    {
      id: "search",
      label: "Search job sites",
      status: status(0),
      detail: searching
        ? `Query ${Math.min(p.queriesDone + 1, p.queriesTotal)} of ${p.queriesTotal} · ${p.found} postings so far`
        : `${p.queriesTotal} queries · ${p.found} postings · ${p.newJobs} new · ${p.duplicates} duplicates merged`,
    },
    {
      id: "embed",
      label: "Compare descriptions with your profile",
      status: p.embeddingsDeferred && at > 1 ? "skipped" : status(1),
      detail: p.embeddingsDeferred
        ? "Skipped for now: no embedding service available. Ranking used the other parts."
        : p.embedded
          ? `${p.embedded} jobs compared`
          : undefined,
    },
    {
      id: "rank",
      label: "Rank by relevance",
      status: status(2),
      detail: p.rankTotal ? `${Math.min(p.ranked, p.rankTotal)} of ${p.rankTotal} jobs` : undefined,
    },
  ];
}

/** Runs a job search step by step (SPEC §11.5); a run left half-done resumes when the page opens again. */
export function FindJobsPanel({ activeRunId, canSearch }: { activeRunId: string | null; canSearch: boolean }) {
  const router = useRouter();
  const [progress, setProgress] = useState<RunProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const stopped = useRef(false);

  const drive = useCallback(
    async (start: () => Promise<RunProgress>) => {
      setBusy(true);
      setError(null);
      try {
        let current = await start();
        setProgress(current);
        while (current.status === "running" && !stopped.current) {
          current = await post(`/api/search-runs/${current.runId}/advance`);
          setProgress(current);
        }
        if (current.status === "done") router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "The search stopped. Try again.");
      } finally {
        setBusy(false);
      }
    },
    [router],
  );

  useEffect(() => {
    stopped.current = false;
    // Resume on the next tick: driving the run updates state, which must not happen during the effect itself.
    const timer = activeRunId
      ? setTimeout(() => void drive(() => post(`/api/search-runs/${activeRunId}/advance`)), 0)
      : null;
    return () => {
      stopped.current = true;
      if (timer) clearTimeout(timer);
    };
  }, [activeRunId, drive]);

  return (
    <div className="space-y-4 rounded-xl border p-4" aria-busy={busy}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">Find jobs</h2>
          <p className="text-xs text-muted-foreground">
            Searches job sites for your selected roles and locations, removes duplicates and ranks every job. You can
            leave this page; the search continues when you come back.
          </p>
        </div>
        <Button disabled={busy || !canSearch} onClick={() => void drive(() => post("/api/search-runs"))}>
          <Search aria-hidden="true" />
          {busy ? "Searching…" : "Find jobs"}
        </Button>
      </div>
      {!canSearch && <p className="text-xs text-muted-foreground">Select at least one role below to search for it.</p>}
      {progress && <ProgressSteps steps={steps(progress)} />}
      {progress && progress.errors.length > 0 && (
        <ul className="space-y-1 text-xs text-warning">
          {progress.errors.slice(-3).map((message, index) => (
            <li key={index}>{message}</li>
          ))}
        </ul>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
