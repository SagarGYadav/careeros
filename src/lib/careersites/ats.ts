// ATS host detection (SPEC §11.1–11.2): turns a URL found by web search (or given by the user) into a career site:
// an ATS board with its token (Greenhouse, Lever, Ashby, SmartRecruiters, Recruitee), a careers page to read, or
// nothing. Pure, so every host pattern is unit-tested.
import { checkUrl } from "@/lib/web/ssrf";

export const ATS_KINDS = ["greenhouse", "lever", "ashby", "smartrecruiters", "recruitee"] as const;
export type AtsKind = (typeof ATS_KINDS)[number];
export type SiteKind = AtsKind | "jsonld" | "html" | "unknown";

export const SITE_KIND_LABELS: Record<SiteKind, string> = {
  greenhouse: "Greenhouse",
  lever: "Lever",
  ashby: "Ashby",
  smartrecruiters: "SmartRecruiters",
  recruitee: "Recruitee",
  jsonld: "Careers page (job data)",
  html: "Careers page",
  unknown: "Not found yet",
};

export type SiteRef = {
  kind: AtsKind | "html";
  /** Board token for an ATS ("kestrelpay"); null for a careers page. */
  token: string | null;
  /** The board or careers page to show and to read. */
  url: string;
  /** Registry identity, e.g. "greenhouse:kestrelpay". */
  key: string;
};

const TOKEN = /^[a-z0-9][a-z0-9_.-]{0,80}$/i;
// Path segments that aren't board names.
const NOT_TOKENS = new Set(["embed", "v1", "v0", "api", "jobs", "job", "o", "careers", "boards", "postings"]);

const BOARD_URL: Record<AtsKind, (token: string) => string> = {
  greenhouse: (t) => `https://boards.greenhouse.io/${t}`,
  lever: (t) => `https://jobs.lever.co/${t}`,
  ashby: (t) => `https://jobs.ashbyhq.com/${t}`,
  smartrecruiters: (t) => `https://jobs.smartrecruiters.com/${t}`,
  recruitee: (t) => `https://${t}.recruitee.com`,
};

function ats(kind: AtsKind, token: string | undefined | null): SiteRef | null {
  if (!token || !TOKEN.test(token) || NOT_TOKENS.has(token.toLowerCase())) return null;
  // Board tokens are case-insensitive on every supported ATS except SmartRecruiters, whose company ids keep case.
  const value = kind === "smartrecruiters" ? token : token.toLowerCase();
  return { kind, token: value, url: BOARD_URL[kind](value), key: `${kind}:${value.toLowerCase()}` };
}

/** Hosts of careers pages on Indian HR suites, read through the generic careers-page path (SPEC §11.1). */
const CAREERS_HOSTS = /(^|\.)(keka\.com|zohorecruit\.(com|in)|darwinbox\.(com|in)|freshteam\.com)$/i;
const CAREERS_PATH = /(career|jobs?|join-?us|work-?with-?us|opportunit|openings|vacanc)/i;

export function detectSite(rawUrl: string): SiteRef | null {
  const check = checkUrl(rawUrl);
  if (!check.ok) return null;
  const url = check.url;
  const host = url.hostname.toLowerCase();
  const segments = url.pathname.split("/").filter(Boolean);

  if (/^(job-)?boards(\.eu)?\.greenhouse\.io$/.test(host)) {
    return ats("greenhouse", segments[0] === "embed" ? url.searchParams.get("for") : segments[0]);
  }
  if (host === "boards-api.greenhouse.io" && segments[0] === "v1" && segments[1] === "boards") {
    return ats("greenhouse", segments[2]);
  }
  if (/^jobs(\.eu)?\.lever\.co$/.test(host)) return ats("lever", segments[0]);
  if (host === "api.lever.co" && segments[0] === "v0" && segments[1] === "postings") return ats("lever", segments[2]);
  if (host === "jobs.ashbyhq.com") return ats("ashby", segments[0]);
  if (host === "api.ashbyhq.com" && segments[0] === "posting-api" && segments[1] === "job-board") {
    return ats("ashby", segments[2]);
  }
  if (/^(jobs|careers)\.smartrecruiters\.com$/.test(host)) return ats("smartrecruiters", segments[0]);
  if (host === "api.smartrecruiters.com" && segments[0] === "v1" && segments[1] === "companies") {
    return ats("smartrecruiters", segments[2]);
  }
  const recruitee = host.match(/^([a-z0-9-]+)\.recruitee\.com$/);
  if (recruitee && !["www", "app", "api", "careers"].includes(recruitee[1])) return ats("recruitee", recruitee[1]);

  // Not an ATS board: keep it only if it looks like a careers page, cut at the careers part of the path.
  const careersAt = segments.findIndex((s) => CAREERS_PATH.test(s));
  if (!CAREERS_HOSTS.test(host) && careersAt < 0 && !CAREERS_PATH.test(host.split(".")[0])) return null;
  const path = careersAt >= 0 ? `/${segments.slice(0, careersAt + 1).join("/")}` : "";
  const page = `https://${host}${path}`;
  return { kind: "html", token: null, url: page, key: `html:${host}${path.toLowerCase()}` };
}

/** "kestrel-pay" → "Kestrel Pay": a readable name for a board found without a company name. */
export function nameFromToken(token: string): string {
  return token
    .replace(/[-_.]+/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

/** The company in a search hit's title: "Jobs at Kestrel Pay", "Kestrel Pay - Careers", "Careers | Kestrel Pay". */
export function nameFromTitle(title: string): string | null {
  const t = title.replace(/\s+/g, " ").trim();
  const at = t.match(/(?:jobs|careers|openings|positions)\s+at\s+([^|–—\-:]+)/i);
  if (at) return at[1].trim();
  const side =
    t.match(/^([^|–—\-:]+?)\s*[|–—\-:]\s*(?:careers|jobs|job board)\b/i) ??
    t.match(/(?:careers|jobs)\s*[|–—\-:]\s*([^|–—\-:]+)$/i);
  return side ? side[1].trim() : null;
}
