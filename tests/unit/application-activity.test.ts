import { describe, expect, it } from "vitest";
import { idleDays, isIdle, suggestsGhosted, todaysActions, type ActionInput } from "@/lib/applications/activity";

const NOW = new Date("2026-10-16T06:00:00Z");
const DAY = 86_400_000;
const daysAgo = (n: number) => new Date(NOW.getTime() - n * DAY);
const inDays = (n: number) => new Date(NOW.getTime() + n * DAY);

const app = (over: Partial<ActionInput> = {}): ActionInput => ({
  id: "a1",
  title: "Frontend Engineer",
  companyName: "Kestrel Pay",
  status: "APPLIED",
  lastActivityAt: daysAgo(2),
  followUpAt: null,
  offerDecision: null,
  rounds: [],
  ...over,
});
const label = (type: string) => ({ technical: "Technical", hr: "HR" })[type] ?? type;

describe("activity ageing", () => {
  it("counts idle days on open applications only, highlighting from 14", () => {
    expect(idleDays(app({ lastActivityAt: daysAgo(13.5) }), NOW)).toBe(13);
    expect(isIdle(app({ lastActivityAt: daysAgo(13.5) }), NOW)).toBe(false);
    expect(isIdle(app({ lastActivityAt: daysAgo(14) }), NOW)).toBe(true);
    expect(idleDays(app({ status: "REJECTED", lastActivityAt: daysAgo(90) }), NOW)).toBeNull();
  });

  it("suggests ghosted after 30 quiet days, only while still Applied", () => {
    expect(suggestsGhosted(app({ lastActivityAt: daysAgo(30) }), NOW)).toBe(true);
    expect(suggestsGhosted(app({ lastActivityAt: daysAgo(29) }), NOW)).toBe(false);
    expect(suggestsGhosted(app({ status: "INTERVIEW", lastActivityAt: daysAgo(40) }), NOW)).toBe(false);
  });
});

describe("Today's actions", () => {
  it("lists interviews, follow-ups, offers, ghosting and idle applications, most urgent first", () => {
    const actions = todaysActions(
      [
        app({ id: "idle", status: "ASSESSMENT", lastActivityAt: daysAgo(15) }),
        app({ id: "ghost", lastActivityAt: daysAgo(31) }),
        app({ id: "offer", status: "OFFER", offerDecision: "pending" }),
        app({ id: "follow", followUpAt: new Date(NOW.getTime() + 3 * 3600_000) }),
        app({
          id: "interview",
          status: "INTERVIEW",
          rounds: [{ roundType: "technical", scheduledAt: inDays(1), result: "pending" }],
        }),
        app({ id: "quiet-but-recent" }),
        app({ id: "closed", status: "REJECTED", lastActivityAt: daysAgo(60) }),
      ],
      NOW,
      label,
    );
    expect(actions.map((a) => [a.applicationId, a.detail])).toEqual([
      ["interview", "Technical round"],
      ["follow", "Follow up today"],
      ["offer", "Offer waiting for your decision"],
      ["ghost", "No reply in 31 days. Ghosted?"],
      ["idle", "No activity for 15 days"],
    ]);
  });

  it("asks to log a round that just happened, flags overdue follow-ups, and skips decided offers and far-off dates", () => {
    const actions = todaysActions(
      [
        app({
          id: "past-round",
          status: "INTERVIEW",
          rounds: [{ roundType: "hr", scheduledAt: daysAgo(0.5), result: "pending" }],
        }),
        app({
          id: "done-round",
          status: "INTERVIEW",
          rounds: [{ roundType: "hr", scheduledAt: daysAgo(0.5), result: "passed" }],
        }),
        app({
          id: "later-round",
          status: "INTERVIEW",
          rounds: [{ roundType: "hr", scheduledAt: inDays(5), result: "pending" }],
        }),
        app({ id: "overdue", followUpAt: daysAgo(3) }),
        app({ id: "future-follow", followUpAt: inDays(4) }),
        app({ id: "accepted", status: "OFFER", offerDecision: "accepted" }),
      ],
      NOW,
      label,
    );
    expect(actions.map((a) => [a.applicationId, a.detail])).toEqual([
      ["past-round", "HR round: log how it went"],
      ["overdue", "Follow-up overdue"],
    ]);
  });
});
