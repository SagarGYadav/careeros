import { Suspense } from "react";
import { AppHeader } from "@/components/app-shell/app-header";
import { AppSidebar } from "@/components/app-shell/app-sidebar";
import { CommandMenu } from "@/components/app-shell/command-menu";
import { UserMenu, UserMenuSkeleton } from "@/components/app-shell/user-menu";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";

// The shell prerenders as a static shell; only the user menu (and page content that reads data) streams in
// behind <Suspense>, so navigation feels instant (node_modules/next/dist/docs: authentication-with-cache-components).
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <SidebarProvider>
      <AppSidebar
        userMenu={
          <Suspense fallback={<UserMenuSkeleton />}>
            <UserMenu />
          </Suspense>
        }
      />
      <SidebarInset>
        <AppHeader />
        <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 p-4 md:p-6">{children}</div>
      </SidebarInset>
      <CommandMenu />
    </SidebarProvider>
  );
}
