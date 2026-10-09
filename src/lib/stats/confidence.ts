// Sample-size labels shown next to every rate (SPEC §6). Pure and unit-tested.
// The full statistics engine (Wilson intervals, segment comparison) is built in Phase 9.

export type ConfidenceLevel = "insufficient" | "early" | "moderate" | "strong";

/** Default thresholds by denominator n: <5 insufficient · 5–14 early · 15–39 moderate · ≥40 strong. */
export const CONFIDENCE_THRESHOLDS = { early: 5, moderate: 15, strong: 40 } as const;

export function confidenceLevel(n: number, thresholds = CONFIDENCE_THRESHOLDS): ConfidenceLevel {
  if (n >= thresholds.strong) return "strong";
  if (n >= thresholds.moderate) return "moderate";
  if (n >= thresholds.early) return "early";
  return "insufficient";
}

export const CONFIDENCE_COPY: Record<ConfidenceLevel, { label: string; description: string }> = {
  insufficient: {
    label: "Insufficient data",
    description: "Too few cases to say anything yet. Shown as raw counts only.",
  },
  early: { label: "Early signal", description: "A first hint. It can easily change as more data comes in." },
  moderate: { label: "Moderate confidence", description: "Enough cases to be useful, but not conclusive." },
  strong: { label: "Strong signal", description: "Based on enough cases to be reasonably reliable." },
};
