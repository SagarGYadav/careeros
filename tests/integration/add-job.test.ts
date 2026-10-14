// Add job, the job page's data and Fit Reports on added jobs, against the test database with the mock AI.
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { savePreferences } from "@/server/repositories/profile";
import { addJob, fetchFullDescription, replaceJobDescription } from "@/server/services/add-job";
import { generateFitReport } from "@/server/services/fit-report";
import { getJobView } from "@/server/services/job-view";

const EMAIL_DOMAIN = "@addjob.integration.careeros.test";
let userId: string;

// A fictional posting.
const DESCRIPTION = `What you'll do:
- Build the merchant dashboard in Next.js and React
- Own performance and accessibility of the checkout flow
Requirements:
- 3+ years of frontend experience
- Strong TypeScript and React
- Experience with REST APIs
Good to have:
- GraphQL
Hybrid, 3 days a week in the office. Notice period: 30 days.`;

const input = (over: Record<string, unknown> = {}) => ({
  title: "Frontend Engineer",
  company: "Kestrel Pay Pvt. Ltd.",
  location: "Bengaluru",
  workMode: "hybrid",
  salaryText: "18-24 LPA",
  description: DESCRIPTION,
  applyUrl: "https://jobs.kestrel.example/42",
  origin: "paste",
  ...over,
});

beforeAll(async () => {
  userId = randomUUID();
  await db.user.create({ data: { id: userId, name: "Add Job Test", email: `aj-${userId}${EMAIL_DOMAIN}` } });
  await savePreferences(userId, {
    currentCtc: null,
    expectedCtcMin: 1_800_000,
    expectedCtcMax: null,
    noticePeriodDays: 30,
    preferredLocations: ["Bengaluru"],
    workModes: ["hybrid"],
    openToRelocate: false,
    dealbreakers: { bond: false, nightShift: false, contractToHire: false, maxWfoDaysPerWeek: null },
  });
}, 60_000);

afterAll(async () => {
  await db.user.deleteMany({ where: { email: { endsWith: EMAIL_DOMAIN } } });
  await db.$disconnect();
});

describe("Add job", () => {
  it("cleans and ranks an added job, and returns the existing one for a duplicate", async () => {
    const { jobId, duplicate } = await addJob(userId, input());
    expect(duplicate).toBe(false);
    const job = await db.job.findUniqueOrThrow({ where: { id: jobId } });
    expect(job).toMatchObject({
      companyName: "Kestrel Pay",
      locationCity: "Bengaluru",
      workMode: "hybrid",
      origin: "paste",
      provider: "manual",
      salaryDisclosed: true,
      salaryMinAnnual: 1_800_000,
      expMinYears: 3,
    });
    expect(job.quickScore).not.toBeNull();
    expect(job.sortScore).toBe(job.quickScore);
    expect(await addJob(userId, input({ origin: "manual" }))).toEqual({ jobId, duplicate: true });
    await expect(addJob(userId, input({ description: "Too short." }))).rejects.toThrow();
  }, 60_000);

  it("writes a Fit Report for an added job; the job then sorts by its Fit score", async () => {
    const job = await db.job.findFirstOrThrow({ where: { userId } });
    expect((await getJobView(userId, job.id)).analysis).toBeNull();
    const report = await generateFitReport(userId, job.id);
    const view = await getJobView(userId, job.id);
    expect(view.analysis).toMatchObject({ scoreTotal: report.analysis.score.total });
    expect(view.analysis?.report?.summary).toEqual(report.report.summary);
    expect(view.requirements.length).toBeGreaterThan(3);
    const updated = await db.job.findUniqueOrThrow({ where: { id: job.id } });
    expect(updated).toMatchObject({
      fitScore: report.analysis.score.total,
      fitRecommendation: report.analysis.score.recommendation,
      sortScore: report.analysis.score.total,
    });
  }, 120_000);

  it("replaces a cut-off description, pasted or read from the job's own page", async () => {
    const job = await db.job.findFirstOrThrow({ where: { userId } });
    await db.job.update({ where: { id: job.id }, data: { descriptionTruncated: true } });
    await expect(replaceJobDescription(userId, job.id, { description: "short" })).rejects.toThrow();
    const pasted = `${DESCRIPTION}\nWe also value Redux experience and a bachelor's degree in computer science.`.padEnd(
      400,
      " ",
    );
    await replaceJobDescription(userId, job.id, { description: pasted });
    expect(await db.job.findUniqueOrThrow({ where: { id: job.id } })).toMatchObject({ descriptionTruncated: false });

    // The job's link answers with JobPosting data (a fake web: no real request leaves the test).
    const longer = `${pasted}\n${"Details about the team and the product. ".repeat(10)}`;
    const page = `<script type="application/ld+json">${JSON.stringify({
      "@type": "JobPosting",
      title: "Frontend Engineer",
      description: longer.replace(/\n/g, "<br>"),
      hiringOrganization: { name: "Kestrel Pay" },
    })}</script>`;
    const deps = {
      lookup: async () => ["93.184.216.34"],
      fetch: (async (url: RequestInfo | URL) =>
        String(url).endsWith("/robots.txt")
          ? new Response("", { status: 404 })
          : new Response(page, { headers: { "content-type": "text/html" } })) as typeof fetch,
    };
    expect(await fetchFullDescription(userId, job.id, deps)).toEqual({ site: "jobs.kestrel.example" });
    const after = await db.job.findUniqueOrThrow({ where: { id: job.id } });
    expect(after.descriptionRaw).toContain("Details about the team");
  }, 60_000);
});
