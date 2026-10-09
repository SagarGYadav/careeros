"use client";

import { RotateCw, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Error message with a Retry action and an optional reference id for matching server logs. */
export function ErrorState({
  title = "Something went wrong.",
  description = "This part of the page couldn't load. Your data is safe.",
  reference,
  onRetry,
  className,
}: {
  title?: string;
  description?: string;
  reference?: string;
  onRetry?: () => void;
  className?: string;
}) {
  return (
    <div
      role="alert"
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-xl border border-destructive/30 bg-destructive/5 px-6 py-10 text-center",
        className,
      )}
    >
      <TriangleAlert className="size-6 text-destructive" aria-hidden="true" />
      <div className="max-w-md space-y-1">
        <h2 className="text-sm font-medium">{title}</h2>
        <p className="text-sm text-muted-foreground">{description}</p>
        {reference && <p className="font-mono text-xs text-muted-foreground">Reference: {reference}</p>}
      </div>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry}>
          <RotateCw />
          Try again
        </Button>
      )}
    </div>
  );
}
