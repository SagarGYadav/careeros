// How fresh the For you feed is, against the test database: company-site jobs close when their board stops
// listing them (and reopen when it lists them again), "Older than 30 days" is worked out when the feed loads, and a
// job no search has returned for two weeks is flagged.
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { descriptionHash } from "@/lib/jobs/normalize";
import { db } from "@/server/db";
import { syncCompanySiteJobs } from "@/server/repositories/jobs";
import { getFeed } from "@/server/services/feed";

const EMAIL_DOMAIN = "@freshness.integration.careeros.test";
const NOW = new Date("2026-10-21T10:00:00Z");
const DAY = 86_400_000;
const daysAgo = (n: number) => new Date(NOW.getTime() - n * DAY);
let userId: string;

async function createJob(over: {
  title: string;
  provider?: string;
  externalId?: string;
  postedAt?: Date | null;
  lastSeenAt?: Date;
}) {
  const text = `${over.title} at Kestrel Pay. Build the merchant dashboard in React. ${randomUUID()}`;
  return db.job.create({
    data: {
      userId,
      title: over.title,
      companyName: "Kestrel Pay",
      descriptionRaw: text,
      descriptionHash: descriptionHash(text),
      origin: over.provider === "company_site" ? "deep_search" : "search",
      provider: over.provider ?? "jooble",
      externalId: over.externalId ?? randomUUID(),
      applyLinks: [],
      postedAt: over.postedAt === undefined ? daysAgo(3) : over.postedAt,
      discoveredAt: over.lastSeenAt ?? daysAgo(3),
      lastSeenAt: over.lastSeenAt ?? daysAgo(3),
      quickScore: 70,
      sortScore: 70,
      notFitReasons: [],
    },
  });
}

const feed = (group: "for_you" | "closed" | "stale") => getFeed(userId, { page: 1, filters: { group } }, NOW);

beforeAll(async () => {
  userId = randomUUID();
  await db.user.create({ data: { id: userId, name: "Freshness Test", email: `f-${userId}${EMAIL_DOMAIN}` } });
}, 60_000);

afterAll(async () => {
  await db.user.deleteMany({ where: { email: { endsWith: EMAIL_DOMAIN } } });
  await db.$disconnect();
});

describe("job freshness", () => {
  it("closes company-site jobs the board no longer lists, and reopens them if it lists them again", async () => {
    const kept = await createJob({
      title: "Frontend Engineer",
      provider: "company_site",
      externalId: "greenhouse:kestrelpay:4012001",
    });
    const removed = await createJob({
      title: "React Developer",
      provider: "company_site",
      externalId: "greenhouse:kestrelpay:4012002",
    });
    const otherBoard = await createJob({
      title: "UI Engineer",
      provider: "company_site",
      externalId: "lever:copperleaf:abc",
    });

    // The board now lists 4012001 and a job the user never had; 4012002 is gone.
    expect(await syncCompanySiteJobs(userId, "greenhouse:kestrelpay", ["4012001", "4019999"], NOW)).toEqual({
      closed: 1,
      stillOpen: 1,
    });
    const byId = async (id: string) => db.job.findUniqueOrThrow({ where: { id } });
    expect(await byId(removed.id)).toMatchObject({ closedAt: NOW, closedReason: "removed_from_company_site" });
    expect(await byId(kept.id)).toMatchObject({ closedAt: null, lastSeenAt: NOW });
    expect((await byId(otherBoard.id)).closedAt).toBeNull();

    const forYou = await feed("for_you");
    expect(forYou.cards.map((c) => c.id)).not.toContain(removed.id);
    expect(forYou.counts.closed).toBe(1);
    const closed = await feed("closed");
    expect(closed.cards).toMatchObject([{ id: removed.id, closedAt: NOW.toISOString() }]);

    // Listed again later: open again, seen now.
    const later = new Date(NOW.getTime() + DAY);
    await syncCompanySiteJobs(userId, "greenhouse:kestrelpay", ["4012001", "4012002"], later);
    expect(await byId(removed.id)).toMatchObject({ closedAt: null, closedReason: null, lastSeenAt: later });
  }, 60_000);

  it("ages jobs when the feed loads, not only when they were found", async () => {
    // Found when it was new, posted 40 days ago now: older than 30 days even though it was stored as fresh.
    const oldPosting = await createJob({ title: "Senior Frontend Engineer", postedAt: daysAgo(40) });
    // No posting date: aged by when a search last returned it.
    const unseen = await createJob({ title: "Web Developer", postedAt: null, lastSeenAt: daysAgo(35) });
    const fresh = await createJob({ title: "Next.js Engineer", postedAt: daysAgo(2) });

    const forYou = (await feed("for_you")).cards.map((c) => c.id);
    expect(forYou).toContain(fresh.id);
    expect(forYou).not.toContain(oldPosting.id);
    expect(forYou).not.toContain(unseen.id);
    const stale = await feed("stale");
    expect(stale.cards.map((c) => c.id)).toEqual(expect.arrayContaining([oldPosting.id, unseen.id]));
    expect(stale.cards.find((c) => c.id === oldPosting.id)).toMatchObject({ stale: true });
  }, 60_000);

  it("shows when a job was found and last seen, and flags one no recent search returned", async () => {
    const quiet = await createJob({ title: "Frontend Developer", lastSeenAt: daysAgo(20), postedAt: daysAgo(21) });
    const recent = await createJob({ title: "React Engineer", lastSeenAt: daysAgo(1), postedAt: daysAgo(2) });

    // No search has run since: nothing to compare with, so no flag.
    let cards = (await feed("for_you")).cards;
    expect(cards.find((c) => c.id === quiet.id)).toMatchObject({
      foundAt: daysAgo(20).toISOString(),
      lastSeenAt: daysAgo(20).toISOString(),
      notSeenSince: null,
    });

    await db.jobSearchRun.create({
      data: { userId, targetRoleIds: [], plan: {}, state: {}, status: "done", finishedAt: daysAgo(0.5) },
    });
    cards = (await feed("for_you")).cards;
    expect(cards.find((c) => c.id === quiet.id)?.notSeenSince).toBe(daysAgo(20).toISOString());
    expect(cards.find((c) => c.id === recent.id)?.notSeenSince).toBeNull();
  }, 60_000);
});
