"use client";

import { useState } from "react";
import { toast } from "sonner";
import { ErrorState } from "@/components/error-state";
import { Button } from "@/components/ui/button";
import { toastWithUndo } from "@/lib/toast";

export function DesignInteractiveDemo() {
  const [dismissed, setDismissed] = useState(false);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          onClick={() => {
            setDismissed(true);
            toastWithUndo("Job dismissed", () => setDismissed(false));
          }}
        >
          Toast with undo
        </Button>
        <Button variant="outline" onClick={() => toast.error("The AI's free limit is used up for now.")}>
          Error toast
        </Button>
        <span className="self-center text-sm text-muted-foreground">State: {dismissed ? "dismissed" : "visible"}</span>
      </div>
      <ErrorState reference="a1b2c3d4" onRetry={() => toast.info("Retrying…")} />
    </div>
  );
}
