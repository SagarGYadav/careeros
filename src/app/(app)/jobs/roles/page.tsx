import type { Metadata } from "next";
import { Suspense } from "react";
import { FileUp, Target } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { LinkButton } from "@/components/link-button";
import { PageHeader } from "@/components/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { RolesBoard, SuggestRolesButton } from "@/features/roles/roles-board";
import { getCurrentUser } from "@/server/auth/session";
import { listTargetRolesView } from "@/server/services/target-roles";

export const metadata: Metadata = { title: "Target roles" };

export default function TargetRolesPage() {
  return (
    <>
      <PageHeader
        title="Target roles"
        description="The roles CareerOS searches for. Category and seniority are calculated from your skills and experience."
      />
      <Suspense fallback={<RolesSkeleton />}>
        <Roles />
      </Suspense>
    </>
  );
}

function RolesSkeleton() {
  return (
    <div className="grid gap-3 lg:grid-cols-2" role="status" aria-busy="true" aria-label="Loading target roles">
      {Array.from({ length: 4 }, (_, i) => (
        <Skeleton key={i} className="h-56 rounded-xl" />
      ))}
    </div>
  );
}

async function Roles() {
  const user = await getCurrentUser();
  const { roles, hasCv } = await listTargetRolesView(user.id);

  if (!hasCv) {
    return (
      <EmptyState
        icon={FileUp}
        title="Start with your CV"
        description="Roles are suggested from the experience and skills in your confirmed CV."
        action={<LinkButton href="/profile/upload">Upload CV</LinkButton>}
      />
    );
  }
  if (!roles.length) {
    return (
      <EmptyState
        icon={Target}
        title="No target roles yet"
        description="CareerOS suggests 5–10 roles from your CV, each with the evidence behind it. You choose which ones to search for."
        action={<SuggestRolesButton />}
      />
    );
  }
  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <SuggestRolesButton label="Suggest again" variant="outline" />
      </div>
      <RolesBoard roles={roles} />
    </div>
  );
}
