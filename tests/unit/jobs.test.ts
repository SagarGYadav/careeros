import { describe, expect, it } from "vitest";
import { mockPostings } from "@/lib/jobsearch/mock";
import { parseConditions, parseExperience, seniorityFromPosting } from "@/lib/jobs/conditions";
import { isSameJob, mergeApplyLinks, titleKey, type DedupeKey } from "@/lib/jobs/dedupe";
import {
  canonicalCity,
  companyKey,
  displayCompanyName,
  isDirectFromCompany,
  isStaffingAgency,
} from "@/lib/jobs/normalize";
import { buildSearchPlan } from "@/lib/jobs/plan";
import { prepareJob } from "@/lib/jobs/prepare";
import { DISMISSED_COMPANY_PENALTY, scoreJob, type RankingJob, type RankingProfile } from "@/lib/jobs/relevance";
import { parseSalary } from "@/lib/jobs/salary";

const NOW = new Date("2026-10-13T10:00:00Z");

describe("normalising postings", () => {
  it("removes company suffixes and builds a matching key", () => {
    expect(displayCompanyName("Kestrel Pay Pvt. Ltd.")).toBe("Kestrel Pay");
    expect(displayCompanyName("Lumen Logistics Private Limited")).toBe("Lumen Logistics");
    expect(companyKey("Banyan Analytics Technologies Pvt Ltd")).toBe(companyKey("Banyan Analytics"));
    expect(companyKey("Quill Commerce Pvt Ltd")).toBe("quill commerce");
  });

  it("canonicalises Indian city names", () => {
    expect(canonicalCity("Bangalore, Karnataka")).toBe("Bengaluru");
    expect(canonicalCity("Gurgaon, Haryana")).toBe("Gurugram");
    expect(canonicalCity("Remote, India")).toBe("Remote-India");
    expect(canonicalCity("Navi Mumbai")).toBe("Mumbai");
    expect(canonicalCity("Indore, Madhya Pradesh")).toBe("Indore");
    expect(canonicalCity("")).toBeNull();
  });

  it("spots staffing agencies and postings straight from the employer", () => {
    expect(isStaffingAgency("TalentBridge Staffing Solutions")).toBe(true);
    expect(isStaffingAgency("Multi Recruit")).toBe(true);
    expect(isStaffingAgency("Kestrel Pay")).toBe(false);
    expect(isDirectFromCompany("Monsoon Labs", "Monsoon Labs Careers", [])).toBe(true);
    expect(isDirectFromCompany("Acme", "LinkedIn", ["https://boards.greenhouse.io/acme/jobs/1"])).toBe(true);
    expect(isDirectFromCompany("Acme", "LinkedIn", ["https://www.linkedin.com/jobs/view/1"])).toBe(false);
  });
});

describe("parseSalary", () => {
  const lpa = (text: string) => {
    const s = parseSalary(text);
    return s.disclosed ? [s.minAnnual! / 100_000, s.maxAnnual! / 100_000, s.currency] : null;
  };
  it("reads the formats Indian postings use, as annual amounts", () => {
    expect(lpa("8-12 LPA")).toEqual([8, 12, "INR"]);
    expect(lpa("3.5-5 LPA")).toEqual([3.5, 5, "INR"]);
    expect(lpa("₹10,00,000 - ₹16,00,000 a year")).toEqual([10, 16, "INR"]);
    expect(lpa("₹1,20,000 - ₹1,60,000 a month")).toEqual([14.4, 19.2, "INR"]);
    expect(lpa("₹18L – ₹24L a year")).toEqual([18, 24, "INR"]);
    expect(lpa("₹90,000 a month")).toEqual([10.8, 10.8, "INR"]);
    expect(lpa("Salary: 12-15")).toEqual([12, 15, "INR"]);
    expect(parseSalary("$30,000 - $40,000 a year")).toMatchObject({
      minAnnual: 30000,
      maxAnnual: 40000,
      currency: "USD",
    });
  });
  it("treats undisclosed pay as unknown", () => {
    expect(lpa("Not disclosed")).toBeNull();
    expect(lpa("Competitive")).toBeNull();
    expect(lpa("")).toBeNull();
  });
});

describe("experience, seniority and conditions", () => {
  it("reads experience ranges", () => {
    expect(parseExperience("Experience: 2-4 years.")).toEqual({ min: 2, max: 4 });
    expect(parseExperience("3+ yrs of React")).toEqual({ min: 3, max: null });
    expect(parseExperience("minimum 5 years in frontend")).toEqual({ min: 5, max: null });
    expect(parseExperience("We value curiosity")).toEqual({ min: null, max: null });
  });
  it("derives seniority from the title, then the experience", () => {
    expect(seniorityFromPosting("Senior Frontend Engineer", { min: 3, max: 5 })).toBe("senior");
    expect(seniorityFromPosting("Principal Frontend Architect", { min: null, max: null })).toBe("lead");
    expect(seniorityFromPosting("SDE 2 - Frontend", { min: 3, max: 5 })).toBe("mid");
    expect(seniorityFromPosting("Frontend Intern", { min: 0, max: null })).toBe("intern");
  });
  it("finds dealbreaker conditions", () => {
    expect(parseConditions("Immediate joiners preferred. Notice period up to 30 days.")).toMatchObject({
      noticePeriodMaxDays: 30,
      immediateJoiner: true,
    });
    expect(parseConditions("Service bond of 18 months applies.").bond).toBe(true);
    expect(parseConditions("Rotational night shifts to support US clients.").shift).toBe("night");
    expect(parseConditions("Contract to hire for a leading client. 5 days work from office.")).toMatchObject({
      contractToHire: true,
      wfoDaysPerWeek: 5,
    });
    expect(parseConditions("Hybrid: 3 days a week in the office.").wfoDaysPerWeek).toBe(3);
  });
});

describe("dedupe", () => {
  const key = (over: Partial<DedupeKey>): DedupeKey => ({
    provider: "adzuna",
    externalId: "1",
    companyKey: "kestrel pay",
    city: "Bengaluru",
    title: "React Developer",
    descriptionHash: "a",
    postedAt: NOW,
    ...over,
  });
  it("treats title spellings as the same job at the same company and city", () => {
    expect(titleKey("React.js Developer")).toBe(titleKey("ReactJS Developer"));
    expect(titleKey("SDE II - Frontend")).toBe(titleKey("SDE 2 - Frontend"));
    expect(
      isSameJob(
        key({}),
        key({ provider: "jooble", externalId: "9", title: "React JS Developer", descriptionHash: "b" }),
      ),
    ).toBe(true);
    expect(isSameJob(key({}), key({ provider: "jooble", externalId: "9", city: "Pune", descriptionHash: "b" }))).toBe(
      false,
    );
    expect(isSameJob(key({}), key({ externalId: "9", title: "Senior React Developer", descriptionHash: "b" }))).toBe(
      false,
    );
    expect(isSameJob(key({}), key({ externalId: "9", companyKey: "other", descriptionHash: "a" }))).toBe(true);
  });
  it("keeps every apply link once", () => {
    expect(
      mergeApplyLinks(
        [{ site: "A", url: "https://a.example/j/1?ref=x" }],
        [
          { site: "A2", url: "https://a.example/j/1/" },
          { site: "B", url: "https://b.example/1" },
        ],
      ),
    ).toEqual([
      { site: "A", url: "https://a.example/j/1?ref=x" },
      { site: "B", url: "https://b.example/1" },
    ]);
  });
});

describe("prepareJob on the mock postings", () => {
  it("cleans every fictional posting", () => {
    const prepared = mockPostings(NOW).map((p) => prepareJob(p, NOW));
    const first = prepared.find((p) => p.externalId === "mock-1")!;
    expect(first).toMatchObject({
      companyName: "Kestrel Pay",
      city: "Bengaluru",
      workMode: "hybrid",
      salaryMinAnnual: 1_000_000,
      salaryMaxAnnual: 1_600_000,
      salaryDisclosed: true,
      expMinYears: 2,
      expMaxYears: 4,
      isDirectFromCompany: true,
      isStale: false,
    });
    expect(prepared.find((p) => p.externalId === "mock-26")!.isStale).toBe(true); // posted 35 days ago
    expect(prepared.find((p) => p.externalId === "mock-16")!).toMatchObject({
      isStaffing: true,
      conditions: expect.objectContaining({ contractToHire: true }),
    });
    expect(prepared.every((p) => p.descriptionHash.length === 32)).toBe(true);
  });
});

describe("relevance (quick match)", () => {
  const profile: RankingProfile = {
    years: 5.3,
    skills: [
      { name: "React", proficiency: 4 },
      { name: "TypeScript", proficiency: 3 },
      { name: "Redux", proficiency: 3 },
      { name: "REST APIs", proficiency: 3 },
    ],
    titleVariants: ["React Developer", "Frontend Engineer"],
    locations: ["Bengaluru", "Remote-India"],
    workModes: ["hybrid", "remote"],
    openToRelocate: false,
    expectedSalaryMin: 1_800_000,
    noticePeriodDays: 60,
    dealbreakers: { bond: true, nightShift: true, contractToHire: false, maxWfoDaysPerWeek: 3 },
  };
  const catalogue = ["React", "TypeScript", "Redux", "REST APIs", "GraphQL", "Node.js", "Java", "Kafka"];
  const job = (over: Partial<RankingJob>): RankingJob => ({
    title: "React Developer",
    description: "Build apps in React, TypeScript and Redux with REST APIs.",
    city: "Bengaluru",
    workMode: "hybrid",
    salaryMinAnnual: 1_500_000,
    salaryMaxAnnual: 2_200_000,
    salaryDisclosed: true,
    salaryCurrency: "INR",
    expMinYears: 4,
    expMaxYears: 7,
    seniority: "senior",
    conditions: {
      noticePeriodMaxDays: null,
      immediateJoiner: false,
      bond: false,
      shift: null,
      contractToHire: false,
      wfoDaysPerWeek: 3,
    },
    semantic: 0.82,
    ...over,
  });

  it("scores a close match high, with a reason for every part", () => {
    const r = scoreJob(job({}), profile, catalogue);
    expect(r.score).toBeGreaterThanOrEqual(90);
    expect(r.parts.map((p) => p.key)).toEqual(["skills", "semantic", "title", "experience", "location", "salary"]);
    expect(r.parts.every((p) => p.reason.length > 5)).toBe(true);
    expect(r.notFit).toEqual([]);
  });

  it("scores an unrelated job low and spreads the semantic weight when it is missing", () => {
    const java = scoreJob(
      job({ title: "Java Backend Engineer", description: "Java, Kafka and Spring.", semantic: 0.58, city: "Pune" }),
      profile,
      catalogue,
    );
    expect(java.score).toBeLessThan(45);
    const pending = scoreJob(job({ semantic: null }), profile, catalogue);
    expect(pending.parts.find((p) => p.key === "semantic")).toMatchObject({ value: null, weight: 0 });
    expect(pending.parts.reduce((s, p) => s + p.weight, 0)).toBeCloseTo(100, 0);
  });

  it("explains why a job is not a fit, without changing its score", () => {
    const strict = job({
      expMinYears: 10,
      expMaxYears: null,
      city: "Pune",
      conditions: {
        noticePeriodMaxDays: 15,
        immediateJoiner: true,
        bond: true,
        shift: "night",
        contractToHire: false,
        wfoDaysPerWeek: 5,
      },
    });
    expect(scoreJob(strict, profile, catalogue).notFit).toEqual([
      "Asks 10+ years; you have 5.3.",
      "In Pune, outside your locations.",
      "Service bond.",
      "Night or rotational shifts.",
      "Office 5 days a week (you accept 3).",
      "Wants joiners within 15 days; your notice is 60.",
    ]);
  });

  it("learns from dismiss reasons: tighter seniority margins and a penalty for dismissed companies", () => {
    const senior = job({ expMinYears: 8, expMaxYears: 12 });
    // 8 years asked vs 5.3 held: inside the default margin of 4, outside a learned margin of 2.
    expect(scoreJob(senior, profile, catalogue).notFit).toEqual([]);
    expect(scoreJob(senior, { ...profile, aboveYearsMargin: 2 }, catalogue).notFit).toEqual([
      "Asks 8+ years; you have 5.3.",
    ]);
    const junior = job({ expMinYears: 0, expMaxYears: 2 });
    expect(scoreJob(junior, profile, catalogue).notFit).toEqual([]);
    expect(scoreJob(junior, { ...profile, belowYearsMargin: 3 }, catalogue).notFit).toEqual([
      "For up to 2 years of experience.",
    ]);

    const plain = scoreJob(job({}), profile, catalogue);
    const dismissed = scoreJob(job({ companyDismissed: true }), profile, catalogue);
    expect(plain.adjustments).toEqual([]);
    expect(dismissed.adjustments).toEqual([
      { points: -DISMISSED_COMPANY_PENALTY, reason: "You dismissed jobs from this company before." },
    ]);
    expect(dismissed.score).toBe(plain.score - DISMISSED_COMPANY_PENALTY);
  });
});

describe("search plan", () => {
  const roles = [
    { id: "r1", titleVariants: ["React Developer", "Frontend Engineer", "UI Developer"] },
    { id: "r2", titleVariants: ["Next.js Developer", "React Developer"] },
  ];
  it("interleaves roles and locations, merges repeated queries and marks the first ones as priority", () => {
    const plan = buildSearchPlan({
      roles,
      locations: ["Bengaluru", "Remote-India"],
      wantsRemote: false,
      maxQueries: 8,
      priorityCount: 2,
      countryName: "India",
    });
    expect(plan.map((q) => `${q.query}@${q.location}`)).toEqual([
      "React Developer@Bengaluru",
      "Next.js Developer@Bengaluru",
      "React Developer@Remote",
      "Next.js Developer@Remote",
      "Frontend Engineer@Bengaluru",
      "Frontend Engineer@Remote",
      "UI Developer@Bengaluru",
      "UI Developer@Remote",
    ]);
    expect(plan.filter((q) => q.priority)).toHaveLength(2);
    // The second role's "React Developer" is the first role's query, so it is searched once for both.
    expect(plan[0].roleIds).toEqual(["r1", "r2"]);
  });
  it("searches the whole country when no location is set, and respects the cap", () => {
    const plan = buildSearchPlan({
      roles,
      locations: [],
      wantsRemote: false,
      maxQueries: 3,
      priorityCount: 2,
      countryName: "India",
    });
    expect(plan).toHaveLength(3);
    expect(plan.every((q) => q.location === "India")).toBe(true);
  });
});
