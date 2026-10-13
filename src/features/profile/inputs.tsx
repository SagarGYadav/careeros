"use client";

import { useId, useState } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

const CONTROL =
  "w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 text-base transition-colors outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm dark:bg-input/30";

/** A native select styled like the inputs: accessible and reliable inside large forms. */
export function NativeSelect({ className, children, ...props }: React.ComponentProps<"select">) {
  return (
    <select className={cn(CONTROL, "h-8 py-1", className)} {...props}>
      {children}
    </select>
  );
}

/**
 * Edits a list of short strings (technologies, locations) as removable chips. Enter or comma adds; pasting a
 * comma-separated list adds every item.
 */
export function TagsInput({
  id,
  value,
  onChange,
  onFocus,
  placeholder,
  "aria-describedby": describedBy,
  "aria-label": ariaLabel,
  itemName = "",
}: {
  id?: string;
  value: string[];
  onChange: (value: string[]) => void;
  onFocus?: () => void;
  placeholder?: string;
  "aria-describedby"?: string;
  "aria-label"?: string;
  /** Names the items in remove-button labels ("Remove keyword React"), so they differ from other buttons. */
  itemName?: string;
}) {
  const [draft, setDraft] = useState("");
  const fallbackId = useId();
  const inputId = id ?? fallbackId;

  const add = (text: string) => {
    const items = text
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
    const lower = new Set(value.map((v) => v.toLowerCase()));
    const next = [...value, ...items.filter((item) => !lower.has(item.toLowerCase()))];
    if (next.length !== value.length) onChange(next);
    setDraft("");
  };

  return (
    <div
      className={cn(
        CONTROL,
        "flex min-h-8 flex-wrap items-center gap-1 px-1.5 py-1 focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50",
      )}
    >
      {value.map((item, index) => (
        <span key={`${item}-${index}`} className="inline-flex items-center rounded-md bg-muted pl-1.5 text-xs">
          {item}
          <button
            type="button"
            // 24px target (WCAG 2.5.8) inside a compact chip.
            className="inline-flex size-6 items-center justify-center rounded-sm text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            aria-label={`Remove ${itemName ? `${itemName} ` : ""}${item}`}
            onClick={() => onChange(value.filter((_, i) => i !== index))}
          >
            <X className="size-3" aria-hidden="true" />
          </button>
        </span>
      ))}
      <input
        id={inputId}
        className="h-6 min-w-24 flex-1 bg-transparent px-1 text-sm outline-none placeholder:text-muted-foreground"
        value={draft}
        placeholder={value.length ? undefined : placeholder}
        aria-describedby={describedBy}
        aria-label={ariaLabel}
        onFocus={onFocus}
        onChange={(event) => {
          const text = event.target.value;
          if (text.includes(",")) add(text);
          else setDraft(text);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            if (draft.trim()) add(draft);
          } else if (event.key === "Backspace" && !draft && value.length) {
            onChange(value.slice(0, -1));
          }
        }}
        onBlur={() => draft.trim() && add(draft)}
      />
    </div>
  );
}

/** Converts between a number input's text and number | null for react-hook-form. */
export const numberOrNull = (value: unknown) => {
  if (value === "" || value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};
