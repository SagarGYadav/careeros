"use client";

import { useEffect, useState, useTransition } from "react";
import {
  Ban,
  Bookmark,
  BookmarkCheck,
  CircleAlert,
  CircleCheck,
  ExternalLink,
  EyeOff,
  MoreHorizontal,
  Undo2,
} from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { STATUS_LABELS, type ApplicationStatus } from "@/lib/applications/status";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatRelative } from "@/lib/format";
import { RECOMMENDATION_LABELS } from "@/lib/fit-report/plain-text";
import { DISMISS_REASONS, type DismissReason, type FeedGroup } from "@/lib/jobs/feed";
import type { FeedCard } from "@/server/services/feed";
import {
  blockCompanyAction,
  dismissJobsAction,
  markFeedSeenAction,
  restoreJobsAction,
  setJobsSavedAction,
} from "@/app/(app)/jobs/actions";
import { Relevance } from "@/features/search/top-matches";

type Result = { ok: true } | { ok: false; message: string };

const FIT_VARIANT = { APPLY: "success", CONSIDER: "warning", LOW_PRIORITY: "outline" } as const;

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

function DismissMenu({
  label,
  triggerText,
  disabled,
  onDismiss,
}: {
  label: string;
  triggerText: string;
  disabled: boolean;
  onDismiss: (reason: DismissReason | null) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="outline" size="sm" disabled={disabled} aria-label={label} />}>
        <EyeOff aria-hidden="true" />
        {triggerText}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-44">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Why? (optional)</DropdownMenuLabel>
          {(Object.keys(DISMISS_REASONS) as DismissReason[]).map((reason) => (
            <DropdownMenuItem key={reason} onClick={() => onDismiss(reason)}>
              {DISMISS_REASONS[reason]}
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => onDismiss(null)}>No reason</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** The feed's job cards with per-card and bulk actions. */
export function FeedList({ cards, group }: { cards: FeedCard[]; group: FeedGroup }) {
  const [pending, startTransition] = useTransition();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  // "New" means found since the last visit. The visit is marked as seen right away, so later refreshes come back
  // without badges; the cards that were new when the page opened keep theirs until the user leaves.
  const [newAtOpen] = useState(() => new Set(cards.filter((c) => c.isNew).map((c) => c.id)));

  useEffect(() => {
    void markFeedSeenAction();
  }, []);

  const visibleSelected = cards.filter((c) => selected.has(c.id)).map((c) => c.id);
  const allSelected = cards.length > 0 && visibleSelected.length === cards.length;

  function toggle(id: string, on: boolean) {
    setSelected((current) => {
      const next = new Set(current);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function act(action: () => Promise<Result>, success: string, undo?: () => Promise<Result>) {
    startTransition(async () => {
      const result = await action();
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      setSelected(new Set());
      toast.success(
        success,
        undo
          ? {
              action: {
                label: "Undo",
                onClick: () =>
                  startTransition(async () => {
                    const undone = await undo();
                    if (!undone.ok) toast.error(undone.message);
                  }),
              },
            }
          : undefined,
      );
    });
  }

  const dismiss = (ids: string[], reason: DismissReason | null) =>
    act(
      () => dismissJobsAction({ ids, reason }),
      `Dismissed ${plural(ids.length, "job")}${reason ? ` (${DISMISS_REASONS[reason].toLowerCase()})` : ""}.`,
      () => restoreJobsAction({ ids }),
    );
  const save = (ids: string[], saved: boolean) =>
    act(
      () => setJobsSavedAction({ ids, saved }),
      saved ? `Saved ${plural(ids.length, "job")}.` : "Removed from saved.",
    );
  const restore = (ids: string[]) => act(() => restoreJobsAction({ ids }), `Restored ${plural(ids.length, "job")}.`);

  return (
    <div className="space-y-3" aria-busy={pending}>
      <div className="flex min-h-9 flex-wrap items-center gap-3 rounded-lg border bg-muted/40 px-3 py-1.5 text-sm">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            className="size-4 accent-primary"
            checked={allSelected}
            onChange={(e) => setSelected(e.target.checked ? new Set(cards.map((c) => c.id)) : new Set())}
          />
          Select all on this page
        </label>
        {visibleSelected.length > 0 && (
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <span className="text-muted-foreground">{visibleSelected.length} selected</span>
            {group === "dismissed" ? (
              <Button size="sm" variant="outline" disabled={pending} onClick={() => restore(visibleSelected)}>
                <Undo2 aria-hidden="true" />
                Restore selected
              </Button>
            ) : (
              <>
                {group !== "saved" && (
                  <Button size="sm" variant="outline" disabled={pending} onClick={() => save(visibleSelected, true)}>
                    <Bookmark aria-hidden="true" />
                    Save selected
                  </Button>
                )}
                <DismissMenu
                  label="Dismiss selected jobs"
                  triggerText="Dismiss selected"
                  disabled={pending}
                  onDismiss={(reason) => dismiss(visibleSelected, reason)}
                />
              </>
            )}
          </div>
        )}
      </div>

      <ul className="space-y-3">
        {cards.map((job) => {
          const name = `${job.title} at ${job.companyName}`;
          return (
            <li key={job.id} className="flex gap-3 rounded-xl border p-4">
              <input
                type="checkbox"
                className="mt-1 size-4 shrink-0 accent-primary"
                aria-label={`Select ${name}`}
                checked={selected.has(job.id)}
                onChange={(e) => toggle(job.id, e.target.checked)}
              />
              <div className="min-w-0 flex-1 space-y-2">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 space-y-0.5">
                    <h3 className="flex flex-wrap items-center gap-2 font-medium">
                      <Link href={`/jobs/${job.id}`} className="hover:underline">
                        {job.title}
                      </Link>
                      {newAtOpen.has(job.id) && <Badge variant="brand">New</Badge>}
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      {job.companyName}
                      {job.city && ` · ${job.city.replace("Remote-India", "Remote")}`}
                      {job.workMode && job.city !== "Remote-India" && ` · ${job.workMode}`}
                      {job.salary && ` · ${job.salary}`}
                    </p>
                  </div>
                  {job.fitScore !== null && job.fitRecommendation ? (
                    <Link
                      href={`/jobs/${job.id}`}
                      className="inline-flex items-center gap-1.5 rounded-md text-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                    >
                      <Badge variant={FIT_VARIANT[job.fitRecommendation]}>
                        <span className="tabular-nums">Fit {job.fitScore}</span>
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {RECOMMENDATION_LABELS[job.fitRecommendation]}
                      </span>
                      <span className="sr-only">: Fit Report for {name}</span>
                    </Link>
                  ) : (
                    <Relevance score={job.score} parts={job.parts} adjustments={job.adjustments} />
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                  {job.direct && <Badge variant="brand">Direct from company site</Badge>}
                  {job.staffing && <Badge variant="outline">Staffing agency</Badge>}
                  {job.companyBlocked && <Badge variant="outline">Blocked company</Badge>}
                  {job.stale && <Badge variant="outline">Older than 30 days</Badge>}
                  {job.applicationStatus ? (
                    <Badge variant="info">
                      Applied
                      {job.applicationStatus !== "APPLIED" &&
                        ` · ${STATUS_LABELS[job.applicationStatus as ApplicationStatus] ?? job.applicationStatus}`}
                    </Badge>
                  ) : (
                    job.status === "saved" && <Badge variant="outline">Saved</Badge>
                  )}
                  {job.status === "dismissed" && (
                    <Badge variant="outline">
                      Dismissed
                      {job.dismissReason && job.dismissReason in DISMISS_REASONS
                        ? `: ${DISMISS_REASONS[job.dismissReason as DismissReason].toLowerCase()}`
                        : ""}
                    </Badge>
                  )}
                  <span>
                    {job.postedVia ? `via ${job.postedVia}` : `from ${job.provider}`}
                    {job.postedAt && <span suppressHydrationWarning> · posted {formatRelative(job.postedAt)}</span>}
                  </span>
                  {job.provider === "adzuna" && (
                    <a href="https://www.adzuna.in" target="_blank" rel="noopener noreferrer" className="underline">
                      Jobs by Adzuna
                    </a>
                  )}
                </div>

                {job.notFitReasons.length > 0 && (
                  <p className="flex gap-1.5 text-sm text-warning">
                    <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                    <span>
                      <span className="font-medium">Not a fit:</span> {job.notFitReasons.join(" ")}
                    </span>
                  </p>
                )}
                {(job.reasons.length > 0 || job.gap) && (
                  <ul className="space-y-1 text-sm">
                    {job.reasons.map((reason) => (
                      <li key={reason} className="flex gap-1.5">
                        <CircleCheck className="mt-0.5 size-4 shrink-0 text-success" aria-hidden="true" />
                        <span>{reason}</span>
                      </li>
                    ))}
                    {job.gap && (
                      <li className="flex gap-1.5">
                        <CircleAlert className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />
                        <span>
                          <span className="sr-only">Gap: </span>
                          {job.gap}
                        </span>
                      </li>
                    )}
                  </ul>
                )}

                <div className="flex flex-wrap items-center gap-2 pt-1">
                  {job.applyUrl && (
                    <a
                      href={job.applyUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex h-7 items-center gap-1 rounded-md border px-2.5 text-xs font-medium hover:bg-muted"
                    >
                      Open
                      <ExternalLink className="size-3" aria-hidden="true" />
                      <span className="sr-only">
                        {name} on {job.applySite ?? "the job site"} (opens in a new tab)
                      </span>
                    </a>
                  )}
                  {job.status === "dismissed" ? (
                    <Button size="sm" variant="outline" disabled={pending} onClick={() => restore([job.id])}>
                      <Undo2 aria-hidden="true" />
                      Restore
                      <span className="sr-only"> {name}</span>
                    </Button>
                  ) : (
                    <>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={pending}
                        onClick={() => save([job.id], job.status !== "saved")}
                      >
                        {job.status === "saved" ? (
                          <BookmarkCheck aria-hidden="true" />
                        ) : (
                          <Bookmark aria-hidden="true" />
                        )}
                        {job.status === "saved" ? "Unsave" : "Save"}
                        <span className="sr-only"> {name}</span>
                      </Button>
                      <DismissMenu
                        label={`Dismiss ${name}`}
                        triggerText="Dismiss"
                        disabled={pending}
                        onDismiss={(reason) => dismiss([job.id], reason)}
                      />
                    </>
                  )}
                  {job.companyId && (
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        render={
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            disabled={pending}
                            aria-label={`More actions for ${name}`}
                          />
                        }
                      >
                        <MoreHorizontal aria-hidden="true" />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="min-w-52">
                        <DropdownMenuItem
                          onClick={() =>
                            act(
                              () => blockCompanyAction({ companyId: job.companyId!, blocked: !job.companyBlocked }),
                              job.companyBlocked
                                ? `${job.companyName} unblocked.`
                                : `${job.companyName} blocked; its jobs are hidden.`,
                            )
                          }
                        >
                          <Ban aria-hidden="true" />
                          {job.companyBlocked ? `Unblock ${job.companyName}` : `Block ${job.companyName}`}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
