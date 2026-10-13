import type { Metadata } from "next";
import { Suspense } from "react";
import { ExperienceForm } from "@/features/profile/profile-forms";
import { getCurrentUser } from "@/server/auth/session";
import { getProfileForEditing } from "@/server/services/profile-view";
import { NeedsCv, SectionHeader, SectionSkeleton } from "../section-shell";

export const metadata: Metadata = { title: "Experience · Career profile" };

export default function ExperiencePage() {
  return (
    <>
      <SectionHeader
        title="Experience"
        description="Your roles, with the bullets that Fit Reports cite as evidence."
        active="/profile/experience"
      />
      <Suspense fallback={<SectionSkeleton />}>
        <ExperienceSection />
      </Suspense>
    </>
  );
}

async function ExperienceSection() {
  const user = await getCurrentUser();
  const profile = await getProfileForEditing(user.id);
  if (!profile.hasConfirmedCv) return <NeedsCv />;
  return <ExperienceForm defaultValues={{ experience: profile.experience }} />;
}
