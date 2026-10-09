import Link from "next/link";
import { Info, TriangleAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatRelative } from "@/lib/format";
import { getAiServiceSummary } from "@/server/services/service-status";

// Rule 3 in CLAUDE.md: when answers come from the mock provider, the UI must say so. These components read live
// provider state, so render them inside <Suspense>.

/** Header badge: Mock AI, Backup AI or AI paused. Renders nothing in the normal case. */
export async function AiStatusBadge() {
  const summary = await getAiServiceSummary();
  const badge = summary.allUnavailable
    ? { label: "AI paused", variant: "destructive" as const, tip: "Every AI provider is unavailable right now." }
    : summary.mockOnly
      ? {
          label: "Mock AI",
          variant: "warning" as const,
          tip: "No AI key is set, so AI features return sample answers. Add a free Gemini key in .env.",
        }
      : summary.usingBackup
        ? { label: "Backup AI", variant: "info" as const, tip: `Using ${summary.active?.label} as a backup.` }
        : null;
  if (!badge) return null;

  return (
    <Tooltip>
      <TooltipTrigger render={<Link href="/settings/services" aria-label={`${badge.label}: ${badge.tip}`} />}>
        <Badge variant={badge.variant}>{badge.label}</Badge>
      </TooltipTrigger>
      <TooltipContent className="max-w-64">{badge.tip}</TooltipContent>
    </Tooltip>
  );
}

/** Banner while a backup provider is answering, or when AI is paused (SPEC §7.3, §21). */
export async function AiServiceBanner() {
  const summary = await getAiServiceSummary();
  const { preferred, active } = summary;

  if (summary.usingBackup && preferred && active) {
    const back = preferred.until ? `, back ${formatRelative(preferred.until)}` : "";
    return (
      <Banner tone="info">
        AI is running on <strong>{active.label}</strong>. {preferred.label}: {preferred.description}
        {back}.
      </Banner>
    );
  }
  if (summary.allUnavailable && !summary.mockOnly) {
    const next = summary.providers.map((p) => p.until).filter((d): d is Date => Boolean(d));
    const soonest = next.length ? new Date(Math.min(...next.map((d) => d.getTime()))) : null;
    return (
      <Banner tone="warning">
        AI is paused: every free AI allowance is used up or unavailable. CareerOS keeps working without AI
        {soonest ? ` until it resets ${formatRelative(soonest)}` : ""}.
      </Banner>
    );
  }
  return null;
}

function Banner({ tone, children }: { tone: "info" | "warning"; children: React.ReactNode }) {
  const Icon = tone === "info" ? Info : TriangleAlert;
  return (
    <div
      role="status"
      className={
        tone === "info"
          ? "flex items-start gap-2 rounded-lg border border-info/30 bg-info/5 px-3 py-2 text-sm"
          : "flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-sm"
      }
    >
      <Icon className={tone === "info" ? "mt-0.5 size-4 text-info" : "mt-0.5 size-4 text-warning"} aria-hidden />
      <p>
        {children}{" "}
        <Link href="/settings/services" className="underline underline-offset-4">
          Details
        </Link>
      </p>
    </div>
  );
}
