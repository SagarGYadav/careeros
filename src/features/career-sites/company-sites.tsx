"use client";

import { useId, useState, useTransition } from "react";
import { ExternalLink, Radar, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { addToWatchlistAction, discoverSitesAction, removeSiteAction } from "@/app/(app)/jobs/company-sites/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { SITE_KIND_LABELS, type SiteKind } from "@/lib/careersites/ats";
import { formatRelative } from "@/lib/format";
import type { CareerSiteView } from "@/server/services/career-sites";

const STATUS: Record<string, { label: string; variant: "outline" | "warning" | "success" | "destructive" }> = {
  active: { label: "Active", variant: "success" },
  unresolved: { label: "Looking for it", variant: "warning" },
  no_relevant_jobs: { label: "No matching jobs", variant: "outline" },
  blocked_by_robots: { label: "Site asks not to be read", variant: "outline" },
  failed: { label: "Couldn't be read", variant: "destructive" },
};

export function DiscoverButton({ disabled }: { disabled: boolean }) {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      disabled={disabled || pending}
      onClick={() =>
        startTransition(async () => {
          const result = await discoverSitesAction();
          if (!result.ok) return void toast.error(result.message);
          const s = result.data;
          const found = `${s.newSites} new site${s.newSites === 1 ? "" : "s"} from ${s.searches} web search${s.searches === 1 ? "" : "es"}`;
          const resolved = s.resolvedWatchlist
            ? `; ${s.resolvedWatchlist} watchlist compan${s.resolvedWatchlist === 1 ? "y" : "ies"} found`
            : "";
          if (s.stoppedBecause) toast.warning(`${found}${resolved}. ${s.stoppedBecause}`);
          else toast.success(`${found}${resolved}.`);
        })
      }
    >
      <Radar aria-hidden="true" />
      {pending ? "Discovering…" : "Discover company sites"}
    </Button>
  );
}

export function WatchlistForm() {
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const id = useId();
  return (
    <form
      className="flex flex-wrap items-end gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        startTransition(async () => {
          const result = await addToWatchlistAction({ value });
          if (!result.ok) return setError(result.message);
          toast.success(result.data.created ? "Added to your watchlist." : "It's already on the list.");
          setValue("");
        });
      }}
    >
      <div className="flex min-w-64 flex-1 flex-col gap-1">
        <label htmlFor={id} className="text-sm font-medium">
          Company name or careers page link
        </label>
        <Input
          id={id}
          value={value}
          placeholder="e.g. Kestrel Pay, or https://boards.greenhouse.io/kestrelpay"
          onChange={(e) => setValue(e.target.value)}
          aria-invalid={Boolean(error) || undefined}
          aria-describedby={error ? `${id}-error` : undefined}
        />
        {error && (
          <p id={`${id}-error`} className="text-sm text-destructive">
            {error}
          </p>
        )}
      </div>
      <Button type="submit" variant="outline" disabled={pending || value.trim().length < 2}>
        Add to watchlist
      </Button>
    </form>
  );
}

export function SitesTable({ sites }: { sites: CareerSiteView[] }) {
  const [pending, startTransition] = useTransition();
  return (
    <div className="overflow-x-auto rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Company</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Found by</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Last read</TableHead>
            <TableHead className="text-right">
              <span className="sr-only">Actions</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sites.map((site) => {
            const status = STATUS[site.status] ?? { label: site.status, variant: "outline" as const };
            return (
              <TableRow key={site.id}>
                <TableCell>
                  <div className="font-medium">{site.company ?? site.name}</div>
                  {site.url && (
                    <a
                      href={site.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:underline"
                    >
                      {site.url.replace(/^https:\/\//, "")}
                      <ExternalLink className="size-3" aria-hidden="true" />
                      <span className="sr-only">(opens in a new tab)</span>
                    </a>
                  )}
                </TableCell>
                <TableCell className="text-sm">{SITE_KIND_LABELS[site.kind as SiteKind] ?? site.kind}</TableCell>
                <TableCell className="text-sm" title={site.discoveredFrom ?? undefined}>
                  {site.source === "user" ? "Your watchlist" : "Web search"}
                </TableCell>
                <TableCell>
                  <Badge variant={status.variant}>{status.label}</Badge>
                  {site.lastError && <div className="text-xs text-muted-foreground">{site.lastError}</div>}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground" suppressHydrationWarning>
                  {site.lastFetchedAt
                    ? `${formatRelative(site.lastFetchedAt)} · ${site.lastJobCount} jobs`
                    : "Not read yet"}
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Remove ${site.company ?? site.name}`}
                    disabled={pending}
                    onClick={() =>
                      startTransition(async () => {
                        const result = await removeSiteAction({ id: site.id });
                        if (!result.ok) toast.error(result.message);
                      })
                    }
                  >
                    <Trash2 aria-hidden="true" />
                  </Button>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
