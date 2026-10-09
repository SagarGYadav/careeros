import "server-only";
import { randomUUID } from "node:crypto";
import { Prisma } from "@/generated/prisma/client";
import { periodStart, PERIOD_KINDS } from "@/lib/providers/periods";
import {
  HEALTHY,
  type HealthState,
  type ProviderStateStore,
  type ServiceName,
  type UsageCounts,
} from "@/lib/providers/types";
import { db } from "@/server/db";

// Deliberate exception to "every repository takes userId" (CLAUDE.md rule 5): provider quotas, health and chain
// order belong to the app's API keys, which every user shares. Nothing user-specific is stored here.

function toHealth(row: HealthState): HealthState {
  const { cooldownUntil, exhaustedUntil, circuitOpenUntil, consecutiveFailures, reportedRemaining } = row;
  const { lastErrorKind, lastSuccessAt, lastFailureAt } = row;
  return {
    cooldownUntil,
    exhaustedUntil,
    circuitOpenUntil,
    consecutiveFailures,
    reportedRemaining,
    lastErrorKind,
    lastSuccessAt,
    lastFailureAt,
  };
}

export const prismaProviderStore: ProviderStateStore = {
  async getHealth(service, provider) {
    const row = await db.providerHealth.findUnique({ where: { service_provider: { service, provider } } });
    return row ? toHealth(row) : { ...HEALTHY };
  },

  async saveHealth(service, provider, health) {
    await db.providerHealth.upsert({
      where: { service_provider: { service, provider } },
      create: { service, provider, ...health },
      update: health,
    });
  },

  async getUsage(service, provider, now) {
    const rows = await db.providerUsage.findMany({
      where: {
        service,
        provider,
        OR: PERIOD_KINDS.map((kind) => ({ periodKind: kind, periodStart: periodStart(kind, now) })),
      },
    });
    const usage: UsageCounts = { minute: 0, day: 0, month: 0 };
    for (const row of rows) usage[row.periodKind as keyof UsageCounts] = row.count;
    return usage;
  },

  async recordRequest(service, provider, now) {
    // One statement for all three periods: atomic and a single round trip. (Three upserts in a transaction timed
    // out waiting for a transaction slot against the remote Neon database.)
    const rows = PERIOD_KINDS.map(
      (kind) => Prisma.sql`(${randomUUID()}, ${service}, ${provider}, ${kind}, ${periodStart(kind, now)}, 1, now())`,
    );
    await db.$executeRaw`
      INSERT INTO provider_usage (id, service, provider, "periodKind", "periodStart", count, "updatedAt")
      VALUES ${Prisma.join(rows)}
      ON CONFLICT (service, provider, "periodKind", "periodStart")
      DO UPDATE SET count = provider_usage.count + 1, "updatedAt" = now()`;
  },
};

export type ProviderSettingValue = { order: string[]; disabled: string[] };

export async function getProviderSetting(service: ServiceName): Promise<ProviderSettingValue> {
  const row = await db.providerSetting.findUnique({ where: { service } });
  return { order: row?.order ?? [], disabled: row?.disabled ?? [] };
}

export async function saveProviderSetting(service: ServiceName, value: ProviderSettingValue): Promise<void> {
  await db.providerSetting.upsert({ where: { service }, create: { service, ...value }, update: value });
}
