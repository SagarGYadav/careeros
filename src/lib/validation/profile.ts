// Profile form inputs, validated in the browser (react-hook-form) and again in Server Actions.
import { z } from "zod";

const lpa = z
  .number({ error: "Enter a number." })
  .min(0, "Can't be negative.")
  .max(1000, "That looks too high (in lakhs per year).")
  .nullable();

export const WORK_MODE_OPTIONS = [
  { value: "remote", label: "Remote" },
  { value: "hybrid", label: "Hybrid" },
  { value: "onsite", label: "On-site" },
] as const;

/** Preferences as the form edits them: CTC in lakhs per annum (LPA); stored as annual INR. */
export const preferencesSchema = z
  .object({
    currentCtcLpa: lpa,
    expectedMinLpa: lpa,
    expectedMaxLpa: lpa,
    noticePeriodDays: z.number().int("Whole days only.").min(0).max(365, "At most 365 days.").nullable(),
    preferredLocations: z.array(z.string().trim().min(1).max(80)).max(20, "At most 20 locations."),
    workModes: z.array(z.enum(["remote", "hybrid", "onsite"])),
    openToRelocate: z.boolean(),
    dealbreakers: z.object({
      bond: z.boolean(),
      nightShift: z.boolean(),
      contractToHire: z.boolean(),
      maxWfoDaysPerWeek: z.number().int().min(0).max(7, "At most 7 days.").nullable(),
    }),
  })
  .refine((p) => p.expectedMinLpa == null || p.expectedMaxLpa == null || p.expectedMaxLpa >= p.expectedMinLpa, {
    message: "The maximum must be at least the minimum.",
    path: ["expectedMaxLpa"],
  });

export type PreferencesInput = z.infer<typeof preferencesSchema>;

export const CAREER_FACT_CATEGORIES = [
  { value: "preference", label: "Preference" },
  { value: "strength", label: "Strength" },
  { value: "goal", label: "Goal" },
  { value: "constraint", label: "Constraint" },
  { value: "learning", label: "Learning" },
] as const;

export const careerFactSchema = z.object({
  text: z.string().trim().min(3, "Write at least a few words.").max(500, "Keep it under 500 characters."),
  category: z.enum(["preference", "strength", "goal", "constraint", "learning"]),
});

export type CareerFactFormInput = z.infer<typeof careerFactSchema>;

export const proficiencySchema = z.number().int().min(1).max(5);

export const addSkillSchema = z.object({
  name: z.string().trim().min(1, "Enter a skill.").max(60, "Keep it under 60 characters."),
  proficiency: proficiencySchema,
});

export const PROFICIENCY_LABELS: Record<number, string> = {
  1: "Beginner",
  2: "Working knowledge",
  3: "Proficient",
  4: "Advanced",
  5: "Expert",
};

/** Server Actions reject very large payloads before parsing them. */
export const MAX_ACTION_PAYLOAD_CHARS = 300_000;

/** Dealbreakers as stored on the career profile (JSON); anything missing or invalid counts as "not a dealbreaker". */
export const storedDealbreakersSchema = z
  .object({
    bond: z.boolean().catch(false),
    nightShift: z.boolean().catch(false),
    contractToHire: z.boolean().catch(false),
    maxWfoDaysPerWeek: z.number().nullable().catch(null),
  })
  .catch({ bond: false, nightShift: false, contractToHire: false, maxWfoDaysPerWeek: null });
