// The Overview's onboarding checklist (SPEC §2, §21): each step is done when the data says so, never by a click.

export type OnboardingFacts = {
  hasCv: boolean;
  hasPreferences: boolean;
  hasSelectedRole: boolean;
  hasSearched: boolean;
  hasOpenedFeed: boolean;
};

export type ChecklistItem = {
  id: keyof OnboardingFacts;
  title: string;
  description: string;
  href: string;
  actionLabel: string;
  done: boolean;
};

const STEPS: Omit<ChecklistItem, "done">[] = [
  {
    id: "hasCv",
    title: "Upload and confirm your CV",
    description: "Your profile, skills and every match are built from it.",
    href: "/profile/upload",
    actionLabel: "Upload CV",
  },
  {
    id: "hasPreferences",
    title: "Set your preferences",
    description: "Locations, work modes and expected salary decide which jobs fit.",
    href: "/profile/preferences",
    actionLabel: "Set preferences",
  },
  {
    id: "hasSelectedRole",
    title: "Choose target roles",
    description: "CareerOS suggests roles from your CV; you pick which ones to search for.",
    href: "/jobs/roles",
    actionLabel: "Choose roles",
  },
  {
    id: "hasSearched",
    title: "Run your first job search",
    description: "Searches job sites for your roles and ranks every job found.",
    href: "/jobs/roles",
    actionLabel: "Find jobs",
  },
  {
    id: "hasOpenedFeed",
    title: "Review your matches",
    description: "Save the jobs you like and dismiss the rest; your reasons tune the ranking.",
    href: "/jobs",
    actionLabel: "Open For you",
  },
];

export function onboardingChecklist(facts: OnboardingFacts): ChecklistItem[] {
  return STEPS.map((step) => ({ ...step, done: facts[step.id] }));
}
