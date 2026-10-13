// What a posting asks for, read by regex (SPEC §10.4): experience range, seniority, and conditions the user may
// treat as dealbreakers (notice period, bond, shifts, contract-to-hire, office days).

export type ExperienceRange = { min: number | null; max: number | null };

/** "2-4 years", "3+ yrs", "minimum 5 years", "0-1 year", "12+ years" → years. The first match wins. */
export function parseExperience(text: string): ExperienceRange {
  const t = text.toLowerCase();
  const range = t.match(/(\d{1,2}(?:\.\d)?)\s*(?:-|–|to)\s*(\d{1,2}(?:\.\d)?)\s*\+?\s*(?:years?|yrs?)/);
  if (range) return { min: Number(range[1]), max: Number(range[2]) };
  const plus = t.match(/(\d{1,2}(?:\.\d)?)\s*\+\s*(?:years?|yrs?)/);
  if (plus) return { min: Number(plus[1]), max: null };
  const atLeast = t.match(/(?:minimum|min\.?|at\s+least)\s*(?:of\s*)?(\d{1,2})\s*(?:years?|yrs?)/);
  if (atLeast) return { min: Number(atLeast[1]), max: null };
  const exact = t.match(/experience\s*[:\-]?\s*(\d{1,2})\s*(?:years?|yrs?)\b/);
  if (exact) return { min: Number(exact[1]), max: Number(exact[1]) };
  return { min: null, max: null };
}

/** Seniority from the title, falling back to the experience range. */
export function seniorityFromPosting(title: string, experience: ExperienceRange): string | null {
  const t = title.toLowerCase();
  if (/\bintern(ship)?\b|\btrainee\b/.test(t)) return "intern";
  if (/\b(principal|staff|head|director|vp|architect)\b/.test(t)) return "lead";
  if (/\b(lead|manager)\b/.test(t)) return "lead";
  if (/\b(senior|sr\.?)\b|\bsde\s*(3|iii)\b/.test(t)) return "senior";
  if (/\b(junior|jr\.?|fresher|graduate|entry)\b|\bsde\s*(1|i)\b/.test(t)) return "junior";
  const min = experience.min;
  if (min === null) return null;
  if (min >= 8) return "lead";
  if (min >= 5) return "senior";
  if (min >= 2) return "mid";
  return "junior";
}

export type Conditions = {
  noticePeriodMaxDays: number | null;
  immediateJoiner: boolean;
  bond: boolean;
  /** "night" when the posting mentions night, rotational or US/UK shifts. */
  shift: "night" | null;
  contractToHire: boolean;
  wfoDaysPerWeek: number | null;
};

export function parseConditions(text: string): Conditions {
  const t = text.toLowerCase();
  const immediateJoiner = /\bimmediate\s+(joiners?|joining|start)\b|\bjoin\s+immediately\b/.test(t);
  const notice = t.match(
    /notice\s+period\s*(?:of\s*|up\s*to\s*|:|-|less\s+than\s*|max(?:imum)?\s*)*(\d{1,3})\s*(days?|weeks?|months?)/,
  );
  const noticeDays = notice
    ? Number(notice[1]) * (notice[2].startsWith("week") ? 7 : notice[2].startsWith("month") ? 30 : 1)
    : immediateJoiner
      ? 15
      : null;
  const wfo = t.match(
    /(\d)\s*days?\s*(?:a|per)?\s*(?:week\s*)?(?:work(?:ing)?\s+from|in\s+the|at\s+the|in)\s+(?:the\s+)?office/,
  );
  return {
    noticePeriodMaxDays: noticeDays,
    immediateJoiner,
    bond: /\b(service\s+)?bond\b|\bservice\s+agreement\b/.test(t),
    shift: /\bnight\s+shifts?\b|\brotational\s+shifts?\b|\b(us|uk)\s+shifts?\b|\bgraveyard\b/.test(t) ? "night" : null,
    contractToHire: /\bcontract[\s-]+to[\s-]+hire\b|\bc2h\b/.test(t),
    wfoDaysPerWeek: wfo ? Number(wfo[1]) : /\bwork\s+from\s+office\b|\bwfo\b/.test(t) ? 5 : null,
  };
}
