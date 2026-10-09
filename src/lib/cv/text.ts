// Text helpers shared by the CV parser and the verifier: line handling, list splitting and fuzzy matching.

/** Non-empty, trimmed lines. Tabs (table cell boundaries from the PDF reader) are kept inside lines. */
export function splitLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) =>
      line
        .replace(/[  ]+/g, " ")
        .replace(/ ?\t ?/g, "\t")
        .trim(),
    )
    .filter(Boolean);
}

/** For matching only: lower-case, unify dashes and quotes, drop bullet glyphs, collapse whitespace. */
export function normalizeForMatch(text: string): string {
  return text
    .normalize("NFKC")
    .replace(/­/g, "")
    .replace(/(?<=[A-Za-z0-9])-\n(?=[a-z0-9])/g, "-")
    .toLowerCase()
    .replace(/[‐‑‒–—―−]/g, "-")
    .replace(/[‘’‛′`]/g, "'")
    .replace(/[“”″]/g, '"')
    .replace(/[•●▪■◦‣∙·|\t]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const BULLET_GLYPHS = /^[\s•●▪■◦‣∙*➢►▶✓✔–—-]+\s*/;

export function stripBullet(line: string): string {
  return line.replace(BULLET_GLYPHS, "").trim();
}

const TRAILING_JOINERS =
  /(?:[,–—&(/:]|\s-|\b(?:and|or|of|to|in|on|with|for|the|a|an|by|from|at|as|across|into|using|via|including))$/i;
const LABELLED_LIST = /^(technologies|tech stack|tech|tools|stack|environment|skills used|built with)\s*:/i;
const STARTS_WITH_URL_OR_EMAIL = /^(?:https?:\/\/|www\.)?[a-z0-9.-]+\.[a-z]{2,}(?:\/|\b)|^[^\s@]+@/i;

function openParens(text: string): number {
  return (text.match(/\(/g)?.length ?? 0) - (text.match(/\)/g)?.length ?? 0);
}

/** How a wrapped line joins the one before it: without a space (split URL or word), with a space, or not at all. */
export function continuation(prev: string, line: string): "nospace" | "space" | null {
  if (prev.includes("\t") || line.includes("\t")) return null;
  if (/[A-Za-z0-9]-$/.test(prev) && /^[a-z0-9]/.test(line)) return "nospace";
  if (/\/$/.test(prev) && /^[a-z0-9]/.test(line) && !line.includes(" ")) return "nospace";
  if (openParens(prev) > 0) return "space";
  if (TRAILING_JOINERS.test(prev)) return "space";
  if (/^[a-z]/.test(line) && !STARTS_WITH_URL_OR_EMAIL.test(line)) return "space";
  // "Technologies: …, GitHub" + "Actions": a short tail of a labelled list.
  if (
    LABELLED_LIST.test(prev) &&
    !/[.!?]$/.test(prev) &&
    !STARTS_WITH_URL_OR_EMAIL.test(line) &&
    line.split(" ").length <= 3 &&
    !/[—–|·:]/.test(line) &&
    !/\d{4}/.test(line)
  ) {
    return "space";
  }
  return null;
}

/** Joins lines the PDF wrapped: "…in Next.js" + "and Node.js." becomes one line. */
export function mergeContinuationLines(lines: string[]): string[] {
  const out: string[] = [];
  for (const line of lines) {
    const prev = out.at(-1);
    const join = prev === undefined ? null : continuation(prev, line);
    if (prev !== undefined && join) out[out.length - 1] = join === "nospace" ? prev + line : `${prev} ${line}`;
    else out.push(line);
  }
  return out;
}

/** Splits a list on commas, middle dots, pipes, semicolons and bullets; keeps "C, C++" items intact. */
export function splitList(text: string): string[] {
  return text
    .split(/\s*[,;|•·]\s*|\t/)
    .map((item) =>
      item
        .replace(/^(and|&)\s+/i, "")
        .replace(/[.\s]+$/, "")
        .trim(),
    )
    .filter(Boolean);
}

/** Splits a header or meta line into its fields: on " · ", " | ", tabs, " — " and runs of spaces. */
export function splitFields(line: string): string[] {
  return line
    .split(/\s+[·|•]\s+|\t|\s{2,}/)
    .map((part) => part.trim())
    .filter(Boolean);
}

const OUTCOME_VERBS =
  /^(reduced|improved|increased|cut|raised|grew|saved|boosted|won|achieved|doubled|tripled|halved|accelerated|optimi[sz]ed|decreased|lowered|delivered|launched|shipped|scaled|generated|drove|exceeded)\b/i;
const NUMBER_TOKEN = /^[(₹$€£]?\d[\d,.]*(%|x|×|k|m|s|ms|\+)?[,.;:)]?$/i;

/**
 * True when a bullet states a measurable result: "by 38%", "40 clients", "from 3.9s to 1.6s". Version numbers
 * after a product name ("Angular 12", "WCAG 2.1") and years are not metrics.
 */
export function hasMetric(text: string): boolean {
  if (/[%×]|[₹$€£]\s?\d/.test(text)) return true;
  const words = text.split(/\s+/);
  return words.some((word, i) => {
    if (!NUMBER_TOKEN.test(word)) return false;
    const digits = word.replace(/\D/g, "");
    if (/^(19|20)\d{2}$/.test(digits) && !/[%+kmsx]/i.test(word)) return false;
    // A capitalised word before the number is a product name, unless it's the bullet's first word ("Mentored 2").
    const prev = i >= 2 ? words[i - 1] : "";
    const looksLikeVersion =
      /^[A-Z]/.test(prev) && (word.includes(".") || digits.length <= 2) && !/[%+kmsx]/i.test(word);
    return !looksLikeVersion;
  });
}

export function bulletKind(text: string): "achievement" | "responsibility" {
  return hasMetric(text) || OUTCOME_VERBS.test(text) ? "achievement" : "responsibility";
}

export function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/** Levenshtein distance with two rows. */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++) {
      row[j] = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = row;
  }
  return prev[b.length];
}

export function similarity(a: string, b: string): number {
  const longest = Math.max(a.length, b.length);
  return longest === 0 ? 1 : 1 - levenshtein(a, b) / longest;
}

/**
 * How well `needle` appears somewhere in `haystack` (both already normalised): 1 for an exact substring,
 * otherwise the best similarity of a window of about the same number of words.
 */
export function bestMatchScore(haystack: string, needle: string): number {
  if (!needle) return 1;
  if (haystack.includes(needle)) return 1;
  const words = haystack.split(" ");
  const needleWords = needle.split(" ");
  const needleSet = new Set(needleWords);
  const n = needleWords.length;
  let best = 0;
  for (let size = Math.max(1, n - 1); size <= n + 1; size++) {
    for (let start = 0; start + size <= words.length; start++) {
      const window = words.slice(start, start + size);
      // Cheap filter before the edit distance: at least half the words must already match.
      const shared = window.filter((w) => needleSet.has(w)).length;
      if (shared * 2 < Math.min(n, size)) continue;
      best = Math.max(best, similarity(window.join(" "), needle));
      if (best === 1) return 1;
    }
  }
  return best;
}
