import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";

export type TrustKind = "fact" | "calc" | "ai" | "external";

// Every section that shows information says where it came from (SPEC §21 "Trust"), so AI interpretation is never
// mistaken for a stored fact or a calculation.
const KINDS: Record<TrustKind, { label: string; description: string; className: string }> = {
  fact: {
    label: "Fact",
    description: "Comes directly from your records.",
    className: "border-border text-muted-foreground",
  },
  calc: {
    label: "Calc",
    description: "Calculated by CareerOS from your data. No AI involved.",
    className: "border-info/30 text-info",
  },
  ai: {
    label: "AI",
    description: "AI interpretation. Check it against the evidence shown with it.",
    className: "border-brand/30 text-brand",
  },
  external: {
    label: "Web",
    description: "From external sources, linked alongside.",
    className: "border-warning/40 text-warning",
  },
};

export function TrustBadge({
  kind,
  model,
  generatedAt,
  className,
}: {
  kind: TrustKind;
  /** For AI: the model that produced the content. */
  model?: string;
  generatedAt?: Date | string;
  className?: string;
}) {
  const { label, description, className: kindClass } = KINDS[kind];
  const provenance = [model, generatedAt ? formatDate(generatedAt) : undefined].filter(Boolean).join(" · ");

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <span
            className={cn(
              "inline-flex h-5 cursor-default items-center rounded border px-1.5 font-mono text-[10px] font-medium tracking-wide uppercase",
              kindClass,
              className,
            )}
          />
        }
      >
        {label}
        <span className="sr-only">: {description}</span>
      </TooltipTrigger>
      <TooltipContent className="max-w-64">
        <p>{description}</p>
        {provenance && <p className="mt-1 opacity-80">{provenance}</p>}
      </TooltipContent>
    </Tooltip>
  );
}
