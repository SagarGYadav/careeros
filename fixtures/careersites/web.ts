// Recorded fixture set for deep search (SPEC §11.6): saved responses for 15 career sites — 5 ATS boards, 4 pages
// with JobPosting JSON-LD (one embeds an ATS board), 3 plain HTML careers pages, 3 robots-disallowed or failing
// sites. Every company, job and address is fictional (ATS hosts are real, board tokens are invented; company sites
// use the reserved .example domain). Tests serve these through a fake fetch, so nothing reaches the network.

export type FixtureResponse = { status?: number; type?: string; body: string };

export type FixtureSite = {
  id: string;
  category: "ats" | "jsonld" | "html" | "robots" | "failing";
  /** How the registry knows the site. */
  site: { kind: string; token: string | null; url: string; name: string };
  /** Every job the site lists (what "100% extracted" is measured against). */
  allTitles: string[];
  /** The jobs that pass FIXTURE_FILTER (target roles, Bengaluru or remote). */
  matching: string[];
};

/** The filter the expectations assume: frontend/React roles, Bengaluru, remote accepted. */
export const FIXTURE_FILTER = {
  titleVariants: ["Frontend Developer", "Frontend Engineer", "React Developer"],
  cities: ["Bengaluru"],
  remoteOk: true,
  now: new Date("2026-10-15T08:00:00Z"),
};

const json = (data: unknown): FixtureResponse => ({ type: "application/json", body: JSON.stringify(data) });
const html = (body: string): FixtureResponse => ({ type: "text/html; charset=utf-8", body });
const page = (title: string, inner: string) =>
  html(`<!doctype html><html><head><title>${title}</title></head><body>${inner}</body></html>`);
const jsonLd = (data: unknown) => `<script type="application/ld+json">${JSON.stringify(data)}</script>`;
const posting = (title: string, city: string | null, extra: Record<string, unknown> = {}) => ({
  "@context": "https://schema.org",
  "@type": "JobPosting",
  title,
  datePosted: "2026-10-01",
  description: `<p>${title} at a fictional company.</p><ul><li>React and TypeScript</li><li>3+ years of experience</li></ul>`,
  hiringOrganization: { "@type": "Organization", name: "Fictional Co" },
  ...(city && { jobLocation: { "@type": "Place", address: { addressLocality: city, addressCountry: "IN" } } }),
  ...extra,
});
const DESC =
  "&lt;p&gt;Build fast, accessible web apps in React and TypeScript.&lt;/p&gt;&lt;ul&gt;&lt;li&gt;3+ years&lt;/li&gt;&lt;/ul&gt;";

export const FIXTURE_SITES: FixtureSite[] = [
  {
    id: "greenhouse-kestrelpay",
    category: "ats",
    site: {
      kind: "greenhouse",
      token: "kestrelpay",
      url: "https://boards.greenhouse.io/kestrelpay",
      name: "Kestrel Pay",
    },
    allTitles: ["Senior Frontend Engineer", "Backend Engineer (Go)", "Frontend Engineer", "React Developer"],
    matching: ["Senior Frontend Engineer", "React Developer"],
  },
  {
    id: "lever-copperleaf",
    category: "ats",
    site: { kind: "lever", token: "copperleaf", url: "https://jobs.lever.co/copperleaf", name: "Copperleaf" },
    allTitles: ["Frontend Developer", "Data Analyst", "Front-End Engineer II"],
    matching: ["Frontend Developer", "Front-End Engineer II"],
  },
  {
    id: "ashby-tamarind",
    category: "ats",
    site: {
      kind: "ashby",
      token: "tamarind-commerce",
      url: "https://jobs.ashbyhq.com/tamarind-commerce",
      name: "Tamarind Commerce",
    },
    allTitles: ["React Developer", "Senior Frontend Engineer"],
    matching: ["Senior Frontend Engineer"],
  },
  {
    id: "smartrecruiters-mosaic",
    category: "ats",
    site: {
      kind: "smartrecruiters",
      token: "MosaicRetailCloud",
      url: "https://jobs.smartrecruiters.com/MosaicRetailCloud",
      name: "Mosaic Retail Cloud",
    },
    allTitles: ["Frontend Developer", "Store Manager"],
    matching: ["Frontend Developer"],
  },
  {
    id: "recruitee-halcyon",
    category: "ats",
    site: {
      kind: "recruitee",
      token: "halcyonstreams",
      url: "https://halcyonstreams.recruitee.com",
      name: "Halcyon Streams",
    },
    allTitles: ["Frontend Engineer (React)", "Backend Engineer (Go)"],
    matching: ["Frontend Engineer (React)"],
  },
  {
    id: "jsonld-northwind",
    category: "jsonld",
    site: { kind: "html", token: null, url: "https://careers.northwind.example/careers", name: "Northwind Ledger" },
    allTitles: ["Frontend Engineer", "Platform Engineer"],
    matching: ["Frontend Engineer"],
  },
  {
    id: "jsonld-pages-lumen",
    category: "jsonld",
    site: { kind: "html", token: null, url: "https://jobs.lumen.example/careers", name: "Lumen Ledger" },
    allTitles: ["React Developer", "QA Analyst"],
    matching: ["React Developer"],
  },
  {
    id: "jsonld-marigold",
    category: "jsonld",
    site: { kind: "html", token: null, url: "https://www.marigold.example/jobs", name: "Marigold Health" },
    allTitles: ["Frontend Developer"],
    matching: ["Frontend Developer"],
  },
  {
    id: "embedded-saffron",
    category: "jsonld",
    site: { kind: "html", token: null, url: "https://www.saffron.example/careers", name: "Saffron Retail" },
    allTitles: ["Frontend Developer", "Merchandiser"],
    matching: ["Frontend Developer"],
  },
  {
    id: "html-bluebell",
    category: "html",
    site: { kind: "html", token: null, url: "https://www.bluebell.example/careers", name: "Bluebell Travel" },
    allTitles: ["Frontend Developer", "Product Designer", "Customer Support Executive"],
    matching: ["Frontend Developer"],
  },
  {
    id: "html-juniper",
    category: "html",
    site: { kind: "html", token: null, url: "https://www.juniper.example/jobs", name: "Juniper Health" },
    allTitles: ["Senior Frontend Engineer", "React Native Developer", "Android Engineer"],
    matching: ["Senior Frontend Engineer"],
  },
  {
    id: "html-quill",
    category: "html",
    site: { kind: "html", token: null, url: "https://www.quill.example/careers", name: "Quill Commerce" },
    allTitles: ["React Developer", "Account Executive"],
    matching: ["React Developer"],
  },
  {
    id: "robots-tidepool",
    category: "robots",
    site: { kind: "html", token: null, url: "https://www.tidepool.example/careers", name: "Tidepool Analytics" },
    allTitles: [],
    matching: [],
  },
  {
    id: "failing-halcyon-site",
    category: "failing",
    site: { kind: "html", token: null, url: "https://www.halcyon.example/careers", name: "Halcyon Labs" },
    allTitles: [],
    matching: [],
  },
  {
    id: "empty-larkspur",
    category: "failing",
    site: { kind: "html", token: null, url: "https://www.larkspur.example/careers", name: "Larkspur Media" },
    allTitles: [],
    matching: [],
  },
];

const htmlJobPage = (title: string, city: string) =>
  page(
    title,
    `<main><h1>${title}</h1><p>Location: ${city}, India</p><p>Work on our web app with React and TypeScript. 3+ years of experience.</p></main>`,
  );

/** Every saved response, by URL. A URL that isn't here answers 404 (robots.txt included: no rules). */
export const FIXTURE_RESPONSES: Record<string, FixtureResponse> = {
  // --- ATS boards ---
  "https://boards-api.greenhouse.io/v1/boards/kestrelpay/jobs?content=true": json({
    jobs: [
      {
        id: 4012001,
        title: "Senior Frontend Engineer",
        location: { name: "Bengaluru, India" },
        absolute_url: "https://boards.greenhouse.io/kestrelpay/jobs/4012001",
        content: DESC,
        updated_at: "2026-10-05T10:00:00Z",
      },
      {
        id: 4012002,
        title: "Backend Engineer (Go)",
        location: { name: "Bengaluru, India" },
        absolute_url: "https://boards.greenhouse.io/kestrelpay/jobs/4012002",
        content: DESC,
        updated_at: "2026-10-05T10:00:00Z",
      },
      {
        id: 4012003,
        title: "Frontend Engineer",
        location: { name: "San Francisco, CA" },
        absolute_url: "https://boards.greenhouse.io/kestrelpay/jobs/4012003",
        content: DESC,
        updated_at: "2026-10-05T10:00:00Z",
      },
      {
        id: 4012004,
        title: "React Developer",
        location: { name: "Remote - India" },
        absolute_url: "https://boards.greenhouse.io/kestrelpay/jobs/4012004",
        content: DESC,
        updated_at: "2026-09-30T10:00:00Z",
      },
    ],
    meta: { total: 4 },
  }),
  "https://api.lever.co/v0/postings/copperleaf?mode=json": json([
    {
      id: "lv-1",
      text: "Frontend Developer",
      categories: { location: "Bengaluru", commitment: "Full-time" },
      descriptionPlain: "Build the merchant dashboard in React.",
      lists: [{ text: "Requirements", content: "<li>3+ years of React</li>" }],
      hostedUrl: "https://jobs.lever.co/copperleaf/lv-1",
      applyUrl: "https://jobs.lever.co/copperleaf/lv-1/apply",
      workplaceType: "hybrid",
    },
    {
      id: "lv-2",
      text: "Data Analyst",
      categories: { location: "Bengaluru" },
      descriptionPlain: "SQL and dashboards.",
      hostedUrl: "https://jobs.lever.co/copperleaf/lv-2",
      workplaceType: "onsite",
    },
    {
      id: "lv-3",
      text: "Front-End Engineer II",
      categories: { location: "Remote" },
      descriptionPlain: "Remote role open across India.",
      hostedUrl: "https://jobs.lever.co/copperleaf/lv-3",
      workplaceType: "remote",
    },
  ]),
  "https://api.ashbyhq.com/posting-api/job-board/tamarind-commerce?includeCompensation=true": json({
    apiVersion: "1",
    jobs: [
      {
        title: "React Developer",
        location: "Pune",
        isRemote: false,
        workplaceType: "OnSite",
        descriptionPlain: "React storefronts.",
        publishedAt: "2026-10-02T00:00:00Z",
        employmentType: "FullTime",
        jobUrl: "https://jobs.ashbyhq.com/tamarind-commerce/a1",
        applyUrl: "https://jobs.ashbyhq.com/tamarind-commerce/a1/application",
        isListed: true,
      },
      {
        title: "Senior Frontend Engineer",
        location: "Bengaluru",
        isRemote: false,
        workplaceType: "Hybrid",
        descriptionPlain: "Lead our storefront frontend.",
        publishedAt: "2026-10-03T00:00:00Z",
        employmentType: "FullTime",
        jobUrl: "https://jobs.ashbyhq.com/tamarind-commerce/a2",
        isListed: true,
        compensation: { compensationTierSummary: "₹30L – ₹40L" },
      },
      {
        title: "Frontend Developer",
        location: "Bengaluru",
        isRemote: false,
        descriptionPlain: "Unlisted role.",
        publishedAt: "2026-10-03T00:00:00Z",
        jobUrl: "https://jobs.ashbyhq.com/tamarind-commerce/a3",
        isListed: false,
      },
    ],
  }),
  "https://api.smartrecruiters.com/v1/companies/MosaicRetailCloud/postings?limit=100": json({
    totalFound: 2,
    content: [
      {
        id: "744001",
        name: "Frontend Developer",
        location: { city: "Bengaluru", country: "in", remote: false },
        releasedDate: "2026-10-04T00:00:00Z",
        typeOfEmployment: { label: "Full-time" },
      },
      {
        id: "744002",
        name: "Store Manager",
        location: { city: "Chennai", country: "in" },
        releasedDate: "2026-10-04T00:00:00Z",
      },
    ],
  }),
  "https://api.smartrecruiters.com/v1/companies/MosaicRetailCloud/postings/744001": json({
    id: "744001",
    name: "Frontend Developer",
    applyUrl: "https://jobs.smartrecruiters.com/MosaicRetailCloud/744001-frontend-developer?oga=true",
    jobAd: {
      sections: {
        jobDescription: { title: "Job Description", text: "<p>Build our design system in React.</p>" },
        qualifications: { title: "Qualifications", text: "<ul><li>TypeScript</li></ul>" },
      },
    },
  }),
  "https://halcyonstreams.recruitee.com/api/offers/": json({
    offers: [
      {
        id: 91,
        title: "Frontend Engineer (React)",
        description: "<p>Streaming dashboards in React.</p>",
        requirements: "<ul><li>4+ years</li></ul>",
        locations: [{ city: "Bengaluru", country: "India" }],
        remote: false,
        careers_url: "https://halcyonstreams.recruitee.com/o/frontend-engineer-react",
        careers_apply_url: "https://halcyonstreams.recruitee.com/o/frontend-engineer-react/c/new",
        published_at: "2026-10-06 09:00:00 UTC",
        employment_type_code: "fulltime_permanent",
        status: "published",
      },
      {
        id: 92,
        title: "Backend Engineer (Go)",
        description: "<p>Event pipelines.</p>",
        locations: [{ city: "Bengaluru", country: "India" }],
        careers_url: "https://halcyonstreams.recruitee.com/o/backend-engineer-go",
        published_at: "2026-10-06 09:00:00 UTC",
        status: "published",
      },
    ],
  }),

  // --- JSON-LD on the careers page (several postings in one @graph) ---
  "https://careers.northwind.example/careers": page(
    "Careers at Northwind Ledger",
    `<h1>Open roles</h1>${jsonLd({
      "@context": "https://schema.org",
      "@graph": [
        posting("Frontend Engineer", "Bengaluru", {
          url: "https://careers.northwind.example/careers/frontend-engineer",
        }),
        posting("Platform Engineer", "Bengaluru", {
          url: "https://careers.northwind.example/careers/platform-engineer",
        }),
      ],
    })}`,
  ),

  // --- JSON-LD on the linked job pages ---
  "https://jobs.lumen.example/careers": page(
    "Lumen Ledger jobs",
    `<ul><li><a href="/careers/react-developer">React Developer</a></li><li><a href="/careers/qa-analyst">QA Analyst</a></li><li><a href="/about">About us</a></li></ul>`,
  ),
  "https://jobs.lumen.example/careers/react-developer": page(
    "React Developer",
    jsonLd(posting("React Developer", "Bengaluru")),
  ),
  "https://jobs.lumen.example/careers/qa-analyst": page("QA Analyst", jsonLd(posting("QA Analyst", "Bengaluru"))),

  // --- One remote posting on the page ---
  "https://www.marigold.example/jobs": page(
    "Jobs",
    jsonLd(
      posting("Frontend Developer", null, {
        jobLocationType: "TELECOMMUTE",
        applicantLocationRequirements: { "@type": "Country", name: "India" },
      }),
    ),
  ),

  // --- A careers page that embeds a Greenhouse board ---
  "https://www.saffron.example/careers": page(
    "Careers",
    `<h1>Join Saffron Retail</h1><div id="grnhse_app"></div><script src="https://boards.greenhouse.io/embed/job_board/js?for=saffronretail"></script>`,
  ),
  "https://boards-api.greenhouse.io/v1/boards/saffronretail/jobs?content=true": json({
    jobs: [
      {
        id: 5100001,
        title: "Frontend Developer",
        location: { name: "Bengaluru" },
        absolute_url: "https://boards.greenhouse.io/saffronretail/jobs/5100001",
        content: DESC,
        updated_at: "2026-10-07T10:00:00Z",
      },
      {
        id: 5100002,
        title: "Merchandiser",
        location: { name: "Chennai" },
        absolute_url: "https://boards.greenhouse.io/saffronretail/jobs/5100002",
        content: DESC,
        updated_at: "2026-10-07T10:00:00Z",
      },
    ],
  }),

  // --- Plain HTML careers pages (no job data): read by CareerPageExtractor ---
  "https://www.bluebell.example/careers": page(
    "Careers at Bluebell Travel",
    `<nav><a href="/">Home</a> <a href="/careers">Careers</a></nav><h2>Open positions</h2>
     <div class="job"><a href="/careers/frontend-developer">Frontend Developer</a> · Bengaluru</div>
     <div class="job"><a href="/careers/product-designer">Product Designer</a> · Bengaluru</div>
     <div class="job"><a href="/careers/customer-support-executive">Customer Support Executive</a> · Hyderabad</div>`,
  ),
  "https://www.bluebell.example/careers/frontend-developer": htmlJobPage("Frontend Developer", "Bengaluru"),
  "https://www.bluebell.example/careers/product-designer": htmlJobPage("Product Designer", "Bengaluru"),
  "https://www.juniper.example/jobs": page(
    "Work at Juniper Health",
    `<h1>Jobs</h1><table><tr><td><a href="/jobs/senior-frontend-engineer">Senior Frontend Engineer</a></td><td>Bengaluru</td></tr>
     <tr><td><a href="/jobs/react-native-developer">React Native Developer</a></td><td>Hyderabad</td></tr>
     <tr><td><a href="/jobs/android-engineer">Android Engineer</a></td><td>Hyderabad</td></tr></table>`,
  ),
  "https://www.juniper.example/jobs/senior-frontend-engineer": htmlJobPage("Senior Frontend Engineer", "Bengaluru"),
  "https://www.quill.example/careers": page(
    "Careers",
    `<h1>We're hiring</h1><section><h3>React Developer</h3><p>Bengaluru · Full-time</p><a href="/careers/openings/301">React Developer</a> <a href="/careers/openings/301">Apply</a></section>
     <section><h3>Account Executive</h3><p>Mumbai</p><a href="/careers/openings/302">Account Executive</a></section>`,
  ),
  "https://www.quill.example/careers/openings/301": htmlJobPage("React Developer", "Bengaluru"),

  // --- robots.txt says no: the careers page must never be requested ---
  "https://www.tidepool.example/robots.txt": { type: "text/plain", body: "User-agent: *\nDisallow: /" },
  "https://www.tidepool.example/careers": page("Careers", jsonLd(posting("Frontend Developer", "Bengaluru"))),

  // --- A server error, and a page with no openings ---
  "https://www.halcyon.example/careers": { status: 500, type: "text/html", body: "<h1>Internal Server Error</h1>" },
  "https://www.larkspur.example/careers": page(
    "Careers",
    "<h1>Careers</h1><p>No openings right now. Check back soon!</p>",
  ),
};

/** A fetch that serves FIXTURE_RESPONSES and records every URL asked for. */
export function fixtureFetch() {
  const requested: string[] = [];
  const fetchImpl = (async (input: RequestInfo | URL) => {
    const url = String(input);
    requested.push(url);
    const response = FIXTURE_RESPONSES[url];
    if (!response) return new Response("Not found", { status: 404, headers: { "content-type": "text/plain" } });
    return new Response(response.body, {
      status: response.status ?? 200,
      headers: { "content-type": response.type ?? "text/html" },
    });
  }) as typeof fetch;
  return { fetch: fetchImpl, requested, lookup: async () => ["93.184.216.34"] };
}
