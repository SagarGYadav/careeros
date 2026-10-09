import { describe, expect, it } from "vitest";
import {
  AllProvidersUnavailableError,
  checkAvailability,
  healthAfterFailure,
  healthAfterSuccess,
  orderProviders,
  providerStatus,
  runWithFailover,
} from "@/lib/providers/chain";
import { classifyHttpFailure, parseRetryAfter } from "@/lib/providers/classify";
import { MemoryProviderStore } from "@/lib/providers/memory-store";
import { nextReset } from "@/lib/providers/periods";
import { summariseService } from "@/lib/providers/summary";
import { HEALTHY, type ClassifiedFailure, type ProviderInfo } from "@/lib/providers/types";

const NOW = new Date("2026-10-09T10:30:00Z");
const ZERO = { minute: 0, day: 0, month: 0 };
const provider = (name: string, extra: Partial<ProviderInfo> = {}): ProviderInfo => ({
  name,
  label: name,
  configured: true,
  limits: { minute: 10, day: 100 },
  ...extra,
});

describe("checkAvailability", () => {
  it("skips unconfigured and disabled providers", () => {
    expect(checkAvailability(provider("a", { configured: false }), HEALTHY, ZERO, NOW)).toMatchObject({
      available: false,
      reason: "not_configured",
    });
    expect(checkAvailability(provider("a"), HEALTHY, ZERO, NOW, { disabled: true })).toMatchObject({
      reason: "disabled",
    });
  });

  it("respects cooldown, quota exhaustion and an open circuit until they expire", () => {
    const later = new Date(NOW.getTime() + 60_000);
    expect(checkAvailability(provider("a"), { ...HEALTHY, cooldownUntil: later }, ZERO, NOW)).toMatchObject({
      reason: "cooling_down",
      until: later,
    });
    expect(checkAvailability(provider("a"), { ...HEALTHY, exhaustedUntil: later }, ZERO, NOW)).toMatchObject({
      reason: "quota_exhausted",
    });
    expect(checkAvailability(provider("a"), { ...HEALTHY, circuitOpenUntil: later }, ZERO, NOW)).toMatchObject({
      reason: "circuit_open",
    });
    const past = new Date(NOW.getTime() - 1);
    expect(checkAvailability(provider("a"), { ...HEALTHY, cooldownUntil: past }, ZERO, NOW).available).toBe(true);
  });

  it("switches away at 90% of a limit, but allows the reserve when asked", () => {
    const usage = { ...ZERO, day: 90 };
    expect(checkAvailability(provider("a"), HEALTHY, usage, NOW)).toMatchObject({ reason: "near_limit" });
    expect(checkAvailability(provider("a"), HEALTHY, usage, NOW, { allowReserve: true })).toEqual({
      available: true,
      nearLimit: true,
    });
    expect(checkAvailability(provider("a"), HEALTHY, { ...ZERO, day: 100 }, NOW, { allowReserve: true })).toMatchObject(
      {
        reason: "limit_reached",
        until: nextReset("day", NOW),
      },
    );
  });

  it("treats a provider-reported remaining of zero as the limit reached", () => {
    expect(checkAvailability(provider("a"), { ...HEALTHY, reportedRemaining: 0 }, ZERO, NOW)).toMatchObject({
      reason: "limit_reached",
    });
  });
});

describe("health transitions", () => {
  const fail = (kind: ClassifiedFailure["kind"], retryAfterMs?: number): ClassifiedFailure => ({
    kind,
    retryAfterMs,
    message: kind,
  });

  it("cools down after a 429, honouring Retry-After, otherwise backing off 1, 2, 4 … minutes", () => {
    expect(healthAfterFailure(HEALTHY, fail("rate_limited", 30_000), NOW).cooldownUntil).toEqual(
      new Date(NOW.getTime() + 30_000),
    );
    const first = healthAfterFailure(HEALTHY, fail("rate_limited"), NOW);
    expect(first.cooldownUntil).toEqual(new Date(NOW.getTime() + 60_000));
    const second = healthAfterFailure(first, fail("rate_limited"), NOW);
    expect(second.cooldownUntil).toEqual(new Date(NOW.getTime() + 120_000));
  });

  it("marks a used-up quota until the next daily reset", () => {
    expect(healthAfterFailure(HEALTHY, fail("quota_exhausted"), NOW).exhaustedUntil).toEqual(nextReset("day", NOW));
  });

  it("pauses a provider for an hour after an auth failure", () => {
    expect(healthAfterFailure(HEALTHY, fail("auth"), NOW).circuitOpenUntil).toEqual(new Date(NOW.getTime() + 3600_000));
  });

  it("opens the circuit after three consecutive failures and resets on success", () => {
    let health = HEALTHY;
    for (let i = 0; i < 2; i++) health = healthAfterFailure(health, fail("transient"), NOW);
    expect(health.circuitOpenUntil).toBeNull();
    health = healthAfterFailure(health, fail("transient"), NOW);
    expect(health.circuitOpenUntil).toEqual(new Date(NOW.getTime() + 10 * 60_000));
    const healed = healthAfterSuccess(health, NOW);
    expect(healed).toMatchObject({ consecutiveFailures: 0, circuitOpenUntil: null, lastSuccessAt: NOW });
  });
});

describe("runWithFailover", () => {
  const classify = (error: unknown): ClassifiedFailure => {
    const kind = (error as { kind?: ClassifiedFailure["kind"] }).kind ?? "bug";
    return { kind, message: String(error) };
  };
  const failure = (kind: ClassifiedFailure["kind"]) => Object.assign(new Error(kind), { kind });

  it("uses the main provider when it works", async () => {
    const store = new MemoryProviderStore();
    const run = await runWithFailover({
      service: "ai",
      providers: [provider("main"), provider("backup")],
      store,
      now: () => NOW,
      classify,
      call: async (p) => p.name,
    });
    expect(run).toMatchObject({ result: "main", fallbackFrom: null });
    expect((await store.getUsage("ai", "main", NOW)).day).toBe(1);
  });

  it("retries a transient error once on the same provider", async () => {
    let calls = 0;
    const run = await runWithFailover({
      service: "ai",
      providers: [provider("main"), provider("backup")],
      store: new MemoryProviderStore(),
      now: () => NOW,
      classify,
      call: async (p) => {
        calls++;
        if (calls === 1) throw failure("transient");
        return p.name;
      },
    });
    expect(run.result).toBe("main");
    expect(calls).toBe(2);
  });

  it("falls back on a rate limit and records why", async () => {
    const store = new MemoryProviderStore();
    const run = await runWithFailover({
      service: "ai",
      providers: [provider("main"), provider("backup")],
      store,
      now: () => NOW,
      classify,
      call: async (p) => {
        if (p.name === "main") throw failure("rate_limited");
        return p.name;
      },
    });
    expect(run).toMatchObject({ result: "backup", fallbackFrom: "main", fallbackReason: "rate_limited" });
    expect((await store.getHealth("ai", "main")).cooldownUntil).not.toBeNull();
  });

  it("skips a provider near its limit without calling it", async () => {
    const store = new MemoryProviderStore();
    store.setUsage("ai", "main", NOW, { day: 95 });
    const called: string[] = [];
    const run = await runWithFailover({
      service: "ai",
      providers: [provider("main"), provider("backup")],
      store,
      now: () => NOW,
      classify,
      call: async (p) => {
        called.push(p.name);
        return p.name;
      },
    });
    expect(called).toEqual(["backup"]);
    expect(run).toMatchObject({ result: "backup", fallbackFrom: "main", fallbackReason: "near_limit" });
  });

  it("spends the reserve when every provider is near its limit", async () => {
    const store = new MemoryProviderStore();
    store.setUsage("ai", "main", NOW, { day: 95 });
    store.setUsage("ai", "backup", NOW, { day: 95 });
    const run = await runWithFailover({
      service: "ai",
      providers: [provider("main"), provider("backup")],
      store,
      now: () => NOW,
      classify,
      call: async (p) => p.name,
    });
    expect(run.result).toBe("main");
  });

  it("rethrows our own bugs instead of hiding them behind failover", async () => {
    await expect(
      runWithFailover({
        service: "ai",
        providers: [provider("main"), provider("backup")],
        store: new MemoryProviderStore(),
        now: () => NOW,
        classify,
        call: async () => {
          throw new TypeError("oops");
        },
      }),
    ).rejects.toThrow(TypeError);
  });

  it("reports when nothing is available, including whether any real provider is configured", async () => {
    const error = await runWithFailover({
      service: "ai",
      providers: [provider("main", { configured: false }), provider("mock", { isMock: true })],
      disabled: new Set(["mock"]),
      store: new MemoryProviderStore(),
      now: () => NOW,
      classify,
      call: async (p) => p.name,
    }).catch((e) => e);
    expect(error).toBeInstanceOf(AllProvidersUnavailableError);
    expect(error.noneConfigured).toBe(true);
    expect(error.attempts.map((a: { reason?: string }) => a.reason)).toEqual(["not_configured", "disabled"]);
  });
});

describe("chain ordering and status", () => {
  it("applies the saved order and keeps new providers at the end", () => {
    const providers = [provider("gemini"), provider("groq"), provider("openrouter")];
    expect(orderProviders(providers, ["groq", "gone"]).map((p) => p.name)).toEqual(["groq", "gemini", "openrouter"]);
  });

  it("summarises backup use, mock-only and all-unavailable states", () => {
    const later = new Date(NOW.getTime() + 3600_000);
    const main = providerStatus(provider("gemini"), { ...HEALTHY, exhaustedUntil: later }, ZERO, NOW, true);
    const backup = providerStatus(provider("groq"), HEALTHY, ZERO, NOW, true);
    const summary = summariseService("ai", "AI", [main, backup]);
    expect(summary).toMatchObject({ usingBackup: true, mockOnly: false, allUnavailable: false });
    expect(summary.active?.name).toBe("groq");
    expect(main).toMatchObject({ state: "quota_exhausted", until: later });

    const mockOnly = summariseService("ai", "AI", [
      providerStatus(provider("gemini", { configured: false }), HEALTHY, ZERO, NOW, true),
      providerStatus(provider("mock", { isMock: true, limits: {} }), HEALTHY, ZERO, NOW, true),
    ]);
    expect(mockOnly).toMatchObject({ mockOnly: true, usingBackup: false });

    const none = summariseService("ai", "AI", [main]);
    expect(none.allUnavailable).toBe(true);
  });
});

describe("classifyHttpFailure", () => {
  it("separates rate limits from used-up quotas", () => {
    expect(classifyHttpFailure(429, { retryAfter: "30" })).toMatchObject({
      kind: "rate_limited",
      retryAfterMs: 30_000,
    });
    expect(classifyHttpFailure(429, { body: "Quota exceeded for metric: requests per day" }).kind).toBe(
      "quota_exhausted",
    );
    expect(classifyHttpFailure(429, { retryAfter: "7200" }).kind).toBe("quota_exhausted");
  });

  it("classifies auth, server and client errors", () => {
    expect(classifyHttpFailure(401).kind).toBe("auth");
    expect(classifyHttpFailure(403).kind).toBe("auth");
    expect(classifyHttpFailure(503).kind).toBe("transient");
    expect(classifyHttpFailure(404).kind).toBe("rejected");
  });

  it("parses Retry-After as seconds or a date", () => {
    expect(parseRetryAfter("12")).toBe(12_000);
    const now = Date.parse("2026-10-09T10:00:00Z");
    expect(parseRetryAfter("Fri, 09 Oct 2026 10:01:00 GMT", now)).toBe(60_000);
    expect(parseRetryAfter(null)).toBeUndefined();
  });
});
