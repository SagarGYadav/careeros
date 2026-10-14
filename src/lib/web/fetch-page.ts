// Fetches one public web page for the server (SPEC §11.3, §23): SSRF guard on every hop, robots.txt respected,
// CareerOS user agent, 10 s timeout, 2 MB cap, at most 3 redirects. Network functions are injectable for tests.
import { lookup as dnsLookup } from "node:dns/promises";
import { AppError } from "@/lib/errors";
import { robotsAllows, USER_AGENT } from "./robots";
import { checkUrl, isIpLiteral, isPublicIp } from "./ssrf";

const TIMEOUT_MS = 10_000;
const ROBOTS_TIMEOUT_MS = 5_000;
const MAX_BYTES = 2 * 1024 * 1024;
const MAX_REDIRECTS = 3;

export type FetchDeps = {
  fetch?: typeof fetch;
  /** Every address a host name resolves to. */
  lookup?: (host: string) => Promise<string[]>;
};

const defaultLookup = async (host: string) => (await dnsLookup(host, { all: true })).map((a) => a.address);

async function assertPublicHost(host: string, lookup: (host: string) => Promise<string[]>) {
  const bare = host.replace(/^\[|\]$/g, "");
  let addresses: string[];
  try {
    addresses = isIpLiteral(bare) ? [bare] : await lookup(bare);
  } catch {
    throw new AppError("URL_FETCH_FAILED", { message: "That site's address couldn't be found." });
  }
  if (!addresses.length || addresses.some((a) => !isPublicIp(a))) {
    throw new AppError("URL_FETCH_BLOCKED", { message: "That address points to a private network." });
  }
}

/** Reads the body up to the cap; a larger page is cut there (the job data is near the top). */
async function readCapped(response: Response): Promise<string> {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (size < MAX_BYTES) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    size += value.byteLength;
  }
  await reader.cancel().catch(() => {});
  return new TextDecoder().decode(Buffer.concat(chunks).subarray(0, MAX_BYTES));
}

const robotsCache = new Map<string, { text: string; at: number }>();

async function checkRobots(url: URL, fetchImpl: typeof fetch) {
  const cached = robotsCache.get(url.origin);
  let text = cached && Date.now() - cached.at < 3_600_000 ? cached.text : null;
  if (text === null) {
    try {
      const response = await fetchImpl(`${url.origin}/robots.txt`, {
        headers: { "user-agent": USER_AGENT },
        redirect: "follow",
        signal: AbortSignal.timeout(ROBOTS_TIMEOUT_MS),
      });
      // No robots.txt (4xx) means everything is allowed; a server error means "not now" (RFC 9309).
      if (response.status >= 500) throw new AppError("URL_FETCH_FAILED", { message: "The site isn't answering." });
      text = response.ok ? (await readCapped(response)).slice(0, 500_000) : "";
    } catch (error) {
      if (error instanceof AppError) throw error;
      text = "";
    }
    robotsCache.set(url.origin, { text, at: Date.now() });
  }
  if (!robotsAllows(text, `${url.pathname}${url.search}`)) throw new AppError("FETCH_BLOCKED_BY_ROBOTS");
}

export type FetchedPage = { url: string; html: string };

export async function fetchPublicPage(raw: string, deps: FetchDeps = {}): Promise<FetchedPage> {
  const fetchImpl = deps.fetch ?? fetch;
  const lookup = deps.lookup ?? defaultLookup;
  let current = raw;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const check = checkUrl(current);
    if (!check.ok) throw new AppError("URL_FETCH_BLOCKED", { message: check.reason });
    const url = check.url;
    await assertPublicHost(url.hostname, lookup);
    await checkRobots(url, fetchImpl);
    let response: Response;
    try {
      response = await fetchImpl(url, {
        headers: { "user-agent": USER_AGENT, accept: "text/html,application/xhtml+xml" },
        redirect: "manual",
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch {
      throw new AppError("URL_FETCH_FAILED", { message: "The page didn't load in time." });
    }
    const location = response.headers.get("location");
    if (response.status >= 300 && response.status < 400 && location) {
      current = new URL(location, url).toString();
      continue;
    }
    if (!response.ok) throw new AppError("URL_FETCH_FAILED", { message: `The site answered ${response.status}.` });
    const type = response.headers.get("content-type") ?? "";
    if (type && !/html|xml/.test(type))
      throw new AppError("URL_FETCH_FAILED", { message: "That link isn't a web page." });
    return { url: url.toString(), html: await readCapped(response) };
  }
  throw new AppError("URL_FETCH_FAILED", { message: "Too many redirects." });
}
