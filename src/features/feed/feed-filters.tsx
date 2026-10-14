"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { POSTED_WITHIN_DAYS, WORK_MODES } from "@/lib/jobs/feed";

const SOURCE_LABELS: Record<string, string> = {
  adzuna: "Adzuna",
  jooble: "Jooble",
  serpapi: "Google Jobs",
  mock: "Mock",
};
const SALARY_STEPS_LPA = [5, 10, 15, 20, 30, 40, 60];

export type FeedFilterValues = {
  role: string;
  city: string;
  mode: string;
  posted: string;
  source: string;
  direct: boolean;
  analysed: boolean;
  salary: string;
};

const selectClass =
  "h-8 rounded-md border border-input bg-background px-2 text-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none";

function Select({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <label className="flex flex-col gap-1 text-xs text-muted-foreground">
      {label}
      <select className={selectClass} value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">Any</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

/** Filters live in the URL, so a filtered feed can be reloaded or bookmarked. Changing one goes back to page 1. */
export function FeedFilters({
  group,
  values,
  roles,
  cities,
  providers,
}: {
  group: string;
  values: FeedFilterValues;
  roles: { id: string; title: string }[];
  cities: string[];
  providers: string[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function apply(next: Partial<FeedFilterValues>) {
    const merged = { ...values, ...next };
    const params = new URLSearchParams();
    if (group !== "for_you") params.set("group", group);
    for (const key of ["role", "city", "mode", "posted", "source", "salary"] as const) {
      if (merged[key]) params.set(key, merged[key]);
    }
    if (merged.direct) params.set("direct", "1");
    if (merged.analysed) params.set("analysed", "1");
    const query = params.toString();
    startTransition(() => router.push(query ? `/jobs?${query}` : "/jobs"));
  }

  const active = Object.entries(values).some(([, v]) => Boolean(v));

  return (
    <div className="flex flex-wrap items-end gap-3" aria-busy={pending}>
      <Select
        label="Role"
        value={values.role}
        onChange={(role) => apply({ role })}
        options={roles.map((r) => ({ value: r.id, label: r.title }))}
      />
      <Select
        label="Location"
        value={values.city}
        onChange={(city) => apply({ city })}
        options={cities.map((c) => ({ value: c, label: c === "Remote-India" ? "Remote (India)" : c }))}
      />
      <Select
        label="Work mode"
        value={values.mode}
        onChange={(mode) => apply({ mode })}
        options={WORK_MODES.map((m) => ({ value: m, label: m[0].toUpperCase() + m.slice(1) }))}
      />
      <Select
        label="Posted"
        value={values.posted}
        onChange={(posted) => apply({ posted })}
        options={POSTED_WITHIN_DAYS.map((d) => ({
          value: String(d),
          label: d === 1 ? "Last 24 hours" : `Last ${d} days`,
        }))}
      />
      <Select
        label="Source"
        value={values.source}
        onChange={(source) => apply({ source })}
        options={providers.map((p) => ({ value: p, label: SOURCE_LABELS[p] ?? p }))}
      />
      <Select
        label="Salary at least"
        value={values.salary}
        onChange={(salary) => apply({ salary })}
        options={SALARY_STEPS_LPA.map((l) => ({ value: String(l), label: `₹${l} LPA` }))}
      />
      <label className="flex h-8 items-center gap-2 text-sm">
        <input
          type="checkbox"
          className="size-4 accent-primary"
          checked={values.direct}
          onChange={(e) => apply({ direct: e.target.checked })}
        />
        Direct from company
      </label>
      <label className="flex h-8 items-center gap-2 text-sm">
        <input
          type="checkbox"
          className="size-4 accent-primary"
          checked={values.analysed}
          onChange={(e) => apply({ analysed: e.target.checked })}
        />
        Analysed only
      </label>
      {active && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() =>
            apply({ role: "", city: "", mode: "", posted: "", source: "", salary: "", direct: false, analysed: false })
          }
        >
          Clear filters
        </Button>
      )}
    </div>
  );
}
