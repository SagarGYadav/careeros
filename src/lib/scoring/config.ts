// Fit-score settings (SPEC §12.2). The defaults are the spec's; the user may change component maxima and the
// recommendation thresholds in Settings → Scoring. Each saved change becomes a new version.
import { z } from "zod";

export const COMPONENT_KEYS = ["skills", "experience", "roleAlignment", "location", "salary"] as const;
export type ComponentKey = (typeof COMPONENT_KEYS)[number];

export const COMPONENT_LABELS: Record<ComponentKey, string> = {
  skills: "Skills",
  experience: "Experience",
  roleAlignment: "Role alignment",
  location: "Location and work mode",
  salary: "Salary",
};

export const DEFAULT_WEIGHTS: Record<ComponentKey, number> = {
  skills: 45,
  experience: 20,
  roleAlignment: 15,
  location: 10,
  salary: 10,
};

export const DEFAULT_THRESHOLDS = { apply: 72, consider: 55 };

export type ScoringConfigValues = {
  /** 0 = the built-in defaults. */
  version: number;
  weights: Record<ComponentKey, number>;
  thresholds: { apply: number; consider: number };
};

export const DEFAULT_SCORING_CONFIG: ScoringConfigValues = {
  version: 0,
  weights: DEFAULT_WEIGHTS,
  thresholds: DEFAULT_THRESHOLDS,
};

const weight = z.number().int("Use whole numbers.").min(0).max(100);

/** What Settings → Scoring may save. Maxima sum to 100 so the Fit score stays a 0–100 score. */
export const scoringSettingsSchema = z
  .object({
    weights: z.object({
      skills: weight,
      experience: weight,
      roleAlignment: weight,
      location: weight,
      salary: weight,
    }),
    thresholds: z.object({
      apply: z.number().int().min(1).max(100),
      consider: z.number().int().min(0).max(99),
    }),
  })
  .refine((v) => COMPONENT_KEYS.reduce((sum, k) => sum + v.weights[k], 0) === 100, {
    message: "The parts must add up to 100.",
    path: ["weights"],
  })
  .refine((v) => v.thresholds.consider < v.thresholds.apply, {
    message: "“Consider” must be lower than “Apply”.",
    path: ["thresholds", "consider"],
  });

export type ScoringSettings = z.infer<typeof scoringSettingsSchema>;

/** A stored config row, validated; anything invalid falls back to the defaults. */
export function readScoringConfig(row: { version: number; weights: unknown; thresholds: unknown } | null) {
  if (!row) return DEFAULT_SCORING_CONFIG;
  const parsed = scoringSettingsSchema.safeParse({ weights: row.weights, thresholds: row.thresholds });
  return parsed.success ? { version: row.version, ...parsed.data } : DEFAULT_SCORING_CONFIG;
}
