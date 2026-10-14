"use client";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

/** A CV evidence id (E3) that shows its exact text on hover or focus. Rendered from stored data, never AI text. */
export function EvidenceChip({ id, text }: { id: string; text: string }) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            type="button"
            className="inline-flex h-6 items-center rounded border px-1.5 font-mono text-[11px] text-muted-foreground hover:text-foreground"
          />
        }
      >
        {id}
        <span className="sr-only">: {text}</span>
      </TooltipTrigger>
      <TooltipContent className="max-w-80">{text}</TooltipContent>
    </Tooltip>
  );
}
