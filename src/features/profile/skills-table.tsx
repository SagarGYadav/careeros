"use client";

import { useState, useTransition } from "react";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  addSkillAction,
  confirmSkillsAction,
  deleteSkillAction,
  setSkillProficiencyAction,
} from "@/app/(app)/profile/actions";
import { DataTable, dataTableColumns } from "@/components/data-table/data-table";
import { SortableHeader } from "@/components/data-table/sortable-header";
import { TrustBadge } from "@/components/trust-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PROFICIENCY_LABELS } from "@/lib/validation/profile";
import { NativeSelect } from "./inputs";

export type SkillRow = {
  id: string;
  name: string;
  category: string;
  proficiency: number;
  proficiencySource: string;
  proficiencyReason: string | null;
  years: number | null;
  lastUsedYear: number | null;
  evidenceCount: number;
  source: string;
  confirmed: boolean;
  unreviewed: boolean;
};

const SOURCE_LABELS: Record<string, string> = {
  cv_section: "Skills section",
  cv_inferred: "Used in experience",
  self: "Added by you",
  import: "Imported",
};

function ProficiencyCell({ row }: { row: SkillRow }) {
  const [pending, startTransition] = useTransition();
  return (
    <div className="space-y-0.5">
      <NativeSelect
        aria-label={`Proficiency in ${row.name}`}
        className="h-7 w-44"
        defaultValue={String(row.proficiency)}
        disabled={pending}
        onChange={(event) => {
          const proficiency = Number(event.target.value);
          startTransition(async () => {
            const result = await setSkillProficiencyAction({ id: row.id, proficiency });
            if (!result.ok) toast.error(result.message);
          });
        }}
      >
        {Object.entries(PROFICIENCY_LABELS).map(([value, label]) => (
          <option key={value} value={value}>
            {value} · {label}
          </option>
        ))}
      </NativeSelect>
      {row.proficiencySource === "rule" && row.proficiencyReason && (
        <p className="max-w-56 text-xs text-muted-foreground">Based on your CV: {row.proficiencyReason}</p>
      )}
    </div>
  );
}

function RemoveCell({ row }: { row: SkillRow }) {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      aria-label={`Remove ${row.name}`}
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const result = await deleteSkillAction(row.id);
          if (result.ok) toast.success(`Removed ${row.name}.`);
          else toast.error(result.message);
        })
      }
    >
      <Trash2 aria-hidden="true" />
    </Button>
  );
}

const col = dataTableColumns<SkillRow>();

const columns = col.columns([
  col.accessor("name", {
    header: ({ column }) => <SortableHeader column={column} title="Skill" />,
    enableHiding: false,
    cell: ({ row }) => (
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="font-medium">{row.original.name}</span>
        {row.original.unreviewed && (
          <Badge variant="outline" title="Not in the CareerOS skill catalogue yet">
            New
          </Badge>
        )}
        {!row.original.confirmed && <Badge variant="info">Suggested</Badge>}
      </div>
    ),
  }),
  col.accessor("proficiency", {
    header: ({ column }) => <SortableHeader column={column} title="Level" />,
    cell: ({ row }) => <ProficiencyCell row={row.original} />,
  }),
  col.accessor("years", {
    header: ({ column }) => <SortableHeader column={column} title="Years used" />,
    cell: ({ row }) =>
      row.original.years ? (
        <span className="inline-flex items-center gap-1.5 tabular-nums">
          {row.original.years}
          <TrustBadge kind="calc" />
        </span>
      ) : (
        <span className="text-muted-foreground">—</span>
      ),
  }),
  col.accessor("lastUsedYear", {
    header: "Last used",
    cell: ({ row }) => <span className="tabular-nums">{row.original.lastUsedYear ?? "—"}</span>,
  }),
  col.accessor("source", {
    header: "From",
    cell: ({ row }) => (
      <span className="text-muted-foreground">
        {SOURCE_LABELS[row.original.source] ?? row.original.source}
        {row.original.evidenceCount > 0 &&
          ` · ${row.original.evidenceCount} ${row.original.evidenceCount === 1 ? "mention" : "mentions"}`}
      </span>
    ),
  }),
  col.display({ id: "actions", header: "", cell: ({ row }) => <RemoveCell row={row.original} /> }),
]);

function AddSkill() {
  const [name, setName] = useState("");
  const [proficiency, setProficiency] = useState("3");
  const [pending, startTransition] = useTransition();
  return (
    <form
      className="flex flex-wrap items-end gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        if (!name.trim()) return;
        startTransition(async () => {
          const result = await addSkillAction({ name, proficiency: Number(proficiency) });
          if (!result.ok) return void toast.error(result.message);
          toast.success(`Added ${name.trim()}.`);
          setName("");
        });
      }}
    >
      <Input
        aria-label="Skill name"
        placeholder="Add a skill, e.g. GraphQL"
        className="w-56"
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      <NativeSelect
        aria-label="Proficiency"
        className="w-44"
        value={proficiency}
        onChange={(e) => setProficiency(e.target.value)}
      >
        {Object.entries(PROFICIENCY_LABELS).map(([value, label]) => (
          <option key={value} value={value}>
            {value} · {label}
          </option>
        ))}
      </NativeSelect>
      <Button type="submit" variant="outline" disabled={pending || !name.trim()}>
        Add skill
      </Button>
    </form>
  );
}

export function SkillsTable({ rows }: { rows: SkillRow[] }) {
  const unconfirmed = rows.filter((r) => !r.confirmed).map((r) => r.id);
  const [pending, startTransition] = useTransition();
  return (
    <div className="space-y-4">
      <AddSkill />
      <DataTable
        columns={columns}
        data={rows}
        filterPlaceholder="Filter skills…"
        toolbar={
          unconfirmed.length > 0 && (
            <Button
              size="sm"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  const result = await confirmSkillsAction(unconfirmed);
                  if (result.ok) toast.success("Suggested levels confirmed.");
                  else toast.error(result.message);
                })
              }
            >
              Confirm {unconfirmed.length} suggested
            </Button>
          )
        }
      />
    </div>
  );
}
