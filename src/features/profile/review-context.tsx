"use client";

import { createContext, useContext, useState } from "react";
import { CircleAlert, Info } from "lucide-react";
import type { FlagIssue, VerificationFlag } from "@/lib/cv/verify";

// The review screen tells the section editors which fields were flagged by verification, and the editors tell
// the review screen which source quote to show when a field gets focus. Outside the review screen (profile
// pages) the defaults do nothing.

type ReviewContextValue = {
  flagsFor: (path: string | null) => VerificationFlag[];
  /** Flags on any item under a list path, e.g. every flagged technology of one role. */
  flagsUnder: (prefix: string | null) => VerificationFlag[];
  showSource: (quote: string | null) => void;
};

const ReviewContext = createContext<ReviewContextValue>({
  flagsFor: () => [],
  flagsUnder: () => [],
  showSource: () => {},
});

export function ReviewProvider({
  flags,
  onShowSource,
  children,
}: {
  flags: VerificationFlag[];
  onShowSource: (quote: string | null) => void;
  children: React.ReactNode;
}) {
  const [byPath] = useState(() => {
    const map = new Map<string, VerificationFlag[]>();
    for (const flag of flags) map.set(flag.path, [...(map.get(flag.path) ?? []), flag]);
    return map;
  });
  return (
    <ReviewContext.Provider
      value={{
        flagsFor: (path) => (path ? (byPath.get(path) ?? []) : []),
        flagsUnder: (prefix) => (prefix ? flags.filter((f) => f.path.startsWith(`${prefix}.`)) : []),
        showSource: onShowSource,
      }}
    >
      {children}
    </ReviewContext.Provider>
  );
}

export function useReview() {
  return useContext(ReviewContext);
}

/**
 * Keeps each array item's position from when the form loaded, so flags (stored by original index) stay on the
 * right item after the user removes or adds items. New items have no original index and no flags.
 */
export function useOriginIndex(fields: { id: string }[]) {
  const [origin] = useState(() => new Map(fields.map((field, index) => [field.id, index])));
  return (fieldId: string): number | null => origin.get(fieldId) ?? null;
}

const SEVERE: FlagIssue[] = ["not_found_in_cv", "date_unparsed", "date_order", "section_incomplete", "empty_field"];

/** Shows a field's verification flags under it. `id` lets the input point at it with aria-describedby. */
export function FieldFlags({ id, flags }: { id: string; flags: VerificationFlag[] }) {
  if (!flags.length) return null;
  return (
    <ul id={id} className="space-y-0.5">
      {flags.map((flag, index) => {
        const severe = SEVERE.includes(flag.issue);
        const Icon = severe ? CircleAlert : Info;
        return (
          <li key={index} className={`flex items-start gap-1 text-xs ${severe ? "text-warning" : "text-info"}`}>
            <Icon className="mt-px size-3.5 shrink-0" aria-hidden="true" />
            <span>
              {flag.message}
              {flag.issue === "overridden" && flag.value ? ` (${flag.value})` : ""}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/** True when a field needs the user's attention (for highlighting its input). */
export function needsAttention(flags: VerificationFlag[]) {
  return flags.some((f) => SEVERE.includes(f.issue));
}
