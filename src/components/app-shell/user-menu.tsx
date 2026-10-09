import { getCurrentUser } from "@/server/auth/session";
import { SidebarMenu, SidebarMenuItem, SidebarMenuSkeleton } from "@/components/ui/sidebar";
import { UserMenuClient } from "./user-menu-client";

/** Server part: reads the session. Render inside <Suspense fallback={<UserMenuSkeleton />}>. */
export async function UserMenu() {
  const user = await getCurrentUser();
  return <UserMenuClient user={{ name: user.name, email: user.email }} />;
}

export function UserMenuSkeleton() {
  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <SidebarMenuSkeleton showIcon />
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
