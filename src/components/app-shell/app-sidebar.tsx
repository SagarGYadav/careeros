"use client";

import { Suspense } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Logo } from "@/components/brand/logo";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar";
import { activeNavHref, visibleNavGroups } from "@/config/navigation";

/** Sidebar navigation. `userMenu` is rendered by the server (it reads the session) and passed in as a slot. */
export function AppSidebar({ userMenu }: { userMenu: React.ReactNode }) {
  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" render={<Link href="/overview" aria-label="CareerOS home" />}>
              <Logo />
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        {/* On pages with a dynamic segment the pathname is only known at request time, so the active highlight
            streams in; the links themselves are part of the static shell. */}
        <Suspense fallback={<NavGroups pathname={null} />}>
          <ActiveNavGroups />
        </Suspense>
      </SidebarContent>
      <SidebarFooter>{userMenu}</SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}

function ActiveNavGroups() {
  const pathname = usePathname();
  return <NavGroups pathname={pathname} />;
}

function NavGroups({ pathname }: { pathname: string | null }) {
  const groups = visibleNavGroups();
  const active = pathname
    ? activeNavHref(
        pathname,
        groups.flatMap((g) => g.items.map((i) => i.href)),
      )
    : null;
  return (
    <>
      {groups.map((group, index) => (
        <SidebarGroup key={group.label ?? index}>
          {group.label && <SidebarGroupLabel>{group.label}</SidebarGroupLabel>}
          <SidebarGroupContent>
            <SidebarMenu>
              {group.items.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton
                    isActive={item.href === active}
                    tooltip={item.title}
                    render={<Link href={item.href} />}
                  >
                    <item.icon />
                    <span>{item.title}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      ))}
    </>
  );
}
