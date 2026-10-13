// Evidence binding (SPEC §8.4, CLAUDE.md rule 2). An AI sentence about the user must cite CV evidence ids that
// exist, and every number in it must appear in the cited evidence or in a computed fact. Claims that fail are kept
// but labelled "Unverified"; the UI never shows them as facts.

export type EvidenceText = { id: string; text: string };

export type ClaimCheck = {
  /** Cited ids that exist in the catalog (from the text and the separate id list). */
  evidenceIds: string[];
  unknownIds: string[];
  /** Numbers in the claim that neither the cited evidence nor the facts contain. */
  unsupportedNumbers: string[];
  verified: boolean;
};

const ID_PATTERN = /\bE\d+\b/g;
// Numbers as written: "5", "3.5", "1,200", "38%". Version-like tokens next to letters ("D3", "B2B") are skipped.
const NUMBER_PATTERN = /(?<![\w.])\d[\d,]*(?:\.\d+)?(?![\w])/g;

const numeric = (token: string) => Number(token.replace(/,/g, ""));

/**
 * Checks one claim. `facts` are computed values the claim may use (e.g. years of experience); a number matches a
 * fact when equal or when it is the fact rounded down ("5+ years" for 5.4).
 */
export function checkClaim(
  text: string,
  citedIds: string[],
  catalog: Map<string, EvidenceText>,
  facts: number[] = [],
): ClaimCheck {
  const ids = [...new Set([...citedIds, ...(text.match(ID_PATTERN) ?? [])])];
  const evidenceIds = ids.filter((id) => catalog.has(id));
  const unknownIds = ids.filter((id) => !catalog.has(id));

  const evidenceNumbers = new Set(
    evidenceIds.flatMap((id) => (catalog.get(id)!.text.match(NUMBER_PATTERN) ?? []).map(numeric)),
  );
  const withoutIds = text.replace(ID_PATTERN, " ");
  const unsupportedNumbers = (withoutIds.match(NUMBER_PATTERN) ?? []).filter((token) => {
    const n = numeric(token);
    if (evidenceNumbers.has(n)) return false;
    return !facts.some((f) => n === f || n === Math.floor(f) || n === Math.round(f));
  });

  return {
    evidenceIds,
    unknownIds,
    unsupportedNumbers,
    verified: unknownIds.length === 0 && unsupportedNumbers.length === 0 && evidenceIds.length > 0,
  };
}
