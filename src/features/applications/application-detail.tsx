"use client";

import { useId, useState, useTransition } from "react";
import { CalendarPlus } from "lucide-react";
import { toast } from "sonner";
import {
  addTimelineNoteAction,
  saveNotesAction,
  setFollowUpAction,
  setOfferDecisionAction,
  updateRoundAction,
} from "@/app/(app)/applications/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { NativeSelect } from "@/features/profile/inputs";
import { IDLE_DAYS } from "@/lib/applications/activity";
import { ROUND_TYPES, STAGE_STATUSES, STATUS_LABELS } from "@/lib/applications/status";
import { formatDate } from "@/lib/format";
import { OFFER_DECISIONS, ROUND_RESULTS } from "@/lib/validation/application";
import type { ApplicationDetailView } from "@/server/services/pipeline";
import { RejectionLine, applicationFacts } from "./application-panel";
import {
  AddRoundDialog,
  ChangeStatus,
  StatusBadge,
  StatusChangeDialog,
  dateToIso,
  runStatusChange,
  todayLocal,
} from "./status-controls";

/** A stored time as a date input's value, in the user's time zone. */
function toDateInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function Section({ title, children, id }: { title: string; children: React.ReactNode; id: string }) {
  return (
    <section className="space-y-3 rounded-xl border p-4" aria-labelledby={id}>
      <h2 id={id} className="text-base font-semibold">
        {title}
      </h2>
      {children}
    </section>
  );
}

/** The application page (SPEC §13): status, follow-up, rounds, timeline, notes and the frozen job. */
export function ApplicationDetail({ view }: { view: ApplicationDetailView }) {
  const [roundOpen, setRoundOpen] = useState(false);
  const [roundPrompt, setRoundPrompt] = useState(false);
  const [ghosting, setGhosting] = useState(false);
  const idle = view.idleDays !== null && view.idleDays >= IDLE_DAYS;
  const offerRound = () => {
    setRoundPrompt(true);
    setRoundOpen(true);
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
      <div className="space-y-4">
        <Section title="Status" id="status-heading">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={view.status} />
            <span className="text-xs text-muted-foreground">
              Furthest stage: {STATUS_LABELS[STAGE_STATUSES[view.stageReached - 1]]}
            </span>
            {idle && <Badge variant="warning">Idle {view.idleDays} days</Badge>}
          </div>
          <p className="text-sm text-muted-foreground">{applicationFacts(view)}</p>
          <RejectionLine app={view} />
          {view.ghostedSuggested && (
            <p className="flex flex-wrap items-center gap-2 text-sm">
              No reply in {view.idleDays} days.
              <Button size="sm" variant="outline" onClick={() => setGhosting(true)}>
                Mark as ghosted
              </Button>
            </p>
          )}
          <div className="flex flex-wrap items-end gap-2">
            <ChangeStatus app={view} onRoundOffer={offerRound} />
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
          {view.status === "OFFER" && <OfferDecision view={view} />}
          <AddRoundDialog applicationId={view.id} open={roundOpen} onOpenChange={setRoundOpen} prompt={roundPrompt} />
          <StatusChangeDialog
            app={view}
            to={ghosting ? "GHOSTED" : null}
            onCancel={() => setGhosting(false)}
            onConfirm={async (values) => {
              if (await runStatusChange(view.id, values)) setGhosting(false);
            }}
          />
        </Section>

        <Section title="Interview rounds" id="rounds-heading">
          {view.rounds.length === 0 ? (
            <p className="text-sm text-muted-foreground">No rounds logged yet.</p>
          ) : (
            <ul className="space-y-3">
              {view.rounds.map((round) => (
                <RoundEditor key={round.id} round={round} />
              ))}
            </ul>
          )}
        </Section>

        <Section title="Timeline" id="timeline-heading">
          <TimelineNoteForm applicationId={view.id} />
          <ol className="space-y-2 border-l pl-4" aria-label="Timeline, newest first">
            {view.events.map((e) => (
              <li key={e.id} className="relative text-sm">
                <span className="absolute top-1.5 -left-[1.3rem] size-2 rounded-full bg-brand" aria-hidden="true" />
                <span className="mr-2 text-muted-foreground tabular-nums">{formatDate(e.occurredAt)}</span>
                {e.title}
                {e.note && <span className="block text-xs whitespace-pre-line text-muted-foreground">{e.note}</span>}
              </li>
            ))}
          </ol>
        </Section>
      </div>

      <div className="space-y-4">
        <Section title="Follow-up" id="follow-up-heading">
          <FollowUpForm view={view} />
        </Section>
        <Section title="Notes" id="notes-heading">
          <NotesForm view={view} />
        </Section>
        <Section title="What you applied to" id="snapshot-heading">
          <p className="text-xs text-muted-foreground">
            A copy saved when you applied{view.snapshot.takenAt ? ` (${formatDate(view.snapshot.takenAt)})` : ""}, so
            later changes to the posting don&apos;t change it.
          </p>
          {view.snapshot.fit ? (
            <p className="text-sm">
              Fit score then: <span className="font-semibold tabular-nums">{view.snapshot.fit.scoreTotal}</span> ·{" "}
              {view.snapshot.fit.recommendation.replace("_", " ").toLowerCase()}
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">No Fit Report had been written when you applied.</p>
          )}
          {view.snapshot.job.description && (
            <details>
              <summary className="cursor-pointer text-sm font-medium">Job description</summary>
              <p className="mt-2 text-sm whitespace-pre-line text-muted-foreground">{view.snapshot.job.description}</p>
            </details>
          )}
        </Section>
      </div>
    </div>
  );
}

function OfferDecision({ view }: { view: ApplicationDetailView }) {
  const id = useId();
  const [pending, startTransition] = useTransition();
  return (
    <Field className="max-w-xs">
      <FieldLabel htmlFor={id}>Your decision on the offer</FieldLabel>
      <NativeSelect
        id={id}
        disabled={pending}
        value={view.offerDecision ?? "pending"}
        onChange={(e) => {
          const decision = e.target.value;
          startTransition(async () => {
            const result = await setOfferDecisionAction({ applicationId: view.id, decision });
            if (result.ok) toast.success("Decision saved.");
            else toast.error(result.message);
          });
        }}
      >
        {Object.entries(OFFER_DECISIONS).map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </NativeSelect>
    </Field>
  );
}

function FollowUpForm({ view }: { view: ApplicationDetailView }) {
  const id = useId();
  const [date, setDate] = useState(toDateInput(view.followUpAt));
  const [pending, startTransition] = useTransition();
  const save = (followUpAt: string | null) =>
    startTransition(async () => {
      const result = await setFollowUpAction({ applicationId: view.id, followUpAt });
      if (!result.ok) return void toast.error(result.message);
      toast.success(followUpAt ? "Follow-up reminder set." : "Follow-up reminder cleared.");
      if (!followUpAt) setDate("");
    });

  return (
    <form
      className="space-y-2"
      onSubmit={(e) => {
        e.preventDefault();
        // Stored at local noon, like every date picked here.
        if (date) save(new Date(`${date}T12:00:00`).toISOString());
      }}
    >
      <Field>
        <FieldLabel htmlFor={id}>Remind me to follow up on</FieldLabel>
        <Input id={id} type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        <FieldDescription>Shows up in Today&apos;s actions on the Overview when it&apos;s due.</FieldDescription>
      </Field>
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={pending || !date}>
          Save
        </Button>
        {view.followUpAt && (
          <Button type="button" size="sm" variant="outline" disabled={pending} onClick={() => save(null)}>
            Clear
          </Button>
        )}
      </div>
    </form>
  );
}

function NotesForm({ view }: { view: ApplicationDetailView }) {
  const id = useId();
  const [notes, setNotes] = useState(view.notes ?? "");
  const [pending, startTransition] = useTransition();
  return (
    <form
      className="space-y-2"
      onSubmit={(e) => {
        e.preventDefault();
        startTransition(async () => {
          const result = await saveNotesAction({ applicationId: view.id, notes });
          if (result.ok) toast.success("Notes saved.");
          else toast.error(result.message);
        });
      }}
    >
      <Field>
        <FieldLabel htmlFor={id}>Your notes</FieldLabel>
        <Textarea id={id} rows={5} maxLength={5000} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>
      <Button type="submit" size="sm" disabled={pending || notes === (view.notes ?? "")}>
        Save notes
      </Button>
    </form>
  );
}

function TimelineNoteForm({ applicationId }: { applicationId: string }) {
  const ids = { date: useId(), title: useId(), note: useId() };
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(todayLocal);
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");
  const [pending, startTransition] = useTransition();

  if (!open) {
    return (
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        Add to timeline
      </Button>
    );
  }
  return (
    <form
      className="space-y-3 rounded-lg border p-3"
      onSubmit={(e) => {
        e.preventDefault();
        startTransition(async () => {
          const result = await addTimelineNoteAction({ applicationId, occurredAt: dateToIso(date), title, note });
          if (!result.ok) return void toast.error(result.message);
          toast.success("Added to the timeline.");
          setTitle("");
          setNote("");
          setOpen(false);
        });
      }}
    >
      <div className="grid gap-3 sm:grid-cols-[10rem_1fr]">
        <Field>
          <FieldLabel htmlFor={ids.date}>When</FieldLabel>
          <Input
            id={ids.date}
            type="date"
            required
            max={todayLocal()}
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor={ids.title}>What happened</FieldLabel>
          <Input
            id={ids.title}
            required
            maxLength={200}
            placeholder="Sent a follow-up email"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </Field>
      </div>
      <Field>
        <FieldLabel htmlFor={ids.note}>Details (optional)</FieldLabel>
        <Textarea id={ids.note} rows={2} maxLength={2000} value={note} onChange={(e) => setNote(e.target.value)} />
      </Field>
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={pending || title.trim().length < 2}>
          Add
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

function RoundEditor({ round }: { round: ApplicationDetailView["rounds"][number] }) {
  const ids = { result: useId(), rating: useId(), notes: useId() };
  const [result, setResult] = useState(round.result);
  const [rating, setRating] = useState(round.selfRating ? String(round.selfRating) : "");
  const [notes, setNotes] = useState(round.notes ?? "");
  const [pending, startTransition] = useTransition();
  const label = ROUND_TYPES[round.roundType] ?? round.roundType;
  const changed =
    result !== round.result ||
    rating !== (round.selfRating ? String(round.selfRating) : "") ||
    notes !== (round.notes ?? "");

  return (
    <li className="space-y-3 rounded-lg border p-3">
      <p className="text-sm font-medium">
        {label}
        {round.scheduledAt && (
          <span className="font-normal text-muted-foreground"> · {formatDate(round.scheduledAt)}</span>
        )}
      </p>
      <form
        className="space-y-3"
        aria-label={`${label} round`}
        onSubmit={(e) => {
          e.preventDefault();
          startTransition(async () => {
            const saved = await updateRoundAction({
              roundId: round.id,
              result,
              selfRating: rating ? Number(rating) : null,
              notes,
            });
            if (saved.ok) toast.success("Round saved.");
            else toast.error(saved.message);
          });
        }}
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor={ids.result}>Result</FieldLabel>
            <NativeSelect id={ids.result} value={result} onChange={(e) => setResult(e.target.value as typeof result)}>
              {Object.entries(ROUND_RESULTS).map(([value, text]) => (
                <option key={value} value={value}>
                  {text}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field>
            <FieldLabel htmlFor={ids.rating}>How it went for you</FieldLabel>
            <NativeSelect id={ids.rating} value={rating} onChange={(e) => setRating(e.target.value)}>
              <option value="">Not rated</option>
              {[1, 2, 3, 4, 5].map((n) => (
                <option key={n} value={n}>
                  {n} of 5
                </option>
              ))}
            </NativeSelect>
          </Field>
        </div>
        <Field>
          <FieldLabel htmlFor={ids.notes}>Notes and questions asked</FieldLabel>
          <Textarea id={ids.notes} rows={2} maxLength={2000} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
        <Button type="submit" size="sm" disabled={pending || !changed}>
          Save round
        </Button>
      </form>
    </li>
  );
}
