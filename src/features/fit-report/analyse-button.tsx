"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Sparkles } from "lucide-react";
import { ProgressSteps, type ProgressStep } from "@/components/progress-steps";
import { Button } from "@/components/ui/button";
import type { FitReportEvent } from "@/app/api/jobs/[jobId]/fit-report/route";
import type { FitReportStage } from "@/server/services/fit-report";

const STAGES: { id: FitReportStage; label: string }[] = [
  { id: "requirements", label: "Read the requirements and calculate the Fit score" },
  { id: "evidence", label: "Match the job's duties with your CV" },
  { id: "writing", label: "Write the report" },
  { id: "saving", label: "Check every claim and save" },
];

function steps(current: FitReportStage | null, failed: boolean): ProgressStep[] {
  const at = current ? STAGES.findIndex((s) => s.id === current) : -1;
  return STAGES.map((stage, i) => ({
    id: stage.id,
    label: stage.label,
    status: i < at ? "done" : i === at ? (failed ? "error" : "running") : "pending",
  }));
}

/** Writes the Fit Report with streamed progress (SPEC §21 long operations), then shows it. */
export function AnalyseButton({ jobId, again = false }: { jobId: string; again?: boolean }) {
  const router = useRouter();
  const [stage, setStage] = useState<FitReportStage | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setError(null);
    setStage(null);
    try {
      const response = await fetch(`/api/jobs/${jobId}/fit-report`, { method: "POST" });
      if (!response.body || !response.headers.get("content-type")?.includes("ndjson")) {
        const body = (await response.json().catch(() => null)) as { message?: string } | null;
        throw new Error(body?.message ?? "The analysis couldn't start. Try again.");
      }
      const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
      let buffer = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += value;
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines.filter(Boolean)) {
          const event = JSON.parse(line) as FitReportEvent;
          if ("type" in event && event.type === "stage") setStage(event.stage);
          else if ("type" in event && event.type === "done") router.refresh();
          else if ("ok" in event && !event.ok) throw new Error(event.message);
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "The analysis stopped. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3" data-print-hide>
      <Button onClick={() => void run()} disabled={busy} variant={again ? "outline" : "default"}>
        <Sparkles aria-hidden="true" />
        {busy ? "Analysing…" : again ? "Analyse again" : "Analyse fit"}
      </Button>
      {(busy || error) && <ProgressSteps steps={steps(stage ?? "requirements", Boolean(error))} />}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
