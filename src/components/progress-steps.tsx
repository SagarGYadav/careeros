import { CircleCheck, Circle, CircleMinus, CircleX, LoaderCircle } from "lucide-react";
import { cn } from "@/lib/utils";

export type StepStatus = "pending" | "running" | "done" | "error" | "skipped";

export type ProgressStep = {
  id: string;
  label: string;
  status: StepStatus;
  /** e.g. "14 of 60 pages" or the reason a step was skipped. */
  detail?: string;
};

const ICONS = {
  pending: { icon: Circle, className: "text-muted-foreground/50" },
  running: { icon: LoaderCircle, className: "animate-spin text-brand" },
  done: { icon: CircleCheck, className: "text-success" },
  error: { icon: CircleX, className: "text-destructive" },
  skipped: { icon: CircleMinus, className: "text-muted-foreground" },
} as const;

const STATUS_TEXT: Record<StepStatus, string> = {
  pending: "Waiting",
  running: "In progress",
  done: "Done",
  error: "Failed",
  skipped: "Skipped",
};

/** Step-by-step progress for long operations (SPEC §21), e.g. "Searching Adzuna ✓ · Reading 14 company sites…". */
export function ProgressSteps({ steps, className }: { steps: ProgressStep[]; className?: string }) {
  return (
    <ol className={cn("space-y-2", className)} aria-live="polite">
      {steps.map((step) => {
        const { icon: Icon, className: iconClass } = ICONS[step.status];
        return (
          <li key={step.id} className="flex items-start gap-2.5 text-sm">
            <Icon className={cn("mt-0.5 size-4 shrink-0", iconClass)} aria-hidden="true" />
            <div className="min-w-0">
              <span className={cn(step.status === "pending" && "text-muted-foreground")}>{step.label}</span>
              <span className="sr-only"> — {STATUS_TEXT[step.status]}</span>
              {step.detail && <p className="text-ui text-muted-foreground">{step.detail}</p>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
