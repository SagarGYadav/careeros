// Deterministic extractors (SPEC §9.1 step 2). Emails, phone numbers and links found here override or confirm
// what the AI returns, because a regex cannot invent a contact detail.

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g;

/** Unique e-mail addresses, lower-cased, in order of appearance. */
export function findEmails(text: string): string[] {
  return unique([...text.matchAll(EMAIL_RE)].map((m) => m[0].toLowerCase()));
}

// "+91 98765 43210", "+91-9876543210", "098765 43210", "(020) 2612 3456", "+1 415 555 0100".
const PHONE_RE = /(?:\+\d{1,3}[\s.-]?)?(?:\(\d{2,5}\)[\s.-]?)?\d{2,5}(?:[\s.-]?\d{2,5}){1,4}/g;

/** Phone numbers as written, keeping only candidates with 10–13 digits (dates and ids are shorter or longer). */
export function findPhones(text: string): string[] {
  return unique(
    [...text.matchAll(PHONE_RE)]
      .map((m) => m[0].trim())
      .filter((candidate) => {
        const digits = phoneDigits(candidate).length;
        return digits >= 10 && digits <= 13 && !/^(19|20)\d{2}\D+(19|20)\d{2}$/.test(candidate);
      }),
  );
}

export const phoneDigits = (phone: string) => phone.replace(/\D/g, "");

/** Two numbers are the same when their last 10 digits match (the country code is often written differently). */
export function samePhone(a: string, b: string): boolean {
  return phoneDigits(a).slice(-10) === phoneDigits(b).slice(-10);
}

const TLDS =
  "com|org|net|io|dev|in|co|me|app|ai|tech|xyz|site|page|info|edu|gov|uk|us|ca|de|sg|au|eu|biz|online|blog|codes|design|tv|link|website|space|pro";
// A host is at least two labels; the first must be two characters or more so "B.Tech" is not a link.
const URL_RE = new RegExp(
  `(?<![@\\w.-])(?:https?:\\/\\/)?(?:www\\.)?[a-z0-9][a-z0-9-]+(?:\\.[a-z0-9-]+)*\\.(?:${TLDS})\\b(?:\\/[^\\s,;|·)\\]>"]*)?`,
  "gi",
);
// Technology names that look like domains.
const NOT_LINKS = new Set(["socket.io", "asp.net", "ado.net", "vb.net", "node.js"]);

/** Joins URLs the PDF wrapped across lines ("…/rohan-mehta-" + "example"). Only used for link detection. */
export function joinWrappedUrls(text: string): string {
  return text.replace(/(?<=[A-Za-z0-9])-\n(?=[a-z0-9])/g, "-").replace(/(?<=[a-z0-9.-]\/)\n(?=[a-z0-9])/g, "");
}

/** URLs written in the text (not e-mail domains), normalised. */
export function findUrls(text: string): string[] {
  const withoutEmails = joinWrappedUrls(text).replace(EMAIL_RE, " ");
  return unique(
    [...withoutEmails.matchAll(URL_RE)]
      .map((m) => m[0].replace(/[.,:;!?]+$/, ""))
      .filter((raw) => !NOT_LINKS.has(raw.toLowerCase()))
      .map(normalizeUrl),
  );
}

/** Adds https://, lower-cases the host, drops a bare trailing slash; LinkedIn profiles get their canonical host. */
export function normalizeUrl(raw: string): string {
  const trimmed = raw.trim().replace(/[.,:;!?]+$/, "");
  if (/^(mailto|tel):/i.test(trimmed)) return trimmed;
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const url = new URL(withScheme);
    let host = url.hostname.toLowerCase();
    if (host === "linkedin.com" || host.endsWith(".linkedin.com")) host = "www.linkedin.com";
    const path = url.pathname.replace(/\/+$/, "");
    return `https://${host}${path}${url.search}`;
  } catch {
    return withScheme;
  }
}

/** For comparing two links: no scheme, no "www.", no trailing slash, lower case. */
export function canonicalUrl(url: string): string {
  return url
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/+$/, "");
}

export type LinkType = "linkedin" | "github" | "portfolio" | "repository" | "email" | "phone" | "other";

// Sites that host profiles or certificates, never a personal portfolio.
const NOT_PORTFOLIO_HOSTS = [
  "linkedin.com", "github.com", "gitlab.com", "bitbucket.org", "credly.com", "coursera.org", "udemy.com",
  "leetcode.com", "hackerrank.com", "kaggle.com", "medium.com", "dev.to", "twitter.com", "x.com",
  "stackoverflow.com", "youtube.com", "google.com", "drive.google.com", "play.google.com", "apps.apple.com",
  "npmjs.com", "freecodecamp.org", "codechef.com", "geeksforgeeks.org", "naukri.com", "indeed.com",
]; // prettier-ignore

export function classifyUrl(url: string): LinkType {
  if (/^mailto:/i.test(url)) return "email";
  if (/^tel:/i.test(url)) return "phone";
  let host: string;
  let segments: string[];
  try {
    const parsed = new URL(url);
    host = parsed.hostname.toLowerCase().replace(/^www\./, "");
    segments = parsed.pathname.split("/").filter(Boolean);
  } catch {
    return "other";
  }
  if (host.endsWith("linkedin.com")) return segments[0] === "in" || segments[0] === "pub" ? "linkedin" : "other";
  if (host === "github.com") {
    if (segments.length === 1) return "github";
    return segments.length >= 2 ? "repository" : "other";
  }
  if (NOT_PORTFOLIO_HOSTS.some((h) => host === h || host.endsWith(`.${h}`))) return "other";
  return "portfolio";
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}
