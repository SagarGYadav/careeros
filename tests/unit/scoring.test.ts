import { describe, expect, it } from "vitest";
import { NO_CONDITIONS } from "@/lib/jobs/conditions";
import { DEFAULT_SCORING_CONFIG, readScoringConfig, scoringSettingsSchema } from "@/lib/scoring/config";
import { assessSkill, recommend, scoreFit, type FitJob, type FitProfile, type FitRequirement } from "@/lib/scoring/fit";
import { salaryContext } from "@/lib/scoring/salary-context";

const profile = (over: Partial<FitProfile> = {}): FitProfile => ({
  years: 5,
  skills: new Map([
    ["react", { name: "React", proficiency: 4, years: 5 }],
    ["ts", { name: "TypeScript", proficiency: 3, years: 3 }],
    ["redux", { name: "Redux", proficiency: 3, years: 3 }],
    ["css", { name: "CSS", proficiency: 2, years: 5 }],
  ]),
  implies: new Map([["react", ["nextjs"]]]),
  related: new Map([
    ["zustand", ["redux"]],
    ["redux", ["zustand"]],
  ]),
  targetFamilyIds: ["fe"],
  adjacentFamilyIds: ["fs"],
  targetTitles: ["Frontend Developer", "UI Engineer"],
  locations: ["Bengaluru", "Remote-India"],
  workModes: ["hybrid", "remote"],
  openToRelocate: false,
  expectedSalaryMin: 1_800_000,
  noticePeriodDays: 30,
  dealbreakers: { bond: false, nightShift: false, contractToHire: false, maxWfoDaysPerWeek: null },
  ...over,
});

const job = (over: Partial<FitJob> = {}): FitJob => ({
  title: "Frontend Engineer",
  roleFamilyId: "fe",
  expMinYears: 4,
  expMaxYears: 7,
  city: "Bengaluru",
  workMode: "hybrid",
  salaryMinAnnual: 2_000_000,
  salaryMaxAnnual: 3_000_000,
  salaryDisclosed: true,
  conditions: NO_CONDITIONS,
  ...over,
});

const req = (
  reqId: string,
  skillId: string | null,
  skillName: string,
  importance: FitRequirement["importance"] = "required",
  yearsRequired: number | null = null,
): FitRequirement => ({ reqId, kind: "skill", importance, skillId, skillName, yearsRequired, text: skillName });

const BOTH = [req("R1", "react", "React"), req("R2", "ts", "TypeScript")];
const component = (score: ReturnType<typeof scoreFit>, key: string) => score.components.find((c) => c.key === key)!;
const score = (j: Partial<FitJob> = {}, p: Partial<FitProfile> = {}, reqs = BOTH) =>
  scoreFit(reqs, job(j), profile(p), DEFAULT_SCORING_CONFIG);

describe("skill requirements", () => {
  it("counts a skill directly, through a skill that implies it, or half for a related one", () => {
    expect(assessSkill(req("R1", "react", "React"), profile())).toMatchObject({ status: "strong", via: "direct" });
    expect(assessSkill(req("R1", "css", "CSS"), profile())).toMatchObject({ status: "partial", match: 0.5 });
    const viaNext = profile({ skills: new Map([["nextjs", { name: "Next.js", proficiency: 4, years: 2 }]]) });
    expect(assessSkill(req("R1", "react", "React"), viaNext)).toMatchObject({
      status: "strong",
      via: "implied",
      reason: "Next.js (level 4) implies React.",
    });
    expect(assessSkill(req("R1", "zustand", "Zustand"), profile())).toMatchObject({
      status: "partial",
      via: "related",
      reason: "Related: Redux (level 3).",
    });
    expect(assessSkill(req("R1", null, "Kubernetes"), profile())).toMatchObject({ status: "missing", match: 0 });
  });

  it("drops one level when the user has fewer years with the skill than asked", () => {
    expect(assessSkill(req("R1", "react", "React", "required", 6), profile())).toMatchObject({
      status: "partial",
      reason: "React at level 4, 5 of 6 years asked.",
    });
    expect(assessSkill(req("R1", "react", "React", "required", 4), profile())).toMatchObject({ status: "strong" });
  });
});

describe("Fit score", () => {
  it("gives a full match every point, recommends applying and suggests no gains", () => {
    const s = score();
    expect(s.total).toBe(100);
    expect(s.components.map((c) => [c.key, Math.round(c.points)])).toEqual([
      ["skills", 45],
      ["experience", 20],
      ["roleAlignment", 15],
      ["location", 10],
      ["salary", 10],
    ]);
    expect(s).toMatchObject({ recommendation: "APPLY", blockers: [], gains: [] });
  });

  it("scores experience by the gap to the asked range", () => {
    const points = (j: Partial<FitJob>) => component(score(j), "experience").points;
    expect(points({ expMinYears: 6, expMaxYears: null })).toBe(12);
    expect(points({ expMinYears: 7, expMaxYears: null })).toBe(6);
    expect(points({ expMinYears: 8, expMaxYears: null })).toBe(0);
    expect(points({ expMinYears: 0, expMaxYears: 1 })).toBe(14);
    expect(component(score({ expMinYears: null, expMaxYears: null }), "experience")).toMatchObject({
      points: 14,
      flagged: true,
    });
  });

  it("scores role alignment, location and salary as specified", () => {
    expect(component(score({ roleFamilyId: "fs" }), "roleAlignment").points).toBe(8);
    expect(component(score({ roleFamilyId: "data" }), "roleAlignment").points).toBe(0);
    expect(component(score({ roleFamilyId: null, title: "Frontend Developer" }), "roleAlignment").points).toBe(15);
    expect(component(score({}, { targetFamilyIds: [], targetTitles: [] }), "roleAlignment").flagged).toBe(true);

    expect(component(score({ city: "Pune" }), "location").points).toBe(0);
    expect(component(score({ city: "Pune" }, { openToRelocate: true }), "location").points).toBe(5);
    expect(component(score({ workMode: "onsite" }), "location").points).toBe(5);
    expect(component(score({ city: "Remote-India", workMode: "remote" }), "location").points).toBe(10);
    expect(component(score({ city: null, workMode: null }), "location")).toMatchObject({ points: 6, flagged: true });

    expect(component(score({ salaryMaxAnnual: 1_700_000, salaryMinAnnual: null }), "salary").points).toBe(5);
    expect(component(score({ salaryMaxAnnual: 1_000_000, salaryMinAnnual: null }), "salary").points).toBe(0);
    expect(component(score({ salaryDisclosed: false }), "salary")).toMatchObject({ points: 6, flagged: true });
    expect(component(score({}, { expectedSalaryMin: null }), "salary").flagged).toBe(true);
  });

  it("weights skills by importance and explains the counts", () => {
    const s = score({}, {}, [req("R1", "react", "React"), req("R2", "go", "Go"), req("R3", "css", "CSS", "preferred")]);
    // (3×1 + 3×0 + 1.5×0.5) / 7.5 × 45 = 22.5
    expect(component(s, "skills")).toMatchObject({
      points: 22.5,
      reason: "1 strong, 1 partial, 1 missing of 3 skills (required: 1 of 2 strong).",
    });
  });

  it("finds blockers: far too senior, two missing must-haves, notice period and dealbreakers", () => {
    expect(score({ expMinYears: 8, expMaxYears: null }).blockers).toEqual([
      { kind: "experience", message: "Asks 8+ years; you have 5." },
    ]);
    expect(score({}, {}, [req("R1", "go", "Go"), req("R2", null, "Kubernetes")]).blockers).toEqual([
      { kind: "skills", message: "Missing 2 required skills: Go, Kubernetes." },
    ]);
    const strict = score(
      { conditions: { ...NO_CONDITIONS, noticePeriodMaxDays: 15, bond: true } },
      {
        dealbreakers: { bond: true, nightShift: false, contractToHire: false, maxWfoDaysPerWeek: null },
      },
    );
    expect(strict.blockers.map((b) => b.kind)).toEqual(["notice", "dealbreaker"]);
    expect(strict.recommendation).toBe("LOW_PRIORITY");
    const bondOnly = score({ conditions: { ...NO_CONDITIONS, bond: true } });
    expect(bondOnly.conditions).toEqual([{ key: "bond", status: "warning", message: "Service bond." }]);
    expect(bondOnly.blockers).toEqual([]);
  });

  it("recommends by threshold, with a blocker costing one level", () => {
    const c = DEFAULT_SCORING_CONFIG;
    expect(recommend(72, 0, c)).toBe("APPLY");
    expect(recommend(72, 1, c)).toBe("CONSIDER");
    expect(recommend(71, 0, c)).toBe("CONSIDER");
    expect(recommend(55, 0, c)).toBe("CONSIDER");
    expect(recommend(60, 1, c)).toBe("LOW_PRIORITY");
    expect(recommend(54, 0, c)).toBe("LOW_PRIORITY");
    expect(recommend(90, 2, c)).toBe("LOW_PRIORITY");
  });

  it("shows how much each missing skill would add at level 3", () => {
    const s = score({}, {}, [req("R1", "react", "React"), req("R2", "go", "Go"), req("R3", "go", "Go", "preferred")]);
    // Skills now: 3 of 7.5 weight → 18 points; with Go at level 3: 7.5 of 7.5 → 45.
    expect(s.gains).toEqual([{ skillName: "Go", reqIds: ["R2", "R3"], points: 27 }]);
  });
});

describe("scoring settings", () => {
  it("accepts parts that add up to 100 with Consider below Apply", () => {
    const ok = {
      weights: { skills: 60, experience: 10, roleAlignment: 10, location: 10, salary: 10 },
      thresholds: { apply: 75, consider: 50 },
    };
    expect(scoringSettingsSchema.safeParse(ok).success).toBe(true);
    const bad = scoringSettingsSchema.safeParse({ ...ok, weights: { ...ok.weights, skills: 59 } });
    expect(bad.error?.issues[0].message).toBe("The parts must add up to 100.");
    const inverted = scoringSettingsSchema.safeParse({ ...ok, thresholds: { apply: 50, consider: 60 } });
    expect(inverted.error?.issues[0].message).toBe("“Consider” must be lower than “Apply”.");
  });

  it("scales every component to the configured maximum and falls back to defaults on bad data", () => {
    const config = readScoringConfig({
      version: 3,
      weights: { skills: 60, experience: 10, roleAlignment: 10, location: 10, salary: 10 },
      thresholds: { apply: 75, consider: 50 },
    });
    expect(config.version).toBe(3);
    const s = scoreFit(BOTH, job({ expMinYears: 6, expMaxYears: null }), profile(), config);
    expect(component(s, "experience")).toMatchObject({ max: 10, points: 6 });
    expect(s.total).toBe(96);
    expect(readScoringConfig({ version: 4, weights: { skills: 5 }, thresholds: {} })).toBe(DEFAULT_SCORING_CONFIG);
  });
});

describe("salary context", () => {
  it("needs at least five disclosed salaries and uses each job's mid-point", () => {
    const four = [1, 2, 3, 4].map((l) => ({ min: l * 1e6, max: l * 1e6 }));
    expect(salaryContext(four)).toBeNull();
    expect(
      salaryContext([
        ...four,
        { min: 1_000_000, max: 3_000_000 },
        { min: null, max: 2_500_000 },
        { min: null, max: null },
      ]),
    ).toEqual({ n: 6, min: 1_000_000, median: 2_250_000, max: 4_000_000 });
  });
});
