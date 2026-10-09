"use client";

import { DataTable, dataTableColumns } from "@/components/data-table/data-table";
import { SortableHeader } from "@/components/data-table/sortable-header";
import { Badge } from "@/components/ui/badge";
import { formatSalaryRange } from "@/lib/format";

type DemoRow = { company: string; title: string; city: string; min: number; max: number; score: number };

// Fictional sample rows for the component gallery.
const ROWS: DemoRow[] = [
  { company: "Kestrel Pay", title: "Frontend Engineer", city: "Bengaluru", min: 1000000, max: 1400000, score: 84 },
  { company: "Northfield Health", title: "React Developer", city: "Pune", min: 800000, max: 1100000, score: 77 },
  { company: "Lumen Logistics", title: "UI Engineer", city: "Remote-India", min: 900000, max: 1300000, score: 69 },
  { company: "Orbit Learning", title: "Next.js Developer", city: "Hyderabad", min: 700000, max: 1000000, score: 81 },
  { company: "Quill Commerce", title: "Full Stack Developer", city: "Gurugram", min: 1200000, max: 1800000, score: 58 },
];

const col = dataTableColumns<DemoRow>();

// Columns live at module scope: TanStack Table v9 needs stable column definitions.
const columns = col.columns([
  col.accessor("company", { header: "Company", enableHiding: false }),
  col.accessor("title", { header: "Role" }),
  col.accessor("city", { header: "City" }),
  col.accessor("min", {
    id: "salary",
    header: "Salary",
    cell: ({ row }) => <span className="tabular-nums">{formatSalaryRange(row.original.min, row.original.max)}</span>,
  }),
  col.accessor("score", {
    header: ({ column }) => <SortableHeader column={column} title="Fit" />,
    cell: ({ row }) => (
      <Badge variant={row.original.score >= 72 ? "success" : row.original.score >= 55 ? "warning" : "outline"}>
        <span className="tabular-nums">{row.original.score}</span>
      </Badge>
    ),
  }),
]);

export function DesignTableDemo() {
  return <DataTable columns={columns} data={ROWS} filterPlaceholder="Filter jobs…" pageSize={3} />;
}
