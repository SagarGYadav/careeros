"use client";

import { useTransition } from "react";
import { ArrowDown, ArrowUp, PlugZap } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatRelative } from "@/lib/format";
import type { ProviderStatus } from "@/lib/providers/chain";
import {
  moveProviderAction,
  setProviderEnabledAction,
  testProviderAction,
} from "@/app/(app)/settings/services/actions";
import { ProviderStateBadge } from "./status-badge";

/** Dates arrive as ISO strings from the server component. */
export type ProviderRow = Omit<ProviderStatus, "until" | "lastSuccessAt"> & {
  until: string | null;
  lastSuccessAt: string | null;
  models: string;
};

const PERIOD_LABEL = { minute: "this minute", day: "today", month: "this month" } as const;

function roleLabel(rows: ProviderRow[], index: number): string {
  const row = rows[index];
  if (row.isMock) return "Dev only";
  const realBefore = rows.slice(0, index).filter((r) => !r.isMock).length;
  return realBefore === 0 ? "Main" : `Backup ${realBefore}`;
}

export function ProviderChainTable({ service, rows }: { service: "ai"; rows: ProviderRow[] }) {
  const [pending, startTransition] = useTransition();

  const run = (action: () => Promise<void>) => startTransition(action);

  return (
    <div className="overflow-x-auto rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-24">Role</TableHead>
            <TableHead>Provider</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Usage</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row, index) => (
            <TableRow key={row.name} className={row.enabled ? undefined : "opacity-60"}>
              <TableCell>
                <Badge variant={roleLabel(rows, index) === "Main" ? "brand" : "outline"}>
                  {roleLabel(rows, index)}
                </Badge>
              </TableCell>
              <TableCell>
                <div className="font-medium">{row.label}</div>
                <div className="font-mono text-xs text-muted-foreground">{row.models}</div>
              </TableCell>
              <TableCell>
                <div className="flex flex-col items-start gap-1">
                  <ProviderStateBadge state={row.state} />
                  {row.state !== "ok" && (
                    <span className="text-xs text-muted-foreground">
                      {row.description}
                      {row.until ? ` · back ${formatRelative(row.until)}` : ""}
                    </span>
                  )}
                </div>
              </TableCell>
              <TableCell className="text-sm tabular-nums">
                {row.usage.length === 0 ? (
                  <span className="text-muted-foreground">No limits</span>
                ) : (
                  row.usage
                    .filter((u) => u.kind !== "minute")
                    .map((u) => (
                      <div key={u.kind}>
                        {u.used} / {u.limit} <span className="text-muted-foreground">{PERIOD_LABEL[u.kind]}</span>
                      </div>
                    ))
                )}
              </TableCell>
              <TableCell>
                <div className="flex justify-end gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Move ${row.label} up`}
                    disabled={pending || index === 0}
                    onClick={() => run(() => moveProviderAction({ service, name: row.name, direction: "up" }))}
                  >
                    <ArrowUp />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Move ${row.label} down`}
                    disabled={pending || index === rows.length - 1}
                    onClick={() => run(() => moveProviderAction({ service, name: row.name, direction: "down" }))}
                  >
                    <ArrowDown />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={pending}
                    onClick={() =>
                      run(() => setProviderEnabledAction({ service, name: row.name, enabled: !row.enabled }))
                    }
                  >
                    {row.enabled ? "Turn off" : "Turn on"}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={pending || !row.configured}
                    onClick={() =>
                      run(async () => {
                        const result = await testProviderAction({ service, name: row.name });
                        if (result.ok) toast.success(`${row.label}: ${result.message}`);
                        else toast.error(`${row.label}: ${result.message}`);
                      })
                    }
                  >
                    <PlugZap />
                    Test
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
