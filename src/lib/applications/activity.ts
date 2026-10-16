// Activity ageing and Today's actions (SPEC §5, §13). Pure: computed from dates in code, never by AI.
import { isClosed } from "./status";

/** An open application with no activity for this many days is highlighted as idle (SPEC §13). */
export const IDLE_DAYS = 14;
/** No reply from the employer for this many days suggests "Ghosted?" (SPEC §5 ghostDays); never set automatically. */
export const GHOST_DAYS = 30;

const DAY = 86_400_000;

/** Whole days between two times (never negative). */
export const daysBetween = (from: Date, to: Date) => Math.max(0, Math.floor((to.getTime() - from.getTime()) / DAY));

type Tracked = { status: string; lastActivityAt: Date };

/** Days since anything happened on an open application; null for a closed one (nothing to chase). */
export function idleDays(app: Tracked, now: Date): number | null {
  if (isClosed(app.status)) return null;
  return daysBetween(app.lastActivityAt, now);
}

export const isIdle = (app: Tracked, now: Date) => (idleDays(app, now) ?? 0) >= IDLE_DAYS;

/** Still "Applied" with nothing heard back for GHOST_DAYS: offer to mark it as ghosted. */
export const suggestsGhosted = (app: Tracked, now: Date) =>
  app.status === "APPLIED" && daysBetween(app.lastActivityAt, now) >= GHOST_DAYS;

export type ActionInput = {
  id: string;
  title: string;
  companyName: string;
  status: string;
  lastActivityAt: Date;
  followUpAt: Date | null;
  offerDecision: string | null;
  rounds: { roundType: string; scheduledAt: Date | null; result: string }[];
};

export type TodayAction = {
  applicationId: string;
  kind: "interview" | "follow_up" | "offer" | "ghosted" | "idle";
  title: string;
  /** Why it's on the list, e.g. "Technical round today" or "No activity for 16 days". */
  detail: string;
  /** When it's due; drives the order. */
  dueAt: Date;
};

const KIND_ORDER: TodayAction["kind"][] = ["interview", "follow_up", "offer", "ghosted", "idle"];

/**
 * What needs doing today, most urgent first: interviews in the next two days, follow-ups due, offers awaiting a
 * decision, possible ghosting and idle applications. One entry per application (its most urgent reason).
 * Dates picked in the browser are stored at local noon (see dateToIso), so "due today" is "within 12 hours of now":
 * that works in any time zone without knowing the user's.
 */
export function todaysActions(apps: ActionInput[], now: Date, roundLabel: (type: string) => string): TodayAction[] {
  const t = now.getTime();
  const actions: TodayAction[] = [];
  for (const app of apps) {
    if (isClosed(app.status)) continue;
    const base = { applicationId: app.id, title: `${app.title} · ${app.companyName}` };
    // A pending round from yesterday up to two days ahead (one that just happened still needs its result logged).
    const upcoming = app.rounds
      .filter((r) => r.result === "pending" && r.scheduledAt)
      .filter((r) => r.scheduledAt!.getTime() >= t - DAY && r.scheduledAt!.getTime() <= t + 2 * DAY)
      .sort((a, b) => a.scheduledAt!.getTime() - b.scheduledAt!.getTime())[0];
    const idle = idleDays(app, now) ?? 0;
    if (upcoming) {
      const past = upcoming.scheduledAt!.getTime() < t;
      actions.push({
        ...base,
        kind: "interview",
        detail: `${roundLabel(upcoming.roundType)} round${past ? ": log how it went" : ""}`,
        dueAt: upcoming.scheduledAt!,
      });
    } else if (app.followUpAt && app.followUpAt.getTime() <= t + DAY / 2) {
      const overdue = app.followUpAt.getTime() < t - DAY / 2;
      actions.push({
        ...base,
        kind: "follow_up",
        detail: overdue ? "Follow-up overdue" : "Follow up today",
        dueAt: app.followUpAt,
      });
    } else if (app.status === "OFFER" && (app.offerDecision ?? "pending") === "pending") {
      actions.push({ ...base, kind: "offer", detail: "Offer waiting for your decision", dueAt: app.lastActivityAt });
    } else if (suggestsGhosted(app, now)) {
      actions.push({
        ...base,
        kind: "ghosted",
        detail: `No reply in ${idle} days. Ghosted?`,
        dueAt: app.lastActivityAt,
      });
    } else if (idle >= IDLE_DAYS) {
      actions.push({ ...base, kind: "idle", detail: `No activity for ${idle} days`, dueAt: app.lastActivityAt });
    }
  }
  return actions.sort(
    (a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind) || a.dueAt.getTime() - b.dueAt.getTime(),
  );
}
