import { Badge } from "@/components/ui/badge";
import type { ProviderStatus } from "@/lib/providers/chain";

const VARIANTS: Record<
  ProviderStatus["state"],
  { label: string; variant: "success" | "warning" | "destructive" | "outline" }
> = {
  ok: { label: "Available", variant: "success" },
  near_limit: { label: "Near limit", variant: "warning" },
  cooling_down: { label: "Cooling down", variant: "warning" },
  quota_exhausted: { label: "Used up", variant: "destructive" },
  limit_reached: { label: "Limit reached", variant: "destructive" },
  circuit_open: { label: "Paused", variant: "destructive" },
  not_configured: { label: "No key", variant: "outline" },
  disabled: { label: "Off", variant: "outline" },
};

export function ProviderStateBadge({ state }: { state: ProviderStatus["state"] }) {
  const { label, variant } = VARIANTS[state];
  return <Badge variant={variant}>{label}</Badge>;
}
