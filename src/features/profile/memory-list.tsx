"use client";

import { useState, useTransition } from "react";
import { Archive, ArchiveRestore, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { addFactAction, deleteFactAction, setFactStatusAction, updateFactAction } from "@/app/(app)/profile/actions";
import { EmptyState } from "@/components/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { formatRelative } from "@/lib/format";
import { CAREER_FACT_CATEGORIES, careerFactSchema } from "@/lib/validation/profile";
import { toastWithUndo } from "@/lib/toast";
import { NativeSelect } from "./inputs";

export type FactRow = {
  id: string;
  text: string;
  category: string;
  source: string;
  status: string;
  createdAt: string;
};

const categoryLabel = (value: string) => CAREER_FACT_CATEGORIES.find((c) => c.value === value)?.label ?? value;

function FactEditor({
  initial,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initial: { text: string; category: string };
  submitLabel: string;
  onSubmit: (fact: { text: string; category: string }) => Promise<boolean>;
  onCancel?: () => void;
}) {
  const [text, setText] = useState(initial.text);
  const [category, setCategory] = useState(initial.category);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <form
      className="space-y-2"
      onSubmit={(event) => {
        event.preventDefault();
        const parsed = careerFactSchema.safeParse({ text, category });
        if (!parsed.success) return setError(parsed.error.issues[0]?.message ?? "Check the fact.");
        setError(null);
        startTransition(async () => {
          if (await onSubmit(parsed.data)) {
            setText("");
          }
        });
      }}
    >
      <Textarea
        aria-label="Fact"
        placeholder="e.g. I won't relocate outside Maharashtra."
        value={text}
        aria-invalid={Boolean(error) || undefined}
        onChange={(event) => setText(event.target.value)}
      />
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <NativeSelect
          aria-label="Category"
          className="w-40"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
        >
          {CAREER_FACT_CATEGORIES.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </NativeSelect>
        <Button type="submit" size="sm" disabled={pending}>
          {submitLabel}
        </Button>
        {onCancel && (
          <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        )}
      </div>
    </form>
  );
}

function FactItem({ fact }: { fact: FactRow }) {
  const [editing, setEditing] = useState(false);
  const [pending, startTransition] = useTransition();
  const archived = fact.status === "archived";

  if (editing) {
    return (
      <li className="rounded-lg border p-3">
        <FactEditor
          initial={fact}
          submitLabel="Save"
          onCancel={() => setEditing(false)}
          onSubmit={async (values) => {
            const result = await updateFactAction({ id: fact.id, ...values });
            if (!result.ok) {
              toast.error(result.message);
              return false;
            }
            setEditing(false);
            return true;
          }}
        />
      </li>
    );
  }

  const setStatus = (status: "active" | "archived") =>
    startTransition(async () => {
      const result = await setFactStatusAction({ id: fact.id, status });
      if (!result.ok) return void toast.error(result.message);
      if (status === "archived") {
        toastWithUndo("Fact archived.", async () => {
          await setFactStatusAction({ id: fact.id, status: "active" });
        });
      }
    });

  return (
    <li className={`flex items-start gap-3 rounded-lg border p-3 ${archived ? "bg-muted/40" : ""}`}>
      <div className="min-w-0 flex-1 space-y-1">
        <p className={`text-sm whitespace-pre-wrap ${archived ? "text-muted-foreground" : ""}`}>{fact.text}</p>
        <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
          <Badge variant="outline">{categoryLabel(fact.category)}</Badge>
          {archived && <Badge variant="secondary">Archived</Badge>}
          <span title={new Date(fact.createdAt).toLocaleString("en-IN")} suppressHydrationWarning>
            Added {formatRelative(fact.createdAt)}
          </span>
        </div>
      </div>
      <div className="flex shrink-0 gap-1">
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Edit fact"
          onClick={() => setEditing(true)}
          disabled={pending}
        >
          <Pencil aria-hidden="true" />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={archived ? "Restore fact" : "Archive fact"}
          disabled={pending}
          onClick={() => setStatus(archived ? "active" : "archived")}
        >
          {archived ? <ArchiveRestore aria-hidden="true" /> : <Archive aria-hidden="true" />}
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Delete fact"
          disabled={pending}
          onClick={() => {
            if (!window.confirm("Delete this fact? This can't be undone.")) return;
            startTransition(async () => {
              const result = await deleteFactAction(fact.id);
              if (result.ok) toast.success("Fact deleted.");
              else toast.error(result.message);
            });
          }}
        >
          <Trash2 aria-hidden="true" />
        </Button>
      </div>
    </li>
  );
}

export function MemoryList({ facts }: { facts: FactRow[] }) {
  return (
    <div className="space-y-4">
      <div className="rounded-xl border p-4">
        <h2 className="mb-2 text-sm font-medium">Add a fact</h2>
        <FactEditor
          initial={{ text: "", category: "preference" }}
          submitLabel="Add fact"
          onSubmit={async (values) => {
            const result = await addFactAction(values);
            if (!result.ok) {
              toast.error(result.message);
              return false;
            }
            toast.success("Fact added.");
            return true;
          }}
        />
      </div>
      {facts.length ? (
        <ul className="space-y-2">
          {facts.map((fact) => (
            <FactItem key={fact.id} fact={fact} />
          ))}
        </ul>
      ) : (
        <EmptyState
          title="No facts yet"
          description="Facts are things CareerOS should always keep in mind: preferences, constraints, goals and strengths that aren't in your CV."
        />
      )}
    </div>
  );
}
