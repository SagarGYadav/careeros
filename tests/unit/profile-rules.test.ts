import { describe, expect, it } from "vitest";
import { syncBulletEvidence } from "@/lib/cv/finalize";
import { parseCtcToAnnualInr, parseNoticePeriodDays, splitPreferredLocations } from "@/lib/cv/job-search";
import { skillUsage, suggestProficiency } from "@/lib/cv/proficiency";
import type { CvDraft, EvidenceItem } from "@/lib/cv/schema";

const NOW = new Date("2026-10-09T10:00:00Z");

const role = (over: Partial<CvDraft["experience"][number]>): CvDraft["experience"][number] => ({
  company: "Acme",
  title: "Engineer",
  employmentType: "full_time",
  location: null,
  workMode: null,
  startDate: "2022-01",
  endDate: null,
  isCurrent: true,
  durationMonths: null,
  domain: null,
  teamSize: null,
  bullets: [],
  technologies: [],
  technologiesEvidenceId: null,
  sourceQuote: "",
  ...over,
});

describe("skill usage and suggested proficiency", () => {
  const draft = {
    experience: [
      role({ technologies: ["Next.js", "Node.js"] }),
      role({
        company: "Old Co",
        startDate: "2018-01",
        endDate: "2020-12",
        isCurrent: false,
        bullets: [{ id: "E1", text: "Built dashboards in React and D3.js.", kind: "achievement", hasMetric: false }],
      }),
    ],
    projects: [],
  };

  it("counts roles that name the skill, and roles where an implying skill is used", () => {
    expect(skillUsage(draft, "React", true, NOW)).toMatchObject({ roles: 1, months: 36, lastUsedYear: 2020, via: [] });
    const withNext = skillUsage(draft, "React", true, NOW, ["Next.js"]);
    // Jan 2018 – Dec 2020 (36) + Jan 2022 – Oct 2026 (58) = 94 months.
    expect(withNext).toMatchObject({ roles: 2, months: 94, lastUsedYear: 2026, via: ["Next.js"] });
  });

  it("suggests a level from years, breadth and recency, and explains it", () => {
    const usage = { months: 94, lastUsedYear: 2026, roles: 2, projects: 1, listed: true, via: ["Next.js"] };
    expect(suggestProficiency(usage, 2026)).toEqual({
      level: 5,
      reason: "Used for 7.8 years in 2 roles, 1 project, counting work with Next.js, last used in 2026.",
    });
    expect(suggestProficiency({ ...usage, lastUsedYear: 2021, projects: 0 }, 2026).level).toBe(3);
    expect(
      suggestProficiency({ months: 0, lastUsedYear: null, roles: 0, projects: 0, listed: true, via: [] }, 2026),
    ).toEqual({ level: 2, reason: "Listed in the skills section only." });
    expect(
      suggestProficiency({ months: 8, lastUsedYear: 2026, roles: 1, projects: 0, listed: false, via: [] }, 2026).level,
    ).toBe(1);
  });
});

describe("job-search details written in a CV", () => {
  it("parses CTC in the ways Indian CVs write it", () => {
    expect(parseCtcToAnnualInr("8.5 LPA")).toBe(850_000);
    expect(parseCtcToAnnualInr("12 Lakhs")).toBe(1_200_000);
    expect(parseCtcToAnnualInr("₹8,50,000")).toBe(850_000);
    expect(parseCtcToAnnualInr("8-12 LPA")).toBe(800_000);
    expect(parseCtcToAnnualInr("70k per month")).toBe(840_000);
    expect(parseCtcToAnnualInr("negotiable")).toBeNull();
  });

  it("parses notice periods and splits work modes from places", () => {
    expect(parseNoticePeriodDays("60 days")).toBe(60);
    expect(parseNoticePeriodDays("2 months")).toBe(60);
    expect(parseNoticePeriodDays("Immediate joiner")).toBe(0);
    expect(parseNoticePeriodDays("soon")).toBeNull();
    expect(splitPreferredLocations(["Gurugram", "Noida", "Remote"])).toEqual({
      locations: ["Gurugram", "Noida"],
      workModes: ["remote"],
    });
  });
});

describe("evidence ids after a profile edit", () => {
  const evidence: EvidenceItem[] = [
    { id: "E1", kind: "experience_bullet", text: "Built A.", section: "experience", entry: 0, page: 1, grounded: true },
    { id: "E2", kind: "experience_bullet", text: "Built B.", section: "experience", entry: 0, page: 1, grounded: true },
    { id: "E3", kind: "certification", text: "AWS", section: "certifications", entry: 0, page: 1, grounded: true },
  ];

  it("keeps ids of kept bullets, gives new bullets the next free id and drops removed ones", () => {
    const entries = [
      {
        bullets: [
          { id: "E2", text: "Built B, faster." },
          { id: "", text: "Shipped C." },
        ],
      },
    ];
    const synced = syncBulletEvidence(evidence, entries, "experience_bullet", (t) => t === "Shipped C.");
    expect(entries[0].bullets.map((b) => b.id)).toEqual(["E2", "E4"]);
    expect(synced.map((e) => [e.id, e.text, e.grounded])).toEqual([
      ["E2", "Built B, faster.", false],
      ["E3", "AWS", true],
      ["E4", "Shipped C.", true],
    ]);
  });
});
