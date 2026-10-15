// Careers-page reader (SPEC §11.3, steps 2–4), for career sites that aren't a known ATS board:
//   1. an ATS board embedded in the page (iframe, script or link) → the caller reads it through the ATS API;
//   2. schema.org JobPosting JSON-LD on the page;
//   3. JobPosting JSON-LD on the page's linked job pages (only those whose titles match a target role);
//   4. otherwise the AI CareerPageExtractor lists job titles and links from the page text, code keeps only titles
//      that appear on the page and links that are the page's own, and the matching job pages are read.
// Every fetch goes through the caller's fetchPage (SSRF guard, robots.txt, throttle) and spends the page budget.
import { normalizeForMatch } from "@/lib/cv/text";
import { indianCity } from "@/lib/jobs/normalize";
import { extractJobPosting, extractJobPostings, htmlToText, type JsonLdJob } from "@/lib/web/jsonld";
import { extractEmbedUrls, extractLinks, type PageLink } from "@/lib/web/links";
import { detectSite, type SiteRef } from "./ats";
import type { WantFn } from "./adapters";
import type { SitePosting } from "./postings";

export type ListedJob = { title: string; url: string };

export type PageReadContext = {
  fetchPage: (url: string) => Promise<{ url: string; html: string }>;
  /** CareerPageExtractor (AI, fast tier): job titles and links named on a careers page. */
  listJobs: (input: { url: string; pageText: string; links: PageLink[] }) => Promise<ListedJob[]>;
  want: WantFn;
  wantTitle: (title: string) => boolean;
  budget: { pages: number };
  company: string;
};

export type PageRead = {
  method: "embedded_ats" | "jsonld" | "jsonld_pages" | "ai_links" | "none";
  /** An ATS board found inside the page; read it through its API instead. */
  embedded: SiteRef | null;
  postings: SitePosting[];
  /** Jobs the page lists (all of them, before the filters). */
  total: number;
  /** Every job title the page lists (before the filters). */
  titles: string[];
};

const PAGE_TEXT_LIMIT = 12_000;
const MAX_LINKS_FOR_AI = 150;
const JOB_PATH = /\/(jobs?|careers?|openings?|positions?|vacanc(y|ies)|roles?|o)\/[^/]+/i;

function fromJsonLd(job: JsonLdJob, pageUrl: string, company: string, index = 0): SitePosting {
  const url = job.url ?? (index ? `${pageUrl}#job-${index}` : pageUrl);
  return {
    externalId: url,
    title: job.title,
    company: job.company || company,
    location: [job.location, job.remote ? "Remote" : ""].filter(Boolean).join(", "),
    description: job.description,
    url,
    applyUrl: url,
    postedAt: job.postedAt,
    employmentType: job.employmentType,
    workModeHint: job.remote ? "remote" : null,
    salaryText: job.salaryText,
  };
}

const sameSite = (a: string, b: string) => {
  const host = (u: string) => new URL(u).hostname.replace(/^www\./, "");
  const [x, y] = [host(a), host(b)];
  return x === y || x.endsWith(`.${y}`) || y.endsWith(`.${x}`);
};

/** A job page without JSON-LD: its text is the description, and the place is the first city or "Remote" it names. */
function fromPlainPage(title: string, page: { url: string; html: string }, company: string): SitePosting {
  const description = htmlToText(page.html).slice(0, PAGE_TEXT_LIMIT);
  const city = description.split(/\n/).map(indianCity).find(Boolean) ?? null;
  const remote = /\bremote\b/i.test(description);
  return {
    externalId: page.url,
    title,
    company,
    location: [city, remote ? "Remote" : ""].filter(Boolean).join(", "),
    description,
    url: page.url,
    applyUrl: page.url,
    postedAt: null,
    employmentType: null,
    workModeHint: remote ? "remote" : null,
    salaryText: null,
  };
}

async function readJobPages(jobs: ListedJob[], ctx: PageReadContext, allowPlain: boolean): Promise<SitePosting[]> {
  const postings: SitePosting[] = [];
  for (const job of jobs) {
    if (ctx.budget.pages <= 0) break;
    ctx.budget.pages--;
    let page;
    try {
      page = await ctx.fetchPage(job.url);
    } catch {
      continue; // One unreadable job page doesn't stop the others.
    }
    const data = extractJobPosting(page.html);
    if (data) postings.push(fromJsonLd({ ...data, url: data.url ?? page.url }, page.url, ctx.company));
    else if (allowPlain) postings.push(fromPlainPage(job.title, page, ctx.company));
  }
  return postings.filter(ctx.want);
}

export async function readCareersPage(url: string, ctx: PageReadContext): Promise<PageRead> {
  ctx.budget.pages--;
  const page = await ctx.fetchPage(url);

  for (const candidate of extractEmbedUrls(page.html, page.url)) {
    const site = detectSite(candidate);
    if (site && site.kind !== "html")
      return { method: "embedded_ats", embedded: site, postings: [], total: 0, titles: [] };
  }

  const onPage = extractJobPostings(page.html);
  if (onPage.length) {
    return {
      method: "jsonld",
      embedded: null,
      postings: onPage.map((job, i) => fromJsonLd(job, page.url, ctx.company, i)).filter(ctx.want),
      total: onPage.length,
      titles: onPage.map((job) => job.title),
    };
  }

  const links = extractLinks(page.html, page.url).filter((l) => sameSite(l.url, page.url) && l.url !== page.url);
  const jobLinks = links.filter((l) => JOB_PATH.test(new URL(l.url).pathname) && l.text.length >= 3);
  if (jobLinks.length) {
    // Try the job pages for JSON-LD, spending requests only on titles that match a target role.
    const wanted = jobLinks.filter((l) => ctx.wantTitle(l.text)).map((l) => ({ title: l.text, url: l.url }));
    const postings = await readJobPages(wanted, ctx, false);
    if (postings.length || !wanted.length) {
      return {
        method: "jsonld_pages",
        embedded: null,
        postings,
        total: jobLinks.length,
        titles: jobLinks.map((l) => l.text),
      };
    }
  }

  // Last resort: the AI lists the jobs; code keeps only what the page itself shows.
  const pageText = htmlToText(page.html).slice(0, PAGE_TEXT_LIMIT);
  const listed = await ctx.listJobs({ url: page.url, pageText, links: links.slice(0, MAX_LINKS_FOR_AI) });
  const text = normalizeForMatch(pageText);
  const known = new Set(links.map((l) => l.url));
  const real = listed.filter((job) => text.includes(normalizeForMatch(job.title)) && known.has(job.url));
  if (!real.length) return { method: "none", embedded: null, postings: [], total: 0, titles: [] };
  const postings = await readJobPages(
    real.filter((job) => ctx.wantTitle(job.title)),
    ctx,
    true,
  );
  return { method: "ai_links", embedded: null, postings, total: real.length, titles: real.map((j) => j.title) };
}
