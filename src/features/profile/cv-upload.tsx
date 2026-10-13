"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FileUp } from "lucide-react";
import { ProgressSteps, type ProgressStep, type StepStatus } from "@/components/progress-steps";
import { Button } from "@/components/ui/button";
import type { CvUploadEvent } from "@/app/api/cv/upload/route";
import { cn } from "@/lib/utils";

const MAX_BYTES = 5 * 1024 * 1024;
const ACCEPT = ".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document";

type StepId = "upload" | "read" | "extract" | "verify" | "retry";
const STEPS: { id: StepId; label: string }[] = [
  { id: "upload", label: "Upload the file" },
  { id: "read", label: "Read text and links" },
  { id: "extract", label: "Extract your details" },
  { id: "verify", label: "Check every field against the CV" },
  { id: "retry", label: "Re-read sections that look incomplete" },
];

// Which steps are finished when the server reports a stage.
const DONE_AT: Record<string, StepId[]> = {
  stored: ["upload"],
  parsing: ["upload", "read"],
  verifying: ["upload", "read", "extract"],
  second_pass: ["upload", "read", "extract", "verify"],
  saved: ["upload", "read", "extract", "verify"],
};

function stepsFor(stage: string | null, failed: boolean, retried: boolean): ProgressStep[] {
  const done = new Set(stage ? DONE_AT[stage] : []);
  let runningGiven = false;
  return STEPS.map((step) => {
    let status: StepStatus = done.has(step.id) ? "done" : "pending";
    if (step.id === "retry")
      status = retried ? (stage === "saved" ? "done" : "running") : stage === "saved" ? "skipped" : "pending";
    if (status === "pending" && !runningGiven && stage !== null) {
      status = failed ? "error" : "running";
      runningGiven = true;
    }
    return { ...step, status };
  });
}

/** Upload with step-by-step progress; on success opens the review screen. */
export function CvUpload() {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState<string | null>(null);
  const [retried, setRetried] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  async function upload(file: File) {
    setError(null);
    if (!/\.(pdf|docx)$/i.test(file.name)) return setError("Upload a PDF or DOCX file.");
    if (file.size > MAX_BYTES) return setError("That file is larger than 5 MB.");
    setBusy(true);
    setStage(null);
    setRetried(false);
    try {
      const body = new FormData();
      body.append("file", file);
      const response = await fetch("/api/cv/upload", { method: "POST", body });
      if (!response.ok || !response.body) {
        const result = (await response.json().catch(() => null)) as { message?: string } | null;
        throw new Error(result?.message ?? "The upload failed. Try again.");
      }
      setStage("uploading");
      const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
      let buffer = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += value;
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines.filter(Boolean)) {
          const event = JSON.parse(line) as CvUploadEvent;
          if ("ok" in event) throw new Error(event.message);
          if (event.type === "stage") {
            if (event.stage === "second_pass") setRetried(true);
            setStage(event.stage);
          } else if (event.type === "done") {
            router.push(`/profile/cv/${event.resumeId}`);
            return;
          }
        }
      }
      throw new Error("The upload stopped before it finished. Try again.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "The upload failed. Try again.");
      setBusy(false);
    }
  }

  if (busy || (stage && error)) {
    return (
      <div className="space-y-4 rounded-xl border p-6" aria-busy={busy}>
        <div className="space-y-0.5">
          <h2 className="text-sm font-medium">Reading your CV</h2>
          {!error && (
            <p className="text-xs text-muted-foreground">
              Usually under a minute. You can leave this page: the CV will be waiting in Career profile to review.
            </p>
          )}
        </div>
        <ProgressSteps steps={stepsFor(stage === "uploading" ? null : stage, Boolean(error), retried)} />
        {error && (
          <div className="space-y-3">
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
            <Button
              variant="outline"
              onClick={() => {
                setStage(null);
                setError(null);
              }}
            >
              Choose another file
            </Button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed px-6 py-12 text-center transition-colors",
        dragging && "border-brand bg-brand/5",
      )}
      onDragOver={(event) => {
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(event) => {
        event.preventDefault();
        setDragging(false);
        const file = event.dataTransfer.files[0];
        if (file) void upload(file);
      }}
    >
      <div className="flex size-10 items-center justify-center rounded-lg bg-muted text-muted-foreground">
        <FileUp className="size-5" aria-hidden="true" />
      </div>
      <div className="max-w-sm space-y-1">
        <h2 className="text-sm font-medium">Upload your CV</h2>
        <p className="text-sm text-muted-foreground">
          PDF or DOCX, up to 5 MB. You&apos;ll check everything CareerOS reads before it&apos;s saved.
        </p>
      </div>
      <input
        ref={input}
        type="file"
        accept={ACCEPT}
        className="sr-only"
        aria-label="CV file"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) void upload(file);
        }}
      />
      <Button onClick={() => input.current?.click()}>Choose file</Button>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
