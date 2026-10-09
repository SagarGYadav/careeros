import "server-only";
import type { ServiceName } from "@/lib/providers/types";
import { loadAiProviders } from "@/server/ai/runner";
import { getProviderSetting, saveProviderSetting } from "@/server/repositories/provider-state";

// Settings → Services: reorder and switch providers on or off. Only services that are built are listed here.

async function currentOrder(service: ServiceName): Promise<string[]> {
  if (service !== "ai") throw new Error(`Unknown service: ${service}`);
  const { providers } = await loadAiProviders();
  return providers.map((p) => p.name);
}

export async function moveProvider(service: ServiceName, name: string, direction: "up" | "down"): Promise<void> {
  const order = await currentOrder(service);
  const index = order.indexOf(name);
  const target = direction === "up" ? index - 1 : index + 1;
  if (index < 0 || target < 0 || target >= order.length) return;
  [order[index], order[target]] = [order[target], order[index]];
  const { disabled } = await getProviderSetting(service);
  await saveProviderSetting(service, { order, disabled });
}

export async function setProviderEnabled(service: ServiceName, name: string, enabled: boolean): Promise<void> {
  const order = await currentOrder(service);
  if (!order.includes(name)) return;
  const setting = await getProviderSetting(service);
  const disabled = new Set(setting.disabled);
  if (enabled) disabled.delete(name);
  else disabled.add(name);
  await saveProviderSetting(service, { order: setting.order.length ? setting.order : order, disabled: [...disabled] });
}
