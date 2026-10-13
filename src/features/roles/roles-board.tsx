"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Sparkles, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  addRoleAction,
  deleteRoleAction,
  restoreRoleAction,
  setRoleSelectedAction,
  suggestRolesAction,
  updateRoleAction,
} from "@/app/(app)/jobs/roles/actions";
import { TrustBadge } from "@/components/trust-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { TagsInput } from "@/features/profile/inputs";
import { SENIORITY_LABELS, type RoleCategory } from "@/lib/roles/categorize";
import { toastWithUndo } from "@/lib/toast";
import type { TargetRoleView } from "@/server/services/target-roles";

const GROUPS: { category: RoleCategory; title: string; description: string }[] = [
  { category: "core", title: "Core", description: "You hold 70% or more of the core skills at level 3+." },
  { category: "adjacent", title: "Adjacent", description: "You hold 40–69% of the core skills: a short step away." },
  {
    category: "stretch",
    title: "Stretch",
    description: "Under 40% of the core skills so far: worth it with some learning.",
  },
];

const CATEGORY_VARIANT: Record<RoleCategory, "success" | "info" | "outline"> = {
  core: "success",
  adjacent: "info",
  stretch: "outline",
};

export function SuggestRolesButton({ label = "Suggest roles", variant }: { label?: string; variant?: "outline" }) {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      variant={variant}
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const result = await suggestRolesAction();
          if (!result.ok) return void toast.error(result.message);
          const how =
            result.data.provider === "mock"
              ? " (mock AI)"
              : result.data.mode === "no_ai"
                ? " without AI (AI unavailable)"
                : "";
          toast.success(`${result.data.added} roles suggested${how}.`);
        })
      }
    >
      <Sparkles aria-hidden="true" />
      {pending ? "Reading your profile…" : label}
    </Button>
  );
}

export function AddRoleForm() {
  const [title, setTitle] = useState("");
  const [pending, startTransition] = useTransition();
  return (
    <form
      className="flex flex-wrap items-center gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        if (!title.trim()) return;
        startTransition(async () => {
          const result = await addRoleAction({ title });
          if (!result.ok) return void toast.error(result.message);
          toast.success(`Added ${title.trim()}.`);
          setTitle("");
        });
      }}
    >
      <Input
        aria-label="Job title to add"
        placeholder="Add a role, e.g. Frontend Engineer"
        className="w-64"
        value={title}
        onChange={(event) => setTitle(event.target.value)}
      />
      <Button type="submit" variant="outline" disabled={pending || !title.trim()}>
        Add role
      </Button>
    </form>
  );
}

function EvidenceChip({ id, text }: { id: string; text: string }) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            type="button"
            className="inline-flex h-6 items-center rounded border px-1.5 font-mono text-[11px] text-muted-foreground hover:text-foreground"
          />
        }
      >
        {id}
        <span className="sr-only">: {text}</span>
      </TooltipTrigger>
      <TooltipContent className="max-w-80">{text}</TooltipContent>
    </Tooltip>
  );
}

function RoleCard({ role }: { role: TargetRoleView }) {
  const [pending, startTransition] = useTransition();
  const save = (data: { titleVariants?: string[]; keywords?: string[] }) =>
    startTransition(async () => {
      const result = await updateRoleAction({ id: role.id, ...data });
      if (!result.ok) toast.error(result.message);
    });

  return (
    <Card size="sm" className={role.selected ? "ring-brand/50" : undefined}>
      <CardHeader>
        <div className="flex items-start gap-3">
          <input
            type="checkbox"
            className="mt-1 size-4 accent-[var(--brand)]"
            aria-label={`Use ${role.title} in job search`}
            checked={role.selected}
            disabled={pending}
            onChange={(event) => {
              const selected = event.target.checked;
              startTransition(async () => {
                const result = await setRoleSelectedAction({ id: role.id, selected });
                if (!result.ok) toast.error(result.message);
              });
            }}
          />
          <div className="min-w-0 flex-1 space-y-1">
            <CardTitle as="h3">{role.title}</CardTitle>
            <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
              <Badge variant={CATEGORY_VARIANT[role.category]}>
                {role.category.charAt(0).toUpperCase() + role.category.slice(1)}
              </Badge>
              <Badge variant="outline">{SENIORITY_LABELS[role.seniority] ?? role.seniority}</Badge>
              {role.coverage.total > 0 && (
                <span className="inline-flex items-center gap-1">
                  {role.coverage.held.length} of {role.coverage.total} core skills
                  <TrustBadge kind="calc" />
                </span>
              )}
              {role.familyName && role.familyName !== role.title && <span>· {role.familyName}</span>}
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Remove role ${role.title}`}
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const result = await deleteRoleAction(role.id);
                if (!result.ok) return void toast.error(result.message);
                toastWithUndo(`Removed ${role.title}.`, async () => {
                  const restored = await restoreRoleAction({
                    title: role.title,
                    reason: role.reason,
                    reasonVerified: role.reasonVerified,
                    evidenceIds: role.evidence.map((e) => e.id),
                    titleVariants: role.titleVariants,
                    keywords: role.keywords,
                    source: role.source,
                    selected: role.selected,
                    roleFamilyId: role.roleFamilyId,
                  });
                  if (!restored.ok) toast.error(restored.message);
                });
              })
            }
          >
            <Trash2 aria-hidden="true" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {role.reason && (
          <div className="space-y-1.5">
            {/* Citations show as evidence chips below, so the [E3] markers are taken out of the sentence. */}
            <p className="text-sm">{role.reason.replace(/\s*\[E\d+(?:\s*,\s*E\d+)*\]/g, "").trim()}</p>
            <div className="flex flex-wrap items-center gap-1.5">
              <TrustBadge kind="ai" />
              {!role.reasonVerified && (
                <Badge
                  variant="warning"
                  title="The reason cites evidence or numbers that couldn't be checked against your CV"
                >
                  Unverified
                </Badge>
              )}
              {role.evidence.map((e) => (
                <EvidenceChip key={e.id} id={e.id} text={e.text} />
              ))}
            </div>
          </div>
        )}
        {role.coverage.missing.length > 0 && (
          <p className="text-xs text-muted-foreground">
            Core skills not yet at level 3: {role.coverage.missing.join(", ")}
          </p>
        )}
        {role.market && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg bg-muted/50 px-3 py-2 text-xs">
            <span>
              <span className="font-medium tabular-nums">{role.market.openings}</span>{" "}
              {role.market.openings === 1 ? "opening" : "openings"} found in 30 days
            </span>
            {role.market.averageRelevance !== null && (
              <span>
                average relevance <span className="font-medium tabular-nums">{role.market.averageRelevance}</span>
              </span>
            )}
            {role.market.topMissingSkill && (
              <span>
                most asked-for skill you lack: <span className="font-medium">{role.market.topMissingSkill}</span>
              </span>
            )}
            <TrustBadge kind="calc" />
            {role.market.openings > 0 && (
              <Link href={`/jobs?role=${role.id}`} className="ml-auto underline underline-offset-2">
                See jobs<span className="sr-only"> for {role.title}</span>
              </Link>
            )}
          </div>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <label htmlFor={`${role.id}-variants`} className="text-xs font-medium">
              Search titles
            </label>
            <TagsInput
              id={`${role.id}-variants`}
              value={role.titleVariants}
              onChange={(titleVariants) => save({ titleVariants })}
              itemName="search title"
              placeholder="Add a title"
            />
          </div>
          <div className="space-y-1">
            <label htmlFor={`${role.id}-keywords`} className="text-xs font-medium">
              Keywords
            </label>
            <TagsInput
              id={`${role.id}-keywords`}
              value={role.keywords}
              onChange={(keywords) => save({ keywords })}
              itemName="keyword"
              placeholder="Add a keyword"
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function RolesBoard({ roles }: { roles: TargetRoleView[] }) {
  const selected = roles.filter((r) => r.selected).length;
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {selected} of {roles.length} roles selected for job search.
        </p>
        <AddRoleForm />
      </div>
      {GROUPS.map((group) => {
        const inGroup = roles.filter((r) => r.category === group.category);
        if (!inGroup.length) return null;
        return (
          <section key={group.category} aria-labelledby={`group-${group.category}`} className="space-y-3">
            <div>
              <h2 id={`group-${group.category}`} className="text-sm font-semibold">
                {group.title} <span className="font-normal text-muted-foreground">({inGroup.length})</span>
              </h2>
              <p className="text-xs text-muted-foreground">{group.description}</p>
            </div>
            <div className="grid gap-3 lg:grid-cols-2">
              {inGroup.map((role) => (
                <RoleCard key={role.id} role={role} />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
