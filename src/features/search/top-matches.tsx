import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { TrustBadge } from "@/components/trust-badge";
import { Badge } from "@/components/ui/badge";
import { formatRelative, formatSalaryRange } from "@/lib/format";
import type { ScorePart } from "@/lib/jobs/relevance";

export type MatchView = {
  id: string;
  title: string;
  companyName: string;
  city: string | null;
  workMode: string | null;
  score: number | null;
  parts: ScorePart[];
  salary: string | null;
  provider: string;
  postedVia: string | null;
  postedAt: string | null;
  direct: boolean;
  staffing: boolean;
  applyUrl: string | null;
  applySite: string | null;
};

const PART_LABELS: Record<ScorePart["key"], string> = {
  skills: "Skills",
  semantic: "Description",
  title: "Title",
  experience: "Experience",
  location: "Location",
  salary: "Salary",
};

export const salaryLabel = (min: number | null, max: number | null, disclosed: boolean) =>
  disclosed ? formatSalaryRange(min, max) : null;

/** The score badge; opening it shows how the score adds up, part by part, with any adjustments. */
export function Relevance({
  score,
  parts,
  adjustments = [],
}: {
  score: number | null;
  parts: ScorePart[];
  adjustments?: { points: number; reason: string }[];
}) {
  if (score === null) return <Badge variant="outline">Not ranked yet</Badge>;
  return (
    <details className="group text-right">
      <summary className="inline-flex cursor-pointer list-none items-center gap-1.5 rounded-md text-sm marker:hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
        <Badge variant={score >= 70 ? "success" : score >= 50 ? "warning" : "outline"}>
          <span className="tabular-nums">{score}</span>
        </Badge>
        <span className="text-xs text-muted-foreground underline-offset-2 group-open:underline">Relevance</span>
      </summary>
      <div className="mt-2 w-72 max-w-[80vw] space-y-1.5 rounded-lg border bg-popover p-3 text-left text-xs shadow-sm">
        <p className="flex items-center gap-1.5 font-medium">
          How the score adds up <TrustBadge kind="calc" />
        </p>
        <ul className="space-y-1">
          {parts.map((part) => (
            <li key={part.key} className="flex gap-2">
              <span className="w-20 shrink-0 text-muted-foreground">{PART_LABELS[part.key]}</span>
              <span className="w-14 shrink-0 tabular-nums">
                {part.value === null ? "—" : `${Math.round(part.points)} / ${Math.round(part.weight)}`}
              </span>
              <span>{part.reason}</span>
            </li>
          ))}
          {adjustments.map((adjustment) => (
            <li key={adjustment.reason} className="flex gap-2">
              <span className="w-20 shrink-0 text-muted-foreground">Adjusted</span>
              <span className="w-14 shrink-0 tabular-nums">{adjustment.points}</span>
              <span>{adjustment.reason}</span>
            </li>
          ))}
        </ul>
      </div>
    </details>
  );
}

/** The best matches of the latest run (the full feed with filters is the "For you" page). */
export function TopMatches({ matches, runFinishedAt }: { matches: MatchView[]; runFinishedAt: string | null }) {
  if (!matches.length) return null;
  return (
    <section aria-labelledby="top-matches" className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="top-matches" className="text-sm font-semibold">
          Best matches from your last search
        </h2>
        {runFinishedAt && (
          <p className="text-xs text-muted-foreground" suppressHydrationWarning>
            Searched {formatRelative(runFinishedAt)}
          </p>
        )}
      </div>
      <ul className="divide-y rounded-xl border">
        {matches.map((job) => (
          <li key={job.id} className="flex flex-wrap items-start gap-3 p-3">
            <div className="min-w-0 flex-1 space-y-1">
              <p className="font-medium">
                <Link href={`/jobs/${job.id}`} className="hover:underline">
                  {job.title}
                </Link>
              </p>
              <p className="text-sm text-muted-foreground">
                {job.companyName}
                {job.city && ` · ${job.city.replace("Remote-India", "Remote")}`}
                {job.workMode && job.city !== "Remote-India" && ` · ${job.workMode}`}
                {job.salary && ` · ${job.salary}`}
              </p>
              <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                {job.direct && <Badge variant="brand">Direct from company</Badge>}
                {job.staffing && <Badge variant="outline">Staffing agency</Badge>}
                {job.postedVia && <span>via {job.postedVia}</span>}
                {job.postedAt && <span suppressHydrationWarning>· {formatRelative(job.postedAt)}</span>}
                {job.provider === "adzuna" && (
                  <a href="https://www.adzuna.in" target="_blank" rel="noopener noreferrer" className="underline">
                    Jobs by Adzuna
                  </a>
                )}
              </div>
            </div>
            <div className="flex items-start gap-3">
              <Relevance score={job.score} parts={job.parts} />
              {job.applyUrl && (
                <a
                  href={job.applyUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex h-7 items-center gap-1 rounded-md border px-2 text-xs hover:bg-muted"
                >
                  Open
                  <ExternalLink className="size-3" aria-hidden="true" />
                  <span className="sr-only">
                    {job.title} at {job.companyName} on {job.applySite ?? "the job site"} (opens in a new tab)
                  </span>
                </a>
              )}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
