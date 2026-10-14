import { describe, expect, it } from "vitest";
import { hasActiveFilters, parseFeedQuery, topGap, topReasons } from "@/lib/jobs/feed";
import type { ScorePart } from "@/lib/jobs/relevance";
import { onboardingChecklist } from "@/lib/onboarding";

describe("feed URL filters", () => {
  it("defaults to the For you group, page 1 and no filters", () => {
    const q = parseFeedQuery({});
    expect(q).toEqual({ page: 1, filters: expect.objectContaining({ group: "for_you", directOnly: false }) });
    expect(hasActiveFilters(q.filters)).toBe(false);
  });

  it("reads valid values, converts LPA to annual rupees and takes the first of repeated params", () => {
    const q = parseFeedQuery({
      group: "not_fit",
      role: "role-1",
      city: ["Bengaluru", "Pune"],
      mode: "remote",
      posted: "7",
      source: "adzuna",
      direct: "1",
      salary: "20",
      page: "3",
    });
    expect(q).toEqual({
      page: 3,
      filters: {
        group: "not_fit",
        roleId: "role-1",
        city: "Bengaluru",
        workMode: "remote",
        postedWithinDays: 7,
        provider: "adzuna",
        directOnly: true,
        analysedOnly: false,
        salaryMinAnnual: 2_000_000,
      },
    });
    expect(hasActiveFilters(q.filters)).toBe(true);
  });

  it("drops invalid values instead of failing the page", () => {
    const q = parseFeedQuery({
      group: "everything",
      mode: "moon",
      posted: "5",
      salary: "-3",
      page: "zero",
      direct: "yes",
    });
    expect(q.page).toBe(1);
    expect(q.filters).toMatchObject({ group: "for_you", directOnly: false });
    expect(q.filters.workMode).toBeUndefined();
    expect(q.filters.postedWithinDays).toBeUndefined();
    expect(q.filters.salaryMinAnnual).toBeUndefined();
  });
});

describe("card reasons", () => {
  const part = (
    key: ScorePart["key"],
    weight: number,
    value: number | null,
    reason: string,
    neutral = false,
  ): ScorePart => ({
    key,
    weight,
    value,
    points: value === null ? 0 : weight * value,
    reason,
    ...(neutral && { neutral }),
  });
  const parts = [
    part("skills", 30, 0.9, "You have 9 of 10 skills."),
    part("semantic", 20, 0.4, "The description is a weak match."),
    part("title", 20, 1, "Title matches React Developer."),
    part("experience", 15, 0.8, "Asks 4–7 years; you have 5."),
    part("location", 10, 1, "In Bengaluru."),
    part("salary", 5, 0.5, "Salary not disclosed.", true),
  ];

  it("shows the three parts that add the most, skipping neutral and weak ones", () => {
    expect(topReasons(parts)).toEqual([
      "You have 9 of 10 skills.",
      "Title matches React Developer.",
      "Asks 4–7 years; you have 5.",
    ]);
  });

  it("shows the weak part that lost the most points as the gap, or nothing when none is weak", () => {
    expect(topGap(parts)).toBe("The description is a weak match.");
    expect(topGap(parts.filter((p) => p.key !== "semantic"))).toBeNull();
  });
});

describe("onboarding checklist", () => {
  it("ticks steps from the data, in order", () => {
    const steps = onboardingChecklist({
      hasCv: true,
      hasPreferences: false,
      hasSelectedRole: true,
      hasSearched: false,
      hasOpenedFeed: false,
    });
    expect(steps.map((s) => [s.id, s.done])).toEqual([
      ["hasCv", true],
      ["hasPreferences", false],
      ["hasSelectedRole", true],
      ["hasSearched", false],
      ["hasOpenedFeed", false],
    ]);
    expect(steps.every((s) => s.href.startsWith("/"))).toBe(true);
  });
});
