import { periodStart, PERIOD_KINDS } from "./periods";
import { HEALTHY, type HealthState, type ProviderStateStore, type ServiceName, type UsageCounts } from "./types";

/** In-memory ProviderStateStore for unit tests (the app uses the Prisma-backed store). */
export class MemoryProviderStore implements ProviderStateStore {
  private health = new Map<string, HealthState>();
  private counts = new Map<string, number>();

  async getHealth(service: ServiceName, provider: string): Promise<HealthState> {
    return this.health.get(`${service}:${provider}`) ?? { ...HEALTHY };
  }

  async saveHealth(service: ServiceName, provider: string, health: HealthState): Promise<void> {
    this.health.set(`${service}:${provider}`, { ...health });
  }

  async getUsage(service: ServiceName, provider: string, now: Date): Promise<UsageCounts> {
    const usage = { minute: 0, day: 0, month: 0 };
    for (const kind of PERIOD_KINDS) {
      usage[kind] = this.counts.get(this.key(service, provider, kind, now)) ?? 0;
    }
    return usage;
  }

  async recordRequest(service: ServiceName, provider: string, now: Date): Promise<void> {
    for (const kind of PERIOD_KINDS) {
      const key = this.key(service, provider, kind, now);
      this.counts.set(key, (this.counts.get(key) ?? 0) + 1);
    }
  }

  /** Test helper: pretend `count` requests were already made in each period. */
  setUsage(service: ServiceName, provider: string, now: Date, usage: Partial<UsageCounts>) {
    for (const kind of PERIOD_KINDS) {
      if (usage[kind] !== undefined) this.counts.set(this.key(service, provider, kind, now), usage[kind]!);
    }
  }

  private key(service: string, provider: string, kind: string, now: Date) {
    return `${service}:${provider}:${kind}:${periodStart(kind as never, now).toISOString()}`;
  }
}
