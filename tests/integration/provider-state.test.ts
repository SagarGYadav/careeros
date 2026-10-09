import { afterAll, describe, expect, it } from "vitest";
import { healthAfterFailure } from "@/lib/providers/chain";
import { db } from "@/server/db";
import { prismaProviderStore } from "@/server/repositories/provider-state";

// A provider name no real chain uses, removed afterwards.
const PROVIDER = `it-provider-${Date.now()}`;
const NOW = new Date("2026-10-09T10:30:00Z");

afterAll(async () => {
  await db.providerUsage.deleteMany({ where: { provider: PROVIDER } });
  await db.providerHealth.deleteMany({ where: { provider: PROVIDER } });
  await db.$disconnect();
});

describe("prismaProviderStore", () => {
  it("counts requests per minute, day and month", async () => {
    await prismaProviderStore.recordRequest("embeddings", PROVIDER, NOW);
    await prismaProviderStore.recordRequest("embeddings", PROVIDER, new Date(NOW.getTime() + 30_000));
    // Two minutes later: new minute, same day and month.
    await prismaProviderStore.recordRequest("embeddings", PROVIDER, new Date(NOW.getTime() + 120_000));

    expect(await prismaProviderStore.getUsage("embeddings", PROVIDER, NOW)).toEqual({ minute: 2, day: 3, month: 3 });
    expect(await prismaProviderStore.getUsage("embeddings", PROVIDER, new Date("2026-10-10T00:00:01Z"))).toEqual({
      minute: 0,
      day: 0,
      month: 3,
    });
  });

  it("saves and reloads provider health", async () => {
    const initial = await prismaProviderStore.getHealth("embeddings", PROVIDER);
    expect(initial.consecutiveFailures).toBe(0);

    const cooled = healthAfterFailure(initial, { kind: "rate_limited", retryAfterMs: 5_000, message: "429" }, NOW);
    await prismaProviderStore.saveHealth("embeddings", PROVIDER, cooled);
    const reloaded = await prismaProviderStore.getHealth("embeddings", PROVIDER);
    expect(reloaded).toMatchObject({
      consecutiveFailures: 1,
      lastErrorKind: "rate_limited",
      cooldownUntil: new Date(NOW.getTime() + 5_000),
    });
  });
});
