"use client";

import { useOptimistic, useState, useTransition } from "react";
import Link from "next/link";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  pointerWithin,
  rectIntersection,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type Announcements,
  type CollisionDetection,
  type DragEndEvent,
  type KeyboardCoordinateGetter,
} from "@dnd-kit/core";
import { CalendarClock, GripVertical } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { IDLE_DAYS } from "@/lib/applications/activity";
import {
  CLOSED_STATUSES,
  ROUND_TYPES,
  STAGE_STATUSES,
  STATUS_LABELS,
  isClosed,
  stageOf,
  type ApplicationStatus,
} from "@/lib/applications/status";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { PipelineCard, SavedCard } from "@/server/services/pipeline";
import {
  AddRoundDialog,
  StatusBadge,
  StatusChangeDialog,
  runStatusChange,
  type StatusChangeValues,
} from "./status-controls";

/** Board columns: the six stages, then one column for every way an application ends. */
const COLUMNS = [...STAGE_STATUSES, "CLOSED"] as const;
type ColumnId = (typeof COLUMNS)[number];
const COLUMN_LABELS: Record<ColumnId, string> = { ...STATUS_LABELS, CLOSED: "Closed" };
const columnOf = (status: string): ColumnId => (isClosed(status) ? "CLOSED" : (status as ColumnId));

/**
 * Arrow keys move a lifted card to the next or previous stage in board order (the default moves it a few pixels).
 * The columns wrap onto rows instead of scrolling sideways: dnd-kit's keyboard sensor scrolls a scrolling container
 * instead of moving the card, so a card could never reach a column outside the visible part.
 */
const columnKeyboardCoordinates: KeyboardCoordinateGetter = (event, { context }) => {
  const { collisionRect, droppableRects, over } = context;
  if (!collisionRect || (event.code !== "ArrowRight" && event.code !== "ArrowLeft")) return undefined;
  event.preventDefault();
  const x = collisionRect.left + collisionRect.width / 2;
  const y = collisionRect.top + collisionRect.height / 2;
  const under = COLUMNS.findIndex((id) => {
    const r = droppableRects.get(id);
    return r && x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
  });
  const from = under >= 0 ? under : COLUMNS.indexOf(over?.id as ColumnId);
  const target = droppableRects.get(COLUMNS[from + (event.code === "ArrowRight" ? 1 : -1)]);
  if (from < 0 || !target) return undefined;
  return { x: target.left + (target.width - collisionRect.width) / 2, y: target.top + 40 };
};

// The pointer decides while dragging with a mouse or finger; a keyboard drag has no pointer, so use overlap.
const collision: CollisionDetection = (args) => {
  const hits = pointerWithin(args);
  return hits.length ? hits : rectIntersection(args);
};

/** The pipeline board (SPEC §13): drag cards between stages by mouse, touch or keyboard; updates are optimistic. */
export function PipelineBoard({ cards, saved }: { cards: PipelineCard[]; saved: SavedCard[] }) {
  const [optimistic, moveCard] = useOptimistic(cards, (state, move: { id: string; status: ApplicationStatus }) =>
    state.map((c) =>
      c.id === move.id
        ? { ...c, status: move.status, stageReached: Math.max(c.stageReached, stageOf(move.status) ?? 0) }
        : c,
    ),
  );
  const [, startTransition] = useTransition();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [closing, setClosing] = useState<PipelineCard | null>(null);
  const [roundFor, setRoundFor] = useState<string | null>(null);
  const sensors = useSensors(
    // A small distance lets the handle's click and focus work without starting a drag.
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: columnKeyboardCoordinates }),
  );
  const byId = new Map(optimistic.map((c) => [c.id, c]));
  const titleOf = (id: string | number) => byId.get(String(id))?.title ?? "the application";
  const columnName = (id: string | number | undefined) => (id ? COLUMN_LABELS[id as ColumnId] : "no column");

  const announcements: Announcements = {
    onDragStart: ({ active }) => `Picked up ${titleOf(active.id)}. Use the left and right arrows to change stage.`,
    onDragOver: ({ active, over }) => `${titleOf(active.id)} is over ${columnName(over?.id)}.`,
    onDragEnd: ({ active, over }) =>
      over ? `${titleOf(active.id)} dropped on ${columnName(over.id)}.` : `${titleOf(active.id)} put back.`,
    onDragCancel: ({ active }) => `Moving ${titleOf(active.id)} cancelled.`,
  };

  const move = (card: PipelineCard, values: StatusChangeValues) =>
    new Promise<boolean>((resolve) =>
      startTransition(async () => {
        moveCard({ id: card.id, status: values.to });
        resolve(await runStatusChange(card.id, values, () => setRoundFor(card.id)));
      }),
    );

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    setActiveId(null);
    const card = byId.get(String(active.id));
    const column = over?.id as ColumnId | undefined;
    if (!card || !column || column === columnOf(card.status)) return;
    // Closing asks how it ended (and, for a rejection, why); a stage move happens at once, with Undo.
    if (column === "CLOSED") return setClosing(card);
    void move(card, {
      to: column,
      occurredAt: new Date().toISOString(),
      rejectionReason: null,
      rejectedAtStage: null,
      note: "",
    });
  };

  const active = activeId ? byId.get(activeId) : undefined;

  return (
    <>
      <p className="text-xs text-muted-foreground">
        Drag a card by its handle. With a keyboard: focus the handle, press Space, use the arrow keys, then Space again.
      </p>
      <DndContext
        sensors={sensors}
        collisionDetection={collision}
        accessibility={{
          announcements,
          screenReaderInstructions: {
            draggable:
              "To move an application to another stage, press Space, use the left and right arrow keys, then press Space to drop or Escape to cancel.",
          },
        }}
        onDragStart={({ active }) => setActiveId(String(active.id))}
        onDragCancel={() => setActiveId(null)}
        onDragEnd={onDragEnd}
      >
        <div className="grid grid-cols-[repeat(auto-fill,minmax(13rem,1fr))] gap-3">
          {saved.length > 0 && <SavedColumn saved={saved} />}
          {COLUMNS.map((column) => (
            <Column key={column} id={column} cards={optimistic.filter((c) => columnOf(c.status) === column)} />
          ))}
        </div>
        <DragOverlay>{active ? <CardBody card={active} lifted /> : null}</DragOverlay>
      </DndContext>
      {closing && (
        <StatusChangeDialog
          app={closing}
          to="REJECTED"
          choices={[...CLOSED_STATUSES]}
          onCancel={() => setClosing(null)}
          onConfirm={async (values) => {
            const card = closing;
            setClosing(null);
            await move(card, values);
          }}
        />
      )}
      {roundFor && (
        <AddRoundDialog applicationId={roundFor} open prompt onOpenChange={(open) => !open && setRoundFor(null)} />
      )}
    </>
  );
}

function Column({ id, cards }: { id: ColumnId; cards: PipelineCard[] }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  const headingId = `column-${id}`;
  return (
    <section
      ref={setNodeRef}
      aria-labelledby={headingId}
      className={cn(
        "flex min-w-0 flex-col gap-2 rounded-xl border bg-muted/30 p-2 transition-colors",
        isOver && "border-brand bg-brand/5",
      )}
    >
      <h2 id={headingId} className="flex items-center justify-between px-1 text-sm font-semibold">
        {COLUMN_LABELS[id]}
        <span className="text-xs font-normal text-muted-foreground tabular-nums">{cards.length}</span>
      </h2>
      <ul className="flex min-h-24 flex-col gap-2" aria-label={`${COLUMN_LABELS[id]} applications`}>
        {cards.map((card) => (
          <DraggableCard key={card.id} card={card} />
        ))}
        {cards.length === 0 && <li className="px-1 py-6 text-center text-xs text-muted-foreground">Nothing here</li>}
      </ul>
    </section>
  );
}

function DraggableCard({ card }: { card: PipelineCard }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: card.id });
  return (
    <li ref={setNodeRef} className={cn(isDragging && "opacity-40")}>
      <CardBody
        card={card}
        handle={
          <button
            type="button"
            className="flex size-7 shrink-0 cursor-grab touch-none items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            aria-label={`Move ${card.title} at ${card.companyName}`}
            {...attributes}
            {...listeners}
          >
            <GripVertical className="size-4" aria-hidden="true" />
          </button>
        }
      />
    </li>
  );
}

function CardBody({ card, handle, lifted }: { card: PipelineCard; handle?: React.ReactNode; lifted?: boolean }) {
  const idle = card.idleDays !== null && card.idleDays >= IDLE_DAYS;
  return (
    <div
      className={cn(
        "space-y-2 rounded-lg border bg-card p-2.5 text-sm shadow-xs",
        idle && "border-warning/60",
        lifted && "rotate-1 shadow-lg",
      )}
    >
      <div className="flex items-start gap-1">
        <div className="min-w-0 flex-1">
          <Link href={`/applications/${card.id}`} className="font-medium hover:underline">
            {card.title}
          </Link>
          <p className="truncate text-xs text-muted-foreground">{card.companyName}</p>
        </div>
        {handle ?? (
          <span className="flex size-7 shrink-0 items-center justify-center text-muted-foreground">
            <GripVertical className="size-4" aria-hidden="true" />
          </span>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-1">
        {isClosed(card.status) && <StatusBadge status={card.status} />}
        {card.fitScore !== null && <Badge variant="outline">Fit {card.fitScore}</Badge>}
        {card.isReferral && <Badge variant="info">Referral</Badge>}
        {card.inbound && <Badge variant="outline">Recruiter first</Badge>}
        {idle && <Badge variant="warning">Idle {card.idleDays} days</Badge>}
      </div>
      {card.nextRound && (
        <p className="flex items-center gap-1 text-xs">
          <CalendarClock className="size-3.5 text-muted-foreground" aria-hidden="true" />
          {ROUND_TYPES[card.nextRound.roundType]} · {formatDate(card.nextRound.scheduledAt)}
        </p>
      )}
      <p className="text-xs text-muted-foreground">
        Applied {formatDate(card.appliedAt)}
        {card.ghostedSuggested && " · no reply yet: ghosted?"}
      </p>
    </div>
  );
}

function SavedColumn({ saved }: { saved: SavedCard[] }) {
  return (
    <section aria-labelledby="column-saved" className="flex min-w-0 flex-col gap-2 rounded-xl border border-dashed p-2">
      <h2 id="column-saved" className="flex items-center justify-between px-1 text-sm font-semibold">
        Saved
        <span className="text-xs font-normal text-muted-foreground tabular-nums">{saved.length}</span>
      </h2>
      <p className="px-1 text-xs text-muted-foreground">Jobs you saved. Open one and use “Mark as applied”.</p>
      <ul className="flex flex-col gap-2" aria-label="Saved jobs">
        {saved.map((job) => (
          <li key={job.jobId} className="rounded-lg border bg-card p-2.5 text-sm">
            <Link href={`/jobs/${job.jobId}`} className="font-medium hover:underline">
              {job.title}
            </Link>
            <p className="truncate text-xs text-muted-foreground">
              {[job.companyName, job.city?.replace("Remote-India", "Remote")].filter(Boolean).join(" · ")}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}
