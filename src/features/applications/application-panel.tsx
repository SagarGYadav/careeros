"use client";

import { useId, useState, useTransition } from "react";
import { CalendarPlus, Send } from "lucide-react";
import { toast } from "sonner";
import {
  addRoundAction,
  changeStatusAction,
  markAppliedAction,
  undoStatusAction,
} from "@/app/(app)/jobs/[jobId]/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { NativeSelect } from "@/features/profile/inputs";
import {
  APPLICATION_SOURCES,
  APPLICATION_STATUSES,
  REJECTION_REASONS,
  ROUND_TYPES,
  STAGE_STATUSES,
  STATUS_LABELS,
  isClosed,
  stageOf,
  type ApplicationSource,
  type ApplicationStatus,
  type RejectionReason,
  type RoundType,
  type StageStatus,
} from "@/lib/applications/status";
import { formatDate } from "@/lib/format";
import { toastWithUndo } from "@/lib/toast";
import type { ApplicationPanelView, ApplicationView } from "@/server/services/applications";

/** Today in the user's own time zone, as the value of a date input. */
function todayLocal(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** A date input's value as an ISO time: now for today, local noon for an earlier day (so time zones can't shift it). */
function dateToIso(value: string): string {
  return value === todayLocal() ? new Date().toISOString() : new Date(`${value}T12:00:00`).toISOString();
}

const statusVariant = (status: string) =>
  status === "OFFER" ? "success" : status === "REJECTED" ? "destructive" : isClosed(status) ? "outline" : "brand";

/** The job page's application section (SPEC §13): Mark as applied, then the status, rounds and latest activity. */
export function ApplicationPanel({ jobId, panel }: { jobId: string; panel: ApplicationPanelView }) {
  const app = panel.application;
  return (
    <section className="space-y-3 rounded-xl border p-4" aria-labelledby="application-heading" data-print-hide>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="application-heading" className="text-base font-semibold">
          Application
        </h2>
        {app && <Badge variant={statusVariant(app.status)}>{STATUS_LABELS[app.status as ApplicationStatus]}</Badge>}
      </div>
      {app ? (
        <ApplicationSummary app={app} />
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            Applied on the job site? Record it here to track replies and interviews. CareerOS never applies for you.
          </p>
          <MarkAppliedButton jobId={jobId} panel={panel} />
        </>
      )}
    </section>
  );
}

function MarkAppliedButton({ jobId, panel }: { jobId: string; panel: ApplicationPanelView }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const ids = { date: useId(), cv: useId(), source: useId(), referrer: useId(), notes: useId() };
  const [appliedOn, setAppliedOn] = useState(todayLocal);
  const [resumeVersionId, setResumeVersionId] = useState(panel.resumes[0]?.id ?? "");
  const [source, setSource] = useState<ApplicationSource>(panel.suggestedSource);
  const [isReferral, setIsReferral] = useState(false);
  const [referrerName, setReferrerName] = useState("");
  const [inbound, setInbound] = useState(false);
  const [notes, setNotes] = useState("");

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    startTransition(async () => {
      const result = await markAppliedAction({
        jobId,
        appliedAt: dateToIso(appliedOn),
        resumeVersionId: resumeVersionId || null,
        source,
        isReferral,
        referrerName,
        inbound,
        notes,
      });
      if (!result.ok) return void toast.error(result.message);
      toast.success("Marked as applied. It's now tracked with this job and its Fit Report as they are today.");
      setOpen(false);
    });
  };

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        <Send aria-hidden="true" />
        Mark as applied
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <form onSubmit={submit} className="grid gap-4">
            <DialogHeader>
              <DialogTitle>Mark as applied</DialogTitle>
              <DialogDescription>
                Saves a copy of the job and its Fit Report as they are now, so you can see what you applied to.
              </DialogDescription>
            </DialogHeader>
            <Field>
              <FieldLabel htmlFor={ids.date}>Applied on</FieldLabel>
              <Input
                id={ids.date}
                type="date"
                required
                max={todayLocal()}
                value={appliedOn}
                onChange={(e) => setAppliedOn(e.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor={ids.cv}>CV version sent</FieldLabel>
              <NativeSelect id={ids.cv} value={resumeVersionId} onChange={(e) => setResumeVersionId(e.target.value)}>
                {panel.resumes.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                    {r.isDefault ? " (profile CV)" : ""}
                  </option>
                ))}
                <option value="">Another CV (not in CareerOS)</option>
              </NativeSelect>
            </Field>
            <Field>
              <FieldLabel htmlFor={ids.source}>Where you applied</FieldLabel>
              <NativeSelect
                id={ids.source}
                value={source}
                onChange={(e) => setSource(e.target.value as ApplicationSource)}
              >
                {Object.entries(APPLICATION_SOURCES).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </NativeSelect>
              <FieldDescription>Filled in from the job&apos;s first apply link.</FieldDescription>
            </Field>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="size-4 accent-primary"
                checked={isReferral}
                onChange={(e) => setIsReferral(e.target.checked)}
              />
              Someone referred me
            </label>
            {isReferral && (
              <Field>
                <FieldLabel htmlFor={ids.referrer}>Referred by (optional)</FieldLabel>
                <Input
                  id={ids.referrer}
                  maxLength={120}
                  value={referrerName}
                  onChange={(e) => setReferrerName(e.target.value)}
                />
              </Field>
            )}
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                className="mt-0.5 size-4 accent-primary"
                checked={inbound}
                onChange={(e) => setInbound(e.target.checked)}
              />
              <span>
                A recruiter contacted me first
                <span className="block text-xs text-muted-foreground">
                  Starts at “Recruiter contact” and is kept out of your outbound response rates.
                </span>
              </span>
            </label>
            <Field>
              <FieldLabel htmlFor={ids.notes}>Notes (optional)</FieldLabel>
              <Textarea
                id={ids.notes}
                rows={2}
                maxLength={2000}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </Field>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={pending || !appliedOn}>
                {pending ? "Saving…" : "Mark as applied"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

function ApplicationSummary({ app }: { app: ApplicationView }) {
  const [roundOpen, setRoundOpen] = useState(false);
  const [roundPrompt, setRoundPrompt] = useState(false);
  const facts = [
    `${app.direction === "inbound" ? "Recruiter reached out" : "Applied"} ${formatDate(app.appliedAt)}`,
    APPLICATION_SOURCES[app.source as ApplicationSource] ?? app.source,
    app.resumeName ? `CV: ${app.resumeName}` : "CV not in CareerOS",
    app.isReferral ? `Referral${app.referrerName ? ` from ${app.referrerName}` : ""}` : null,
  ].filter(Boolean);

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">{facts.join(" · ")}</p>
      {app.status === "REJECTED" && app.rejectionReason && (
        <p className="text-sm">
          Rejected at {STATUS_LABELS[(app.rejectedAtStage ?? "APPLIED") as ApplicationStatus]}:{" "}
          {REJECTION_REASONS[app.rejectionReason as RejectionReason] ?? app.rejectionReason}
        </p>
      )}
      <div className="flex flex-wrap items-end gap-2">
        <ChangeStatus
          app={app}
          onRoundOffer={() => {
            setRoundPrompt(true);
            setRoundOpen(true);
          }}
        />
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            setRoundPrompt(false);
            setRoundOpen(true);
          }}
        >
          <CalendarPlus aria-hidden="true" />
          Add interview round
        </Button>
      </div>
      <AddRoundDialog applicationId={app.id} open={roundOpen} onOpenChange={setRoundOpen} prompt={roundPrompt} />

      {app.rounds.length > 0 && (
        <div className="space-y-1">
          <h3 className="text-sm font-medium">Interview rounds</h3>
          <ul className="space-y-1 text-sm text-muted-foreground">
            {app.rounds.map((r) => (
              <li key={r.id}>
                {ROUND_TYPES[r.roundType] ?? r.roundType}
                {r.scheduledAt ? ` · ${formatDate(r.scheduledAt)}` : ""}
                {r.result !== "pending" ? ` · ${r.result}` : ""}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="space-y-1">
        <h3 className="text-sm font-medium">Latest activity</h3>
        <ol className="space-y-1 text-sm">
          {app.events.slice(0, 5).map((e) => (
            <li key={e.id} className="flex flex-wrap gap-x-2">
              <span className="text-muted-foreground tabular-nums">{formatDate(e.occurredAt)}</span>
              <span>{e.title}</span>
              {e.note && <span className="w-full pl-0 text-xs text-muted-foreground">{e.note}</span>}
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

/** Pick the new status, then confirm its date (and, for a rejection, the reason and stage). */
function ChangeStatus({ app, onRoundOffer }: { app: ApplicationView; onRoundOffer: () => void }) {
  const selectId = useId();
  const ids = { date: useId(), reason: useId(), stage: useId(), note: useId() };
  const [to, setTo] = useState<ApplicationStatus | null>(null);
  const [occurredOn, setOccurredOn] = useState(todayLocal);
  const [reason, setReason] = useState<RejectionReason | "">("");
  const defaultStage = (
    stageOf(app.status) !== null ? app.status : STAGE_STATUSES[app.stageReached - 1]
  ) as StageStatus;
  const [stage, setStage] = useState<StageStatus>(defaultStage);
  const [note, setNote] = useState("");
  const [pending, startTransition] = useTransition();

  const choose = (value: string) => {
    if (!value) return;
    setTo(value as ApplicationStatus);
    setOccurredOn(todayLocal());
    setReason("");
    setStage(defaultStage);
    setNote("");
  };

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!to) return;
    startTransition(async () => {
      const result = await changeStatusAction({
        applicationId: app.id,
        to,
        occurredAt: dateToIso(occurredOn),
        rejectionReason: to === "REJECTED" ? reason || null : null,
        rejectedAtStage: to === "REJECTED" ? stage : null,
        note,
      });
      if (!result.ok) return void toast.error(result.message);
      setTo(null);
      toastWithUndo(`Moved to ${STATUS_LABELS[to]}.`, async () => {
        const undone = await undoStatusAction({ applicationId: app.id, eventId: result.data.eventId });
        if (undone.ok) toast.success("Change undone.");
        else toast.error(undone.message);
      });
      if (result.data.offerRound) onRoundOffer();
    });
  };

  return (
    <>
      <Field className="w-auto">
        <FieldLabel htmlFor={selectId}>Change status</FieldLabel>
        <NativeSelect id={selectId} value="" onChange={(e) => choose(e.target.value)} className="w-48">
          <option value="">Choose…</option>
          {APPLICATION_STATUSES.filter((s) => s !== app.status).map((s) => (
            <option key={s} value={s}>
              {STATUS_LABELS[s]}
            </option>
          ))}
        </NativeSelect>
      </Field>
      <Dialog open={to !== null} onOpenChange={(open) => !open && setTo(null)}>
        <DialogContent className="sm:max-w-md">
          {to && (
            <form onSubmit={submit} className="grid gap-4">
              <DialogHeader>
                <DialogTitle>{to === "REJECTED" ? "Record the rejection" : `Move to ${STATUS_LABELS[to]}`}</DialogTitle>
                <DialogDescription>
                  {to === "REJECTED"
                    ? "The reason and stage feed your rejection patterns later, so pick the closest ones."
                    : "Added to the application's timeline."}
                </DialogDescription>
              </DialogHeader>
              <Field>
                <FieldLabel htmlFor={ids.date}>When</FieldLabel>
                <Input
                  id={ids.date}
                  type="date"
                  required
                  max={todayLocal()}
                  value={occurredOn}
                  onChange={(e) => setOccurredOn(e.target.value)}
                />
              </Field>
              {to === "REJECTED" && (
                <>
                  <Field>
                    <FieldLabel htmlFor={ids.reason}>Reason</FieldLabel>
                    <NativeSelect
                      id={ids.reason}
                      required
                      value={reason}
                      onChange={(e) => setReason(e.target.value as RejectionReason)}
                    >
                      <option value="">Choose a reason…</option>
                      {Object.entries(REJECTION_REASONS).map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </NativeSelect>
                  </Field>
                  <Field>
                    <FieldLabel htmlFor={ids.stage}>Rejected after</FieldLabel>
                    <NativeSelect
                      id={ids.stage}
                      value={stage}
                      onChange={(e) => setStage(e.target.value as StageStatus)}
                    >
                      {STAGE_STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {STATUS_LABELS[s]}
                        </option>
                      ))}
                    </NativeSelect>
                  </Field>
                </>
              )}
              <Field>
                <FieldLabel htmlFor={ids.note}>Note (optional)</FieldLabel>
                <Textarea
                  id={ids.note}
                  rows={2}
                  maxLength={2000}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                />
              </Field>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setTo(null)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={pending || (to === "REJECTED" && !reason)}>
                  {pending ? "Saving…" : "Save"}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

/** Log a round; opened by the button, or offered after moving to an interview stage. */
function AddRoundDialog({
  applicationId,
  open,
  onOpenChange,
  prompt,
}: {
  applicationId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  prompt: boolean;
}) {
  const ids = { type: useId(), when: useId(), notes: useId() };
  const [roundType, setRoundType] = useState<RoundType>("technical");
  const [when, setWhen] = useState("");
  const [notes, setNotes] = useState("");
  const [pending, startTransition] = useTransition();

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    startTransition(async () => {
      const result = await addRoundAction({
        applicationId,
        roundType,
        scheduledAt: when ? new Date(when).toISOString() : null,
        notes,
      });
      if (!result.ok) return void toast.error(result.message);
      toast.success(`${ROUND_TYPES[roundType]} round added.`);
      setWhen("");
      setNotes("");
      onOpenChange(false);
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={submit} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>{prompt ? "Add the interview round?" : "Add interview round"}</DialogTitle>
            <DialogDescription>
              Logged rounds show up on the timeline and, later, in interview prep and analytics.
            </DialogDescription>
          </DialogHeader>
          <Field>
            <FieldLabel htmlFor={ids.type}>Round type</FieldLabel>
            <NativeSelect id={ids.type} value={roundType} onChange={(e) => setRoundType(e.target.value as RoundType)}>
              {Object.entries(ROUND_TYPES).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field>
            <FieldLabel htmlFor={ids.when}>Date and time (optional)</FieldLabel>
            <Input id={ids.when} type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />
          </Field>
          <Field>
            <FieldLabel htmlFor={ids.notes}>Notes (optional)</FieldLabel>
            <Textarea
              id={ids.notes}
              rows={2}
              maxLength={2000}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </Field>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {prompt ? "Not now" : "Cancel"}
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : "Add round"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
