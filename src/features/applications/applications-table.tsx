"use client";

import Link from "next/link";
import { DataTable, dataTableColumns } from "@/components/data-table/data-table";
import { SortableHeader } from "@/components/data-table/sortable-header";
import { Badge } from "@/components/ui/badge";
import { IDLE_DAYS } from "@/lib/applications/activity";
import { APPLICATION_SOURCES, STATUS_LABELS, type ApplicationSource } from "@/lib/applications/status";
import { formatDate } from "@/lib/format";
import type { PipelineCard } from "@/server/services/pipeline";
import { StatusBadge } from "./status-controls";

const col = dataTableColumns<PipelineCard>();

// Columns live at module scope: TanStack Table v9 needs stable column definitions.
const columns = col.columns([
  col.accessor("title", {
    header: ({ column }) => <SortableHeader column={column} title="Job" />,
    enableHiding: false,
    cell: ({ row }) => (
      <Link href={`/applications/${row.original.id}`} className="font-medium hover:underline">
        {row.original.title}
      </Link>
    ),
  }),
  col.accessor("companyName", { header: ({ column }) => <SortableHeader column={column} title="Company" /> }),
  col.accessor((row) => STATUS_LABELS[row.status as keyof typeof STATUS_LABELS] ?? row.status, {
    id: "status",
    header: ({ column }) => <SortableHeader column={column} title="Status" />,
    cell: ({ row }) => <StatusBadge status={row.original.status} />,
  }),
  col.accessor("appliedAt", {
    header: ({ column }) => <SortableHeader column={column} title="Applied" />,
    cell: ({ row }) => <span className="tabular-nums">{formatDate(row.original.appliedAt)}</span>,
  }),
  col.accessor("lastActivityAt", {
    header: ({ column }) => <SortableHeader column={column} title="Last activity" />,
    cell: ({ row }) => {
      const days = row.original.idleDays;
      return (
        <span className="flex flex-wrap items-center gap-1 tabular-nums">
          {formatDate(row.original.lastActivityAt)}
          {days !== null && days >= IDLE_DAYS && <Badge variant="warning">Idle {days} days</Badge>}
        </span>
      );
    },
  }),
  col.accessor((row) => APPLICATION_SOURCES[row.source as ApplicationSource] ?? row.source, {
    id: "source",
    header: "Where",
  }),
  col.accessor((row) => row.resumeName ?? "Not in CareerOS", { id: "cv", header: "CV version" }),
  col.accessor((row) => row.fitScore ?? -1, {
    id: "fit",
    header: ({ column }) => <SortableHeader column={column} title="Fit" />,
    cell: ({ row }) =>
      row.original.fitScore === null ? "—" : <span className="tabular-nums">{row.original.fitScore}</span>,
  }),
]);

/** The same applications as the board, as a sortable, filterable table (SPEC §13). */
export function ApplicationsTable({ cards }: { cards: PipelineCard[] }) {
  return (
    <DataTable
      columns={columns}
      data={cards}
      filterPlaceholder="Filter applications…"
      emptyState={
        <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
          No applications yet. Your saved jobs are on the board.
        </p>
      }
    />
  );
}
