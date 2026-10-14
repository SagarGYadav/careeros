import { describe, expect, it } from "vitest";
import { fetchPublicPage } from "@/lib/web/fetch-page";
import { extractJobPosting, htmlToText } from "@/lib/web/jsonld";
import { robotsAllows } from "@/lib/web/robots";
import { checkUrl, isPublicIp } from "@/lib/web/ssrf";

describe("SSRF guard", () => {
  it("accepts public http(s) links and refuses everything that could reach a private network", () => {
    expect(checkUrl("https://careers.kestrelpay.example/jobs/42").ok).toBe(true);
    const refused = [
      "ftp://example.com/file",
      "file:///etc/passwd",
      "https://user:pass@example.com/",
      "https://example.com:8080/",
      "http://localhost/admin",
      "http://intranet/",
      "http://printer.local/",
      "http://127.0.0.1/",
      "http://10.0.0.5/",
      "http://169.254.169.254/latest/meta-data/",
      "http://192.168.1.1/",
      "http://[::1]/",
      "not a url",
    ];
    for (const url of refused) expect(checkUrl(url).ok, url).toBe(false);
  });

  it("never fetches LinkedIn or Naukri", () => {
    expect(checkUrl("https://www.linkedin.com/jobs/view/123")).toMatchObject({
      ok: false,
      reason: expect.stringContaining("LinkedIn"),
    });
    expect(checkUrl("https://naukri.com/job-listings-x").ok).toBe(false);
  });

  it("knows which addresses are public", () => {
    expect(isPublicIp("93.184.216.34")).toBe(true);
    expect(isPublicIp("2606:4700::1111")).toBe(true);
    for (const ip of [
      "0.0.0.0",
      "100.64.0.1",
      "172.20.1.1",
      "198.18.0.1",
      "224.0.0.1",
      "::ffff:10.0.0.1",
      "fd00::1",
      "fe80::1",
    ]) {
      expect(isPublicIp(ip), ip).toBe(false);
    }
  });
});

describe("robots.txt", () => {
  const robots = `
User-agent: *
Disallow: /private
Allow: /private/jobs
Disallow: /*.pdf$

User-agent: BadBot
Disallow: /
`;
  it("applies the * group with the longest matching rule", () => {
    expect(robotsAllows(robots, "/careers/42")).toBe(true);
    expect(robotsAllows(robots, "/private/admin")).toBe(false);
    expect(robotsAllows(robots, "/private/jobs/42")).toBe(true);
    expect(robotsAllows(robots, "/files/jd.pdf")).toBe(false);
    expect(robotsAllows("", "/anything")).toBe(true);
  });

  it("prefers a group naming CareerOS", () => {
    expect(robotsAllows("User-agent: careeros\nDisallow: /\n\nUser-agent: *\nAllow: /", "/jobs")).toBe(false);
  });
});

// A fictional job page with JSON-LD inside a @graph.
const PAGE = `<html><head>
<script type="application/ld+json">{ not json }</script>
<script type="application/ld+json">
{"@context":"https://schema.org","@graph":[{"@type":"Organization","name":"Kestrel Pay"},
{"@type":"JobPosting","title":"Frontend Engineer","datePosted":"2026-10-01",
 "description":"<p>Build the merchant dashboard.</p><ul><li>3+ years of React</li><li>TypeScript</li></ul>",
 "hiringOrganization":{"@type":"Organization","name":"Kestrel Pay"},
 "jobLocation":{"@type":"Place","address":{"addressLocality":"Bengaluru","addressRegion":"KA","addressCountry":"IN"}},
 "employmentType":["FULL_TIME"],
 "baseSalary":{"@type":"MonetaryAmount","currency":"INR","value":{"minValue":1800000,"maxValue":2400000,"unitText":"YEAR"}}}]}
</script></head><body>…</body></html>`;

describe("JobPosting JSON-LD", () => {
  it("reads the posting with its description as text, employer, place and salary", () => {
    expect(extractJobPosting(PAGE)).toEqual({
      title: "Frontend Engineer",
      company: "Kestrel Pay",
      location: "Bengaluru, KA, IN",
      description: "Build the merchant dashboard.\n- 3+ years of React\n- TypeScript",
      salaryText: "₹18,00,000 - ₹24,00,000 a year",
      employmentType: "full_time",
      remote: false,
      postedAt: new Date("2026-10-01"),
    });
    expect(extractJobPosting("<html>no data</html>")).toBeNull();
  });

  it("turns HTML into readable text", () => {
    expect(htmlToText("<p>A &amp; B</p><script>x()</script><br>C&nbsp;D")).toBe("A & B\nC D");
  });
});

/** A fake web: each URL answers with a status, headers and body; DNS answers per host. */
function fakeWeb(
  pages: Record<string, { status?: number; headers?: Record<string, string>; body?: string }>,
  dns: Record<string, string[]>,
) {
  const requested: string[] = [];
  const fetchImpl = (async (input: RequestInfo | URL) => {
    const url = String(input);
    requested.push(url);
    const page = pages[url];
    if (!page) return new Response("not found", { status: 404 });
    return new Response(page.body ?? "", {
      status: page.status ?? 200,
      headers: { "content-type": "text/html", ...page.headers },
    });
  }) as typeof fetch;
  return { deps: { fetch: fetchImpl, lookup: async (host: string) => dns[host] ?? [] }, requested };
}

describe("fetching a public page", () => {
  it("fetches a page whose host is public and allowed by robots.txt", async () => {
    const web = fakeWeb({ "https://jobs.one.example/42": { body: PAGE } }, { "jobs.one.example": ["93.184.216.34"] });
    const page = await fetchPublicPage("https://jobs.one.example/42", web.deps);
    expect(page.url).toBe("https://jobs.one.example/42");
    expect(web.requested).toEqual(["https://jobs.one.example/robots.txt", "https://jobs.one.example/42"]);
  });

  it("refuses a host that resolves to a private address, even after a redirect", async () => {
    const direct = fakeWeb({}, { "jobs.two.example": ["10.1.2.3"] });
    await expect(fetchPublicPage("https://jobs.two.example/1", direct.deps)).rejects.toMatchObject({
      code: "URL_FETCH_BLOCKED",
    });

    const redirect = fakeWeb(
      { "https://jobs.three.example/1": { status: 302, headers: { location: "http://169.254.169.254/latest" } } },
      { "jobs.three.example": ["93.184.216.35"] },
    );
    await expect(fetchPublicPage("https://jobs.three.example/1", redirect.deps)).rejects.toMatchObject({
      code: "URL_FETCH_BLOCKED",
    });
  });

  it("respects robots.txt and refuses non-pages", async () => {
    const web = fakeWeb(
      {
        "https://jobs.four.example/robots.txt": {
          body: "User-agent: *\nDisallow: /jobs",
          headers: { "content-type": "text/plain" },
        },
        "https://jobs.four.example/file": { body: "%PDF", headers: { "content-type": "application/pdf" } },
      },
      { "jobs.four.example": ["93.184.216.36"] },
    );
    await expect(fetchPublicPage("https://jobs.four.example/jobs/1", web.deps)).rejects.toMatchObject({
      code: "FETCH_BLOCKED_BY_ROBOTS",
    });
    await expect(fetchPublicPage("https://jobs.four.example/file", web.deps)).rejects.toMatchObject({
      code: "URL_FETCH_FAILED",
    });
  });
});
