import { FileUp } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { ProfileNav, type ProfileSection } from "@/features/profile/profile-nav";
import { LinkButton } from "@/components/link-button";

/** Header and sub-navigation shared by the profile section pages. */
export function SectionHeader({
  title,
  description,
  active,
}: {
  title: string;
  description: string;
  active: ProfileSection;
}) {
  return (
    <>
      <PageHeader title={title} description={description} />
      <ProfileNav active={active} />
    </>
  );
}

export function SectionSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading">
      <Skeleton className="h-56 w-full rounded-xl" />
      <Skeleton className="h-56 w-full rounded-xl" />
    </div>
  );
}

/** Experience, projects and education come from a confirmed CV, so those pages start there. */
export function NeedsCv() {
  return (
    <EmptyState
      icon={FileUp}
      title="Start with your CV"
      description="Upload and confirm your CV to fill this section. You can edit everything afterwards."
      action={<LinkButton href="/profile/upload">Upload CV</LinkButton>}
    />
  );
}
