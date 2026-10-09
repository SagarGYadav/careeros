import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { CONFIDENCE_COPY, confidenceLevel, type ConfidenceLevel } from "@/lib/stats/confidence";

const VARIANT: Record<ConfidenceLevel, "outline" | "warning" | "info" | "success"> = {
  insufficient: "outline",
  early: "warning",
  moderate: "info",
  strong: "success",
};

/** Sample-size label shown next to every rate (SPEC §6): e.g. "Early signal · n = 12". */
export function ConfidenceLabel({ n, className }: { n: number; className?: string }) {
  const level = confidenceLevel(n);
  const { label, description } = CONFIDENCE_COPY[level];

  return (
    <Tooltip>
      <TooltipTrigger render={<Badge variant={VARIANT[level]} className={className} />}>
        {label}
        <span className="tabular-nums opacity-80">· n = {n}</span>
      </TooltipTrigger>
      <TooltipContent className="max-w-64">{description}</TooltipContent>
    </Tooltip>
  );
}
