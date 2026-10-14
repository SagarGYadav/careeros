"use client";

import { Copy, Printer } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

/** Print view and "Copy report" (SPEC §12.4 layout). */
export function ReportActions({ text }: { text: string }) {
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Report copied.");
    } catch {
      toast.error("Couldn't copy. Select the text and copy it instead.");
    }
  }
  return (
    <div className="flex flex-wrap gap-2" data-print-hide>
      <Button variant="outline" size="sm" onClick={() => window.print()}>
        <Printer aria-hidden="true" />
        Print
      </Button>
      <Button variant="outline" size="sm" onClick={() => void copy()}>
        <Copy aria-hidden="true" />
        Copy report
      </Button>
    </div>
  );
}
