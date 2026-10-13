import type { Metadata } from "next";
import { Suspense } from "react";
import { EducationForm } from "@/features/profile/profile-forms";
import { getCurrentUser } from "@/server/auth/session";
import { getProfileForEditing } from "@/server/services/profile-view";
import { NeedsCv, SectionHeader, SectionSkeleton } from "../section-shell";

export const metadata: Metadata = { title: "Education · Career profile" };

export default function EducationPage() {
  return (
    <>
      <SectionHeader title="Education" description="Degrees and certifications." active="/profile/education" />
      <Suspense fallback={<SectionSkeleton />}>
        <EducationSection />
      </Suspense>
    </>
  );
}

async function EducationSection() {
  const user = await getCurrentUser();
  const profile = await getProfileForEditing(user.id);
  if (!profile.hasConfirmedCv) return <NeedsCv />;
  return <EducationForm defaultValues={{ education: profile.education, certifications: profile.certifications }} />;
}
