// Salary context (SPEC §12.2, CALC): what collected jobs of the same role family and city disclosed in the last
// 90 days. Shown only with at least five salaries, so one outlier can't pass for the market.

export const SALARY_CONTEXT_MIN_N = 5;
export const SALARY_CONTEXT_DAYS = 90;

export type SalaryContext = { n: number; min: number; median: number; max: number };

/** Each job counts once, at the middle of its disclosed range. */
export function salaryContext(
  ranges: { min: number | null; max: number | null }[],
  minN = SALARY_CONTEXT_MIN_N,
): SalaryContext | null {
  const points = ranges
    .map((r) => (r.min !== null && r.max !== null ? (r.min + r.max) / 2 : (r.min ?? r.max)))
    .filter((v): v is number => v !== null && v > 0)
    .sort((a, b) => a - b);
  if (points.length < minN) return null;
  const mid = Math.floor(points.length / 2);
  const median = points.length % 2 ? points[mid] : (points[mid - 1] + points[mid]) / 2;
  return { n: points.length, min: points[0], median: Math.round(median), max: points.at(-1)! };
}
