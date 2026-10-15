// ATS adapters (SPEC §11.1, §11.3): keyless public job-board APIs, checked against the official docs on 2026-10-15.
//   Greenhouse       GET boards-api.greenhouse.io/v1/boards/{token}/jobs?content=true   (content is entity-encoded HTML)
//   Lever            GET api.lever.co/v0/postings/{site}?mode=json   (EU boards: api.eu.lever.co)
//   Ashby            GET api.ashbyhq.com/posting-api/job-board/{name}?includeCompensation=true
//   SmartRecruiters  GET api.smartrecruiters.com/v1/companies/{id}/postings, then /postings/{postingId} for details
//   Recruitee        GET {company}.recruitee.com/api/offers/
// Each returns the postings that pass the local filter, plus the board's total, for the registry.
import { decodeEntities, htmlToText } from "@/lib/web/jsonld";
import type { AtsKind } from "./ats";
import type { SitePosting } from "./postings";

export type WantFn = (p: Pick<SitePosting, "title" | "location" | "workModeHint" | "postedAt">) => boolean;

export type AtsContext = {
  /** GET a JSON API (throttled per host, CareerOS user agent, size and time limits). */
  getJson: <T>(url: string) => Promise<T>;
  want: WantFn;
  /** Requests left this run; detail requests stop when it reaches 0. */
  budget: { pages: number };
};

/** Matching postings, plus every title the board lists (for the registry's count and the §11.6 measurement). */
export type BoardRead = { postings: SitePosting[]; total: number; titles: string[] };

const date = (value: unknown): Date | null => {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
};
const text = (html: string | null | undefined) => (html ? htmlToText(html) : "");
const mode = (value: string | null | undefined): SitePosting["workModeHint"] => {
  const v = (value ?? "").toLowerCase();
  return v.includes("remote") ? "remote" : v.includes("hybrid") ? "hybrid" : /on-?site/.test(v) ? "onsite" : null;
};

async function greenhouse(token: string, company: string, ctx: AtsContext): Promise<BoardRead> {
  type Job = {
    id: number;
    title: string;
    location?: { name?: string };
    absolute_url: string;
    content?: string;
    updated_at?: string;
    first_published?: string;
  };
  ctx.budget.pages--;
  const data = await ctx.getJson<{ jobs?: Job[] }>(
    `https://boards-api.greenhouse.io/v1/boards/${token}/jobs?content=true`,
  );
  const jobs = data.jobs ?? [];
  const postings = jobs
    .map((j): SitePosting => ({
      externalId: String(j.id),
      title: j.title,
      company,
      location: j.location?.name ?? "",
      description: text(decodeEntities(j.content ?? "")),
      url: j.absolute_url,
      applyUrl: j.absolute_url,
      postedAt: date(j.first_published ?? j.updated_at),
      employmentType: null,
      workModeHint: mode(j.location?.name),
      salaryText: null,
    }))
    .filter(ctx.want);
  return { postings, total: jobs.length, titles: jobs.map((j) => j.title) };
}

async function lever(token: string, company: string, ctx: AtsContext): Promise<BoardRead> {
  type Posting = {
    id: string;
    text: string;
    categories?: { location?: string; commitment?: string; allLocations?: string[] };
    descriptionPlain?: string;
    description?: string;
    lists?: { text?: string; content?: string }[];
    additionalPlain?: string;
    hostedUrl: string;
    applyUrl?: string;
    workplaceType?: string;
    createdAt?: number;
    salaryDescriptionPlain?: string;
  };
  ctx.budget.pages--;
  let data: Posting[];
  try {
    data = await ctx.getJson<Posting[]>(`https://api.lever.co/v0/postings/${token}?mode=json`);
  } catch (error) {
    // Boards hosted in Lever's EU region answer only there.
    if (ctx.budget.pages <= 0) throw error;
    ctx.budget.pages--;
    data = await ctx.getJson<Posting[]>(`https://api.eu.lever.co/v0/postings/${token}?mode=json`);
  }
  const postings = data
    .map((p): SitePosting => {
      const location = [p.categories?.location, ...(p.categories?.allLocations ?? [])].filter(Boolean).join("; ");
      const lists = (p.lists ?? []).map((l) => `${l.text ?? ""}\n${text(l.content)}`).join("\n");
      return {
        externalId: p.id,
        title: p.text,
        company,
        location,
        description: [p.descriptionPlain ?? text(p.description), lists, p.additionalPlain ?? ""]
          .filter(Boolean)
          .join("\n")
          .trim(),
        url: p.hostedUrl,
        applyUrl: p.applyUrl ?? p.hostedUrl,
        // createdAt isn't in Lever's documentation; used only when present.
        postedAt: date(p.createdAt),
        employmentType: p.categories?.commitment ?? null,
        workModeHint: mode(p.workplaceType) ?? mode(location),
        salaryText: p.salaryDescriptionPlain?.trim() || null,
      };
    })
    .filter(ctx.want);
  return { postings, total: data.length, titles: data.map((p) => p.text) };
}

async function ashby(token: string, company: string, ctx: AtsContext): Promise<BoardRead> {
  type Job = {
    title: string;
    location?: string;
    isRemote?: boolean;
    workplaceType?: string;
    descriptionHtml?: string;
    descriptionPlain?: string;
    publishedAt?: string;
    employmentType?: string;
    jobUrl: string;
    applyUrl?: string;
    isListed?: boolean;
    compensation?: { compensationTierSummary?: string };
  };
  ctx.budget.pages--;
  const data = await ctx.getJson<{ jobs?: Job[] }>(
    `https://api.ashbyhq.com/posting-api/job-board/${token}?includeCompensation=true`,
  );
  const listed = (data.jobs ?? []).filter((j) => j.isListed !== false);
  const postings = listed
    .map((j): SitePosting => ({
      externalId: j.jobUrl,
      title: j.title,
      company,
      location: [j.location, j.isRemote ? "Remote" : ""].filter(Boolean).join(", "),
      description: j.descriptionPlain ?? text(j.descriptionHtml),
      url: j.jobUrl,
      applyUrl: j.applyUrl ?? j.jobUrl,
      postedAt: date(j.publishedAt),
      employmentType: j.employmentType ?? null,
      workModeHint: j.isRemote ? "remote" : mode(j.workplaceType),
      salaryText: j.compensation?.compensationTierSummary ?? null,
    }))
    .filter(ctx.want);
  return { postings, total: listed.length, titles: listed.map((j) => j.title) };
}

async function smartrecruiters(token: string, company: string, ctx: AtsContext): Promise<BoardRead> {
  type Item = {
    id: string;
    name: string;
    location?: { city?: string; region?: string; country?: string; remote?: boolean };
    releasedDate?: string;
    typeOfEmployment?: { label?: string };
  };
  type Detail = {
    applyUrl?: string;
    jobAd?: { sections?: Record<string, { title?: string; text?: string } | undefined> };
  };
  ctx.budget.pages--;
  const list = await ctx.getJson<{ content?: Item[]; totalFound?: number }>(
    `https://api.smartrecruiters.com/v1/companies/${token}/postings?limit=100`,
  );
  const items = list.content ?? [];
  const postings: SitePosting[] = [];
  for (const item of items) {
    const location = [
      item.location?.city,
      item.location?.region,
      item.location?.country,
      item.location?.remote ? "Remote" : "",
    ]
      .filter(Boolean)
      .join(", ");
    const base = {
      title: item.name,
      location,
      workModeHint: item.location?.remote ? ("remote" as const) : null,
      postedAt: date(item.releasedDate),
    };
    // The list has no descriptions: a detail request is spent only on postings that pass the filter.
    if (!ctx.want(base) || ctx.budget.pages <= 0) continue;
    ctx.budget.pages--;
    const detail = await ctx.getJson<Detail>(
      `https://api.smartrecruiters.com/v1/companies/${token}/postings/${item.id}`,
    );
    const sections = detail.jobAd?.sections ?? {};
    const url = `https://jobs.smartrecruiters.com/${token}/${item.id}`;
    postings.push({
      ...base,
      externalId: item.id,
      company,
      description: ["jobDescription", "qualifications", "additionalInformation"]
        .map((key) => text(sections[key]?.text))
        .filter(Boolean)
        .join("\n"),
      url,
      applyUrl: detail.applyUrl ?? url,
      employmentType: item.typeOfEmployment?.label ?? null,
      salaryText: null,
    });
  }
  return { postings, total: list.totalFound ?? items.length, titles: items.map((i) => i.name) };
}

async function recruitee(token: string, company: string, ctx: AtsContext): Promise<BoardRead> {
  type Offer = {
    id: number;
    title: string;
    description?: string;
    requirements?: string;
    locations?: { city?: string; country?: string }[];
    city?: string;
    country?: string;
    remote?: boolean;
    careers_url: string;
    careers_apply_url?: string;
    published_at?: string;
    employment_type_code?: string;
    status?: string;
  };
  ctx.budget.pages--;
  const data = await ctx.getJson<{ offers?: Offer[] }>(`https://${token}.recruitee.com/api/offers/`);
  const offers = (data.offers ?? []).filter((o) => !o.status || o.status === "published");
  const postings = offers
    .map((o): SitePosting => {
      const places = (o.locations?.length ? o.locations : [{ city: o.city, country: o.country }])
        .map((l) => [l.city, l.country].filter(Boolean).join(", "))
        .filter(Boolean);
      return {
        externalId: String(o.id),
        title: o.title,
        company,
        location: [...places, o.remote ? "Remote" : ""].filter(Boolean).join("; "),
        description: [text(o.description), text(o.requirements)].filter(Boolean).join("\n"),
        url: o.careers_url,
        applyUrl: o.careers_apply_url ?? o.careers_url,
        postedAt: date(o.published_at),
        employmentType: o.employment_type_code ?? null,
        workModeHint: o.remote ? "remote" : null,
        salaryText: null,
      };
    })
    .filter(ctx.want);
  return { postings, total: offers.length, titles: offers.map((o) => o.title) };
}

const ADAPTERS: Record<AtsKind, (token: string, company: string, ctx: AtsContext) => Promise<BoardRead>> = {
  greenhouse,
  lever,
  ashby,
  smartrecruiters,
  recruitee,
};

export function readAtsBoard(kind: AtsKind, token: string, company: string, ctx: AtsContext): Promise<BoardRead> {
  return ADAPTERS[kind](token, company, ctx);
}
