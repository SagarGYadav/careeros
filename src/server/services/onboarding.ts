import "server-only";
import { onboardingChecklist } from "@/lib/onboarding";
import { getCareerProfile } from "@/server/repositories/profile";
import { getDefaultResume } from "@/server/repositories/resumes";
import { getLatestFinishedRun } from "@/server/repositories/search-runs";
import { listTargetRoles } from "@/server/repositories/target-roles";

export async function getOnboardingChecklist(userId: string) {
  const [resume, career, roles, run] = await Promise.all([
    getDefaultResume(userId),
    getCareerProfile(userId),
    listTargetRoles(userId),
    getLatestFinishedRun(userId),
  ]);
  return onboardingChecklist({
    hasCv: Boolean(resume),
    hasPreferences: Boolean(career && (career.preferredLocations.length > 0 || career.expectedCtcMin !== null)),
    hasSelectedRole: roles.some((role) => role.selected),
    hasSearched: Boolean(run),
    hasOpenedFeed: Boolean(career?.feedSeenAt),
  });
}
