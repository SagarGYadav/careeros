import type { Metadata } from "next";
import { Suspense } from "react";
import { DetailsForm } from "@/features/profile/profile-forms";
import { getCurrentUser } from "@/server/auth/session";
import { getProfileForEditing } from "@/server/services/profile-view";
import { SectionHeader, SectionSkeleton } from "../section-shell";

export const metadata: Metadata = { title: "Details · Career profile" };

export default function DetailsPage() {
  return (
    <>
      <SectionHeader
        title="Details"
        description="Contact details, headline, summary and the other sections of your CV."
        active="/profile/details"
      />
      <Suspense fallback={<SectionSkeleton />}>
        <Details />
      </Suspense>
    </>
  );
}

async function Details() {
  const user = await getCurrentUser();
  const { details } = await getProfileForEditing(user.id);
  return <DetailsForm defaultValues={details} />;
}
