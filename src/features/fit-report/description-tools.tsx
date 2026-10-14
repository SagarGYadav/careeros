"use client";

import { useId, useState, useTransition } from "react";
import { FileText, Globe } from "lucide-react";
import { toast } from "sonner";
import { fetchDescriptionAction, replaceDescriptionAction } from "@/app/(app)/jobs/[jobId]/actions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

/**
 * A job board sent only part of the description (SPEC §12.1): read the full one from the job's own page, or paste
 * it. A report from a partial description is marked low confidence.
 */
export function DescriptionTools({ jobId, canFetch }: { jobId: string; canFetch: boolean }) {
  const [pasting, setPasting] = useState(false);
  const [text, setText] = useState("");
  const [pending, startTransition] = useTransition();
  const id = useId();

  return (
    <div className="space-y-3" data-print-hide>
      <div className="flex flex-wrap gap-2">
        {canFetch && (
          <Button
            size="sm"
            variant="outline"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const result = await fetchDescriptionAction({ jobId });
                if (result.ok) toast.success(`Full description read from ${result.data.site}.`);
                else toast.error(result.message);
              })
            }
          >
            <Globe aria-hidden="true" />
            Read full description from the job page
          </Button>
        )}
        <Button
          size="sm"
          variant="outline"
          disabled={pending}
          onClick={() => setPasting((v) => !v)}
          aria-expanded={pasting}
        >
          <FileText aria-hidden="true" />
          Paste full description
        </Button>
      </div>
      {pasting && (
        <form
          className="space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            startTransition(async () => {
              const result = await replaceDescriptionAction({ jobId, description: text });
              if (!result.ok) return void toast.error(result.message);
              toast.success("Description saved. Analyse again to update the report.");
              setPasting(false);
              setText("");
            });
          }}
        >
          <label htmlFor={id} className="text-sm font-medium">
            Full job description
          </label>
          <Textarea id={id} rows={10} value={text} onChange={(e) => setText(e.target.value)} />
          <Button type="submit" size="sm" disabled={pending || text.trim().length < 200}>
            Save description
          </Button>
        </form>
      )}
    </div>
  );
}
