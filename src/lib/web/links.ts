// Reading links out of a page (SPEC §11.3): careers pages list jobs as links, and embed ATS boards in iframes or
// scripts. Regex is enough here: only href/src values and visible link text are needed.
import { htmlToText } from "./jsonld";

export type PageLink = { url: string; text: string };

/** Absolute http(s) links with their visible text; fragments and javascript: links are skipped. */
export function extractLinks(html: string, baseUrl: string): PageLink[] {
  const links: PageLink[] = [];
  const seen = new Set<string>();
  for (const [, href, inner] of html.matchAll(/<a\b[^>]*?\bhref\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    let url: URL;
    try {
      url = new URL(href.replace(/&amp;/g, "&"), baseUrl);
    } catch {
      continue;
    }
    if (url.protocol !== "https:" && url.protocol !== "http:") continue;
    url.hash = "";
    const key = url.toString();
    if (seen.has(key)) continue;
    seen.add(key);
    links.push({ url: key, text: htmlToText(inner).replace(/\s+/g, " ").trim().slice(0, 200) });
  }
  return links;
}

/** Every URL in src/href/data attributes and script text, for spotting an embedded ATS board. */
export function extractEmbedUrls(html: string, baseUrl: string): string[] {
  const urls = new Set<string>();
  const attributes = html.matchAll(/\b(?:src|href|data-[\w-]+)\s*=\s*["']([^"']+)["']/gi);
  const inScripts = html.matchAll(/https?:\/\/[^\s"'<>()]+/gi);
  for (const match of [...attributes].map((m) => m[1]).concat([...inScripts].map((m) => m[0]))) {
    try {
      urls.add(new URL(match.replace(/&amp;/g, "&"), baseUrl).toString());
    } catch {
      // Not a URL.
    }
  }
  return [...urls];
}

/**
 * Politeness (SPEC §11.4): at least `gapMs` between requests to the same host. Waits are injectable so tests
 * don't sleep.
 */
export function createHostThrottle(
  gapMs = 1_000,
  deps: { now?: () => number; sleep?: (ms: number) => Promise<void> } = {},
) {
  const now = deps.now ?? (() => Date.now());
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const next = new Map<string, number>();
  return async function wait(url: string) {
    const host = new URL(url).hostname;
    const at = Math.max(now(), next.get(host) ?? 0);
    next.set(host, at + gapMs);
    const delay = at - now();
    if (delay > 0) await sleep(delay);
  };
}

export type HostThrottle = ReturnType<typeof createHostThrottle>;
