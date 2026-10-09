import { Suspense } from "react";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { AiStatusBadge } from "@/features/services/ai-status";
import { CommandMenuButton } from "./command-menu";
import { ThemeToggle } from "./theme-toggle";

export function AppHeader() {
  return (
    <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center gap-2 border-b bg-background/95 px-4 backdrop-blur">
      <SidebarTrigger className="-ml-1" />
      <div className="mr-1 h-4 w-px bg-border" aria-hidden="true" />
      <div className="ml-auto flex items-center gap-2">
        {/* Reads live provider state, so it streams in without delaying the header. */}
        <Suspense fallback={null}>
          <AiStatusBadge />
        </Suspense>
        <CommandMenuButton />
        <ThemeToggle />
      </div>
    </header>
  );
}
