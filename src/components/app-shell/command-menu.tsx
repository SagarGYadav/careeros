"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { Monitor, Moon, Search, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { visibleNavGroups } from "@/config/navigation";

// The header button and the keyboard shortcut both open the palette; a window event connects them without
// shared state.
const OPEN_EVENT = "careeros:open-command-menu";

/** ⌘K / Ctrl+K command palette. Lists only commands that work (SPEC §2): navigation and theme. */
export function CommandMenu() {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const { setTheme } = useTheme();

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() === "k" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        setOpen((value) => !value);
      }
    };
    const onOpen = () => setOpen(true);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener(OPEN_EVENT, onOpen);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener(OPEN_EVENT, onOpen);
    };
  }, []);

  const run = (action: () => void) => {
    setOpen(false);
    action();
  };

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <Command>
        <CommandInput placeholder="Type a command or search…" />
        <CommandList>
          <CommandEmpty>No results.</CommandEmpty>
          <CommandGroup heading="Go to">
            {visibleNavGroups()
              .flatMap((group) => group.items)
              .map((item) => (
                <CommandItem
                  key={item.href}
                  value={`${item.title} ${item.keywords?.join(" ") ?? ""}`}
                  onSelect={() => run(() => router.push(item.href))}
                >
                  <item.icon />
                  {item.title}
                </CommandItem>
              ))}
          </CommandGroup>
          <CommandSeparator />
          <CommandGroup heading="Theme">
            <CommandItem onSelect={() => run(() => setTheme("light"))}>
              <Sun />
              Light theme
            </CommandItem>
            <CommandItem onSelect={() => run(() => setTheme("dark"))}>
              <Moon />
              Dark theme
            </CommandItem>
            <CommandItem onSelect={() => run(() => setTheme("system"))}>
              <Monitor />
              System theme
            </CommandItem>
          </CommandGroup>
        </CommandList>
      </Command>
    </CommandDialog>
  );
}

// navigator.platform is only known in the browser; this keeps server and client markup identical on first paint.
function useIsMac() {
  return useSyncExternalStore(
    () => () => {},
    () => /mac|iphone|ipad/i.test(navigator.platform),
    () => false,
  );
}

export function CommandMenuButton() {
  const isMac = useIsMac();
  return (
    <Button
      variant="outline"
      size="sm"
      className="w-44 justify-between font-normal text-muted-foreground"
      onClick={() => window.dispatchEvent(new Event(OPEN_EVENT))}
    >
      <span className="flex items-center gap-2">
        <Search className="size-4" />
        Search…
      </span>
      <kbd className="rounded bg-muted px-1.5 font-mono text-[11px]">{isMac ? "⌘K" : "Ctrl K"}</kbd>
    </Button>
  );
}
