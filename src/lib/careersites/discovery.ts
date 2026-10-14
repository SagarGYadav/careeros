// Discovery queries (SPEC §11.2): a small set of web searches built from target-role titles and locations, aimed at
// the ATS hosts where company boards live, plus a few for companies already seen and for watchlist names. Every
// query contains only role titles, places and company names, never personal details.
import type { WebSearchQuery } from "@/lib/websearch/providers";

/** ATS and HR-suite hosts searched with a domain filter (all three providers support one). */
export const DISCOVERY_DOMAINS = [
  "boards.greenhouse.io",
  "job-boards.greenhouse.io",
  "jobs.lever.co",
  "jobs.ashbyhq.com",
  "jobs.smartrecruiters.com",
  "recruitee.com",
  "keka.com",
] as const;

/** Job boards whose pages CareerOS never reads; kept out of open searches. */
export const EXCLUDED_IN_OPEN_SEARCH = ["linkedin", "naukri", "indeed", "glassdoor", "foundit", "monster"];

export type DiscoveryInput = {
  /** The first title of each selected target role, most important first. */
  titles: string[];
  /** Preferred cities; "Remote" when the user works remotely; empty means India-wide. */
  locations: string[];
  /** Watchlist companies added by name, not found yet. */
  watchlistNames: string[];
  /** Companies seen in job-site results that have no career site in the registry yet. */
  seenCompanies: string[];
  max: number;
};

export type DiscoveryQuery = WebSearchQuery & { purpose: "ats" | "open" | "watchlist" | "company"; company?: string };

/**
 * Watchlist names first (the user asked for them), then one search per ATS host for the main title and place,
 * then open "careers" searches and companies already seen, then the remaining title × place × host combinations.
 */
export function buildDiscoveryQueries(input: DiscoveryInput): DiscoveryQuery[] {
  const places = input.locations.length ? input.locations : ["India"];
  const where = (place: string) => (/^remote$/i.test(place) ? "remote India" : place);
  const queries: DiscoveryQuery[] = [];
  const seen = new Set<string>();
  const add = (q: DiscoveryQuery) => {
    const key = `${q.query.toLowerCase()}|${(q.includeDomains ?? []).join(",")}`;
    if (!seen.has(key)) {
      seen.add(key);
      queries.push(q);
    }
  };

  for (const name of input.watchlistNames) {
    add({ query: `${name} careers jobs`, maxResults: 5, purpose: "watchlist", company: name });
  }
  const [mainTitle] = input.titles;
  if (mainTitle) {
    for (const domain of DISCOVERY_DOMAINS) {
      add({ query: `${mainTitle} ${where(places[0])}`, includeDomains: [domain], maxResults: 10, purpose: "ats" });
    }
    for (const place of places) {
      add({
        query: `"${mainTitle}" careers ${where(place)} ${EXCLUDED_IN_OPEN_SEARCH.map((s) => `-${s}`).join(" ")}`,
        maxResults: 10,
        purpose: "open",
      });
    }
  }
  for (const company of input.seenCompanies) {
    add({ query: `${company} careers`, maxResults: 5, purpose: "company", company });
  }
  for (const title of input.titles) {
    for (const place of places) {
      for (const domain of DISCOVERY_DOMAINS) {
        add({ query: `${title} ${where(place)}`, includeDomains: [domain], maxResults: 10, purpose: "ats" });
      }
    }
  }
  return queries.slice(0, Math.max(0, input.max));
}
