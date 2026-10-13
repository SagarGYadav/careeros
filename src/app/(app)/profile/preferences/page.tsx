import type { Metadata } from "next";
import { Suspense } from "react";
import { PreferencesForm } from "@/features/profile/preferences-form";
import type { PreferencesInput } from "@/lib/validation/profile";
import { getCurrentUser } from "@/server/auth/session";
import { getCareerProfile } from "@/server/repositories/profile";
import { SectionHeader, SectionSkeleton } from "../section-shell";

export const metadata: Metadata = { title: "Preferences · Career profile" };

export default function PreferencesPage() {
  return (
    <>
      <SectionHeader
        title="Preferences"
        description="Locations, work modes, pay and the conditions you won't accept."
        active="/profile/preferences"
      />
      <Suspense fallback={<SectionSkeleton />}>
        <Preferences />
      </Suspense>
    </>
  );
}

const toLpa = (annualInr: number | null | undefined) => (annualInr == null ? null : Math.round(annualInr / 1000) / 100);
const WORK_MODES = ["remote", "hybrid", "onsite"] as const;

async function Preferences() {
  const user = await getCurrentUser();
  const profile = await getCareerProfile(user.id);
  const dealbreakers = (profile?.dealbreakers ?? {}) as Partial<PreferencesInput["dealbreakers"]>;
  const defaults: PreferencesInput = {
    currentCtcLpa: toLpa(profile?.currentCtc),
    expectedMinLpa: toLpa(profile?.expectedCtcMin),
    expectedMaxLpa: toLpa(profile?.expectedCtcMax),
    noticePeriodDays: profile?.noticePeriodDays ?? null,
    preferredLocations: profile?.preferredLocations ?? [],
    workModes: (profile?.workModes ?? []).filter((m): m is (typeof WORK_MODES)[number] =>
      (WORK_MODES as readonly string[]).includes(m),
    ),
    openToRelocate: profile?.openToRelocate ?? false,
    dealbreakers: {
      bond: dealbreakers.bond ?? false,
      nightShift: dealbreakers.nightShift ?? false,
      contractToHire: dealbreakers.contractToHire ?? false,
      maxWfoDaysPerWeek: dealbreakers.maxWfoDaysPerWeek ?? null,
    },
  };
  return <PreferencesForm defaultValues={defaults} />;
}
