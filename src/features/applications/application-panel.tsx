"use client";

import { useId, useState, useTransition } from "react";
import Link from "next/link";
import { ArrowRight, CalendarPlus, Send } from "lucide-react";
import { toast } from "sonner";
import { markAppliedAction } from "@/app/(app)/applications/actions";
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
  REJECTION_REASONS,
  STATUS_LABELS,
  type ApplicationSource,
  type ApplicationStatus,
  type RejectionReason,
} from "@/lib/applications/status";
import { formatDate } from "@/lib/format";
import type { ApplicationPanelView, ApplicationView } from "@/server/services/applications";
import { AddRoundDialog, ChangeStatus, StatusBadge, dateToIso, todayLocal } from "./status-controls";

/** The job page's application section (SPEC §13): Mark as applied, then the status and latest activity. */
export function ApplicationPanel({ jobId, panel }: { jobId: string; panel: ApplicationPanelView }) {
  const app = panel.application;
  return (
    <section className="space-y-3 rounded-xl border p-4" aria-labelledby="application-heading" data-print-hide>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="application-heading" className="text-base font-semibold">
          Application
        </h2>
        {app && <StatusBadge status={app.status} />}
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

export function applicationFacts(
  app: Pick<ApplicationView, "direction" | "appliedAt" | "source" | "resumeName" | "isReferral" | "referrerName">,
): string {
  return [
    `${app.direction === "inbound" ? "Recruiter reached out" : "Applied"} ${formatDate(app.appliedAt)}`,
    APPLICATION_SOURCES[app.source as ApplicationSource] ?? app.source,
    app.resumeName ? `CV: ${app.resumeName}` : "CV not in CareerOS",
    app.isReferral ? `Referral${app.referrerName ? ` from ${app.referrerName}` : ""}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

export function RejectionLine({
  app,
}: {
  app: Pick<ApplicationView, "status" | "rejectionReason" | "rejectedAtStage">;
}) {
  if (app.status !== "REJECTED" || !app.rejectionReason) return null;
  return (
    <p className="text-sm">
      Rejected at {STATUS_LABELS[(app.rejectedAtStage ?? "APPLIED") as ApplicationStatus]}:{" "}
      {REJECTION_REASONS[app.rejectionReason as RejectionReason] ?? app.rejectionReason}
    </p>
  );
}

function ApplicationSummary({ app }: { app: ApplicationView }) {
  const [roundOpen, setRoundOpen] = useState(false);
  const [roundPrompt, setRoundPrompt] = useState(false);

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">{applicationFacts(app)}</p>
      <RejectionLine app={app} />
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

      <div className="space-y-1">
        <h3 className="text-sm font-medium">Latest activity</h3>
        <ol className="space-y-1 text-sm">
          {app.events.slice(0, 3).map((e) => (
            <li key={e.id} className="flex flex-wrap gap-x-2">
              <span className="text-muted-foreground tabular-nums">{formatDate(e.occurredAt)}</span>
              <span>{e.title}</span>
            </li>
          ))}
        </ol>
      </div>
      <Link
        href={`/applications/${app.id}`}
        className="inline-flex items-center gap-1 text-sm font-medium text-brand hover:underline"
      >
        Timeline, rounds, follow-up and notes
        <ArrowRight className="size-3.5" aria-hidden="true" />
      </Link>
    </div>
  );
}
