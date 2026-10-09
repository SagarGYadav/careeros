"use client";

import { useSyncExternalStore } from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";

const OPTIONS = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
] as const;

// The stored theme is only known in the browser; render no selection on the server to avoid a mismatch.
function useMounted() {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
}

export function AppearanceSetting() {
  const { theme, setTheme } = useTheme();
  const mounted = useMounted();

  return (
    <div role="radiogroup" aria-label="Theme" className="flex flex-wrap gap-2">
      {OPTIONS.map(({ value, label, icon: Icon }) => {
        const selected = mounted && (theme ?? "system") === value;
        return (
          <Button
            key={value}
            role="radio"
            aria-checked={selected}
            variant={selected ? "default" : "outline"}
            onClick={() => setTheme(value)}
          >
            <Icon />
            {label}
          </Button>
        );
      })}
    </div>
  );
}
