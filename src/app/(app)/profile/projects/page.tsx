import type { Metadata } from "next";
import { Suspense } from "react";
import { ProjectsForm } from "@/features/profile/profile-forms";
import { getCurrentUser } from "@/server/auth/session";
import { getProfileForEditing } from "@/server/services/profile-view";
import { NeedsCv, SectionHeader, SectionSkeleton } from "../section-shell";

export const metadata: Metadata = { title: "Projects · Career profile" };

export default function ProjectsPage() {
  return (
    <>
      <SectionHeader
        title="Projects"
        description="Projects and their highlights, also cited as evidence in Fit Reports."
        active="/profile/projects"
      />
      <Suspense fallback={<SectionSkeleton />}>
        <ProjectsSection />
      </Suspense>
    </>
  );
}

async function ProjectsSection() {
  const user = await getCurrentUser();
  const profile = await getProfileForEditing(user.id);
  if (!profile.hasConfirmedCv) return <NeedsCv />;
  return <ProjectsForm defaultValues={{ projects: profile.projects }} />;
}
