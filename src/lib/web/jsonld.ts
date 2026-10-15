// schema.org JobPosting from a page's JSON-LD (SPEC §11.3, §12.1). Many company and job-board pages publish it
// for Google Jobs; it gives the full description, the employer and often the salary without guessing at HTML.

export type JsonLdJob = {
  title: string;
  company: string;
  location: string;
  description: string;
  /** Salary in a form parseSalary reads, e.g. "₹12,00,000 - ₹18,00,000 a year". */
  salaryText: string | null;
  employmentType: string | null;
  remote: boolean;
  postedAt: Date | null;
  /** The posting's own page, when the data names one. */
  url: string | null;
};

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', "#39": "'", apos: "'", nbsp: " " };

/** Decodes HTML entities ("&lt;p&gt;" → "<p>"), for APIs that send entity-encoded HTML (Greenhouse). */
export function decodeEntities(text: string): string {
  return text.replace(/&(#?\w+);/g, (m, name: string) =>
    name.toLowerCase() in ENTITIES
      ? ENTITIES[name.toLowerCase()]
      : name.startsWith("#")
        ? String.fromCharCode(name[1] === "x" || name[1] === "X" ? parseInt(name.slice(2), 16) : Number(name.slice(1)))
        : m,
  );
}

/** HTML → readable text with line breaks kept for paragraphs and list items. */
export function htmlToText(html: string): string {
  return (
    html
      .replace(/<(script|style)[\s\S]*?<\/\1>/gi, "")
      .replace(/<li[^>]*>/gi, "\n- ")
      .replace(/<\/(p|div|li|ul|ol|h[1-6]|tr)>|<br\s*\/?>/gi, "\n")
      .replace(/<[^>]+>/g, "")
      .replace(
        /&(#?\w+);/g,
        (m, name: string) => ENTITIES[name] ?? (name.startsWith("#") ? String.fromCharCode(Number(name.slice(1))) : m),
      )
      .replace(/[ \t]+/g, " ")
      // One line per paragraph or list item: a closing tag and the next <li> would otherwise leave blank lines.
      .replace(/\n\s*\n+/g, "\n")
      .trim()
  );
}

type Node = Record<string, unknown>;
const asArray = (v: unknown): unknown[] => (Array.isArray(v) ? v : v === undefined || v === null ? [] : [v]);
const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);

function isJobPosting(node: Node): boolean {
  return asArray(node["@type"]).some((t) => typeof t === "string" && t.toLowerCase() === "jobposting");
}

function* walk(value: unknown): Generator<Node> {
  for (const item of asArray(value)) {
    if (!item || typeof item !== "object") continue;
    const node = item as Node;
    yield node;
    if (node["@graph"]) yield* walk(node["@graph"]);
  }
}

function locationOf(node: Node): string {
  const places = asArray(node.jobLocation).map((place) => {
    const address = (place as Node)?.address as Node | string | undefined;
    if (typeof address === "string") return address;
    return [address?.addressLocality, address?.addressRegion, address?.addressCountry]
      .map((part) => (typeof part === "object" && part ? (part as Node).name : part))
      .filter((part): part is string => typeof part === "string" && Boolean(part.trim()))
      .join(", ");
  });
  return places.filter(Boolean).join("; ");
}

const SYMBOLS: Record<string, string> = { INR: "₹", USD: "$", EUR: "€", GBP: "£" };
const UNITS: Record<string, string> = { YEAR: "a year", MONTH: "a month" };

function salaryOf(node: Node): string | null {
  const base = node.baseSalary as Node | undefined;
  if (!base || typeof base !== "object") return null;
  const value = (typeof base.value === "object" ? base.value : base) as Node;
  const unit = UNITS[String(value.unitText ?? base.unitText ?? "YEAR").toUpperCase()];
  if (!unit) return null; // hourly pay isn't comparable with annual expectations
  const symbol = SYMBOLS[String(base.currency ?? "INR").toUpperCase()] ?? "";
  const fmt = (n: unknown) =>
    typeof n === "number" || typeof n === "string" ? `${symbol}${Number(n).toLocaleString("en-IN")}` : null;
  const min = fmt(value.minValue);
  const max = fmt(value.maxValue);
  const single = fmt(value.value);
  if (min && max) return `${min} - ${max} ${unit}`;
  const one = min ?? max ?? single;
  return one ? `${one} ${unit}` : null;
}

/** The first JobPosting in the page's JSON-LD blocks, or null. Invalid JSON blocks are skipped. */
/** Every JobPosting in the page's JSON-LD blocks (a careers page may list several). Invalid blocks are skipped. */
export function extractJobPostings(html: string): JsonLdJob[] {
  const postings: JsonLdJob[] = [];
  const blocks = html.matchAll(/<script[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi);
  for (const [, body] of blocks) {
    let data: unknown;
    try {
      data = JSON.parse(body.trim());
    } catch {
      continue;
    }
    for (const node of walk(data)) {
      if (!isJobPosting(node)) continue;
      const title = str(node.title);
      const description = typeof node.description === "string" ? htmlToText(node.description) : "";
      if (!title || !description) continue;
      const org = node.hiringOrganization as Node | string | undefined;
      const posted = str(node.datePosted);
      const postedAt = posted ? new Date(posted) : null;
      postings.push({
        title: htmlToText(title),
        company: (typeof org === "string" ? org : str(org?.name)) ?? "",
        location: locationOf(node),
        description,
        salaryText: salaryOf(node),
        employmentType:
          asArray(node.employmentType)
            .filter((t) => typeof t === "string")
            .join(", ")
            .toLowerCase() || null,
        remote: asArray(node.jobLocationType).some((t) => String(t).toUpperCase() === "TELECOMMUTE"),
        postedAt: postedAt && !Number.isNaN(postedAt.getTime()) ? postedAt : null,
        url: str(node.url),
      });
    }
  }
  return postings;
}

/** The first JobPosting on the page, or null. */
export function extractJobPosting(html: string): JsonLdJob | null {
  return extractJobPostings(html)[0] ?? null;
}
