"use client";

import { useId, useState, useTransition } from "react";
import { toast } from "sonner";
import { addRoundAction, changeStatusAction, undoStatusAction } from "@/app/(app)/applications/actions";
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
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { NativeSelect } from "@/features/profile/inputs";
import {
  APPLICATION_STATUSES,
  REJECTION_REASONS,
  ROUND_TYPES,
  STAGE_STATUSES,
  STATUS_LABELS,
  isClosed,
  stageOf,
  type ApplicationStatus,
  type RejectionReason,
  type RoundType,
  type StageStatus,
} from "@/lib/applications/status";
import { toastWithUndo } from "@/lib/toast";

/** Today in the user's own time zone, as the value of a date input. */
export function todayLocal(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** A date input's value as an ISO time: now for today, local noon for an earlier day (so time zones can't shift it). */
export function dateToIso(value: string): string {
  return value === todayLocal() ? new Date().toISOString() : new Date(`${value}T12:00:00`).toISOString();
}

export function StatusBadge({ status }: { status: string }) {
  const variant =
    status === "OFFER" ? "success" : status === "REJECTED" ? "destructive" : isClosed(status) ? "outline" : "brand";
  return <Badge variant={variant}>{STATUS_LABELS[status as ApplicationStatus] ?? status}</Badge>;
}

/** The application fields the status controls need. */
export type StatusTarget = { id: string; status: string; stageReached: number };

export type StatusChangeValues = {
  to: ApplicationStatus;
  occurredAt: string;
  rejectionReason: RejectionReason | null;
  rejectedAtStage: StageStatus | null;
  note: string;
};

/**
 * Saves a status change, shows a toast with Undo and, for interview stages, calls `onRoundOffer`. Returns false
 * (after showing the error) when the server refused it.
 */
export async function runStatusChange(
  applicationId: string,
  values: StatusChangeValues,
  onRoundOffer?: () => void,
): Promise<boolean> {
  const result = await changeStatusAction({ applicationId, ...values });
  if (!result.ok) {
    toast.error(result.message);
    return false;
  }
  toastWithUndo(`Moved to ${STATUS_LABELS[values.to]}.`, async () => {
    const undone = await undoStatusAction({ applicationId, eventId: result.data.eventId });
    if (undone.ok) toast.success("Change undone.");
    else toast.error(undone.message);
  });
  if (result.data.offerRound) onRoundOffer?.();
  return true;
}

/**
 * Confirms a status change: its date, an optional note and, for a rejection, the reason and stage. With `choices`
 * (the board's "Closed" column) the user first picks how it ended.
 */
export function StatusChangeDialog({
  app,
  to,
  choices,
  onConfirm,
  onCancel,
}: {
  app: StatusTarget;
  /** The status to move to, or null when the dialog is closed. */
  to: ApplicationStatus | null;
  choices?: ApplicationStatus[];
  onConfirm: (values: StatusChangeValues) => Promise<void> | void;
  onCancel: () => void;
}) {
  return (
    <Dialog open={to !== null} onOpenChange={(open) => !open && onCancel()}>
      <DialogContent className="sm:max-w-md">
        {to && (
          // Keyed by the target so each opening starts from fresh values.
          <StatusChangeForm
            key={`${app.id}-${to}`}
            app={app}
            initialTo={to}
            choices={choices}
            onConfirm={onConfirm}
            onCancel={onCancel}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function StatusChangeForm({
  app,
  initialTo,
  choices,
  onConfirm,
  onCancel,
}: {
  app: StatusTarget;
  initialTo: ApplicationStatus;
  choices?: ApplicationStatus[];
  onConfirm: (values: StatusChangeValues) => Promise<void> | void;
  onCancel: () => void;
}) {
  const ids = { outcome: useId(), date: useId(), reason: useId(), stage: useId(), note: useId() };
  const defaultStage = (
    stageOf(app.status) !== null ? app.status : STAGE_STATUSES[Math.max(app.stageReached, 1) - 1]
  ) as StageStatus;
  const [to, setTo] = useState<ApplicationStatus>(initialTo);
  const [occurredOn, setOccurredOn] = useState(todayLocal);
  const [reason, setReason] = useState<RejectionReason | "">("");
  const [stage, setStage] = useState<StageStatus>(defaultStage);
  const [note, setNote] = useState("");
  const [pending, startTransition] = useTransition();

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    startTransition(async () => {
      await onConfirm({
        to,
        occurredAt: dateToIso(occurredOn),
        rejectionReason: to === "REJECTED" ? reason || null : null,
        rejectedAtStage: to === "REJECTED" ? stage : null,
        note,
      });
    });
  };

  return (
    <form onSubmit={submit} className="grid gap-4">
      <DialogHeader>
        <DialogTitle>
          {choices
            ? "Close the application"
            : to === "REJECTED"
              ? "Record the rejection"
              : `Move to ${STATUS_LABELS[to]}`}
        </DialogTitle>
        <DialogDescription>
          {to === "REJECTED"
            ? "The reason and stage feed your rejection patterns later, so pick the closest ones."
            : "Added to the application's timeline."}
        </DialogDescription>
      </DialogHeader>
      {choices && (
        <Field>
          <FieldLabel htmlFor={ids.outcome}>How did it end?</FieldLabel>
          <NativeSelect id={ids.outcome} value={to} onChange={(e) => setTo(e.target.value as ApplicationStatus)}>
            {choices.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABELS[s]}
              </option>
            ))}
          </NativeSelect>
        </Field>
      )}
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
            <NativeSelect id={ids.stage} value={stage} onChange={(e) => setStage(e.target.value as StageStatus)}>
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
        <Textarea id={ids.note} rows={2} maxLength={2000} value={note} onChange={(e) => setNote(e.target.value)} />
      </Field>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={pending || (to === "REJECTED" && !reason)}>
          {pending ? "Saving…" : "Save"}
        </Button>
      </DialogFooter>
    </form>
  );
}

/** A "Change status" select: pick the new status, then confirm it in the dialog. */
export function ChangeStatus({ app, onRoundOffer }: { app: StatusTarget; onRoundOffer: () => void }) {
  const selectId = useId();
  const [to, setTo] = useState<ApplicationStatus | null>(null);

  return (
    <>
      <Field className="w-auto">
        <FieldLabel htmlFor={selectId}>Change status</FieldLabel>
        <NativeSelect
          id={selectId}
          value=""
          onChange={(e) => e.target.value && setTo(e.target.value as ApplicationStatus)}
          className="w-48"
        >
          <option value="">Choose…</option>
          {APPLICATION_STATUSES.filter((s) => s !== app.status).map((s) => (
            <option key={s} value={s}>
              {STATUS_LABELS[s]}
            </option>
          ))}
        </NativeSelect>
      </Field>
      <StatusChangeDialog
        app={app}
        to={to}
        onCancel={() => setTo(null)}
        onConfirm={async (values) => {
          if (await runStatusChange(app.id, values, onRoundOffer)) setTo(null);
        }}
      />
    </>
  );
}

/** Log a round; opened by a button, or offered after moving to an interview stage. */
export function AddRoundDialog({
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
