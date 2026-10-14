import { MockLanguageModelV4 } from "ai/test";
import { describe, expect, it } from "vitest";
import { createAiRunner } from "@/lib/ai/runner";
import type { AiProvider } from "@/lib/ai/types";
import { atsKeywordCheck, reportConfidence } from "@/lib/fit-report/calc";
import { buildStats, type AnalystInput } from "@/lib/fit-report/context";
import { deterministicFitReport } from "@/lib/fit-report/deterministic";
import type { FitReport } from "@/lib/fit-report/schema";
import { validateFitReport } from "@/lib/fit-report/validate";
import { NO_CONDITIONS } from "@/lib/jobs/conditions";
import { MemoryProviderStore } from "@/lib/providers/memory-store";
import { DEFAULT_SCORING_CONFIG } from "@/lib/scoring/config";
import { scoreFit } from "@/lib/scoring/fit";
import { writeFitReport } from "@/server/ai/fit-analyst";

// A fictional candidate and job, small enough to read.
const score = scoreFit(
  [
    {
      reqId: "R1",
      kind: "skill",
      importance: "required",
      skillId: "react",
      skillName: "React",
      yearsRequired: null,
      text: "React",
    },
    {
      reqId: "R2",
      kind: "skill",
      importance: "required",
      skillId: "gql",
      skillName: "GraphQL",
      yearsRequired: null,
      text: "GraphQL",
    },
    {
      reqId: "R3",
      kind: "education",
      importance: "required",
      skillId: null,
      skillName: null,
      yearsRequired: null,
      text: "Bachelor's degree",
    },
  ],
  {
    title: "Frontend Engineer",
    roleFamilyId: "fe",
    expMinYears: 4,
    expMaxYears: 7,
    city: "Bengaluru",
    workMode: "hybrid",
    salaryMinAnnual: 2_000_000,
    salaryMaxAnnual: 3_000_000,
    salaryDisclosed: true,
    conditions: { ...NO_CONDITIONS, noticePeriodMaxDays: 30 },
  },
  {
    years: 5.3,
    skills: new Map([["react", { name: "React", proficiency: 4, years: 5 }]]),
    implies: new Map(),
    related: new Map(),
    targetFamilyIds: ["fe"],
    adjacentFamilyIds: [],
    targetTitles: [],
    locations: ["Bengaluru"],
    workModes: ["hybrid"],
    openToRelocate: false,
    expectedSalaryMin: 1_800_000,
    noticePeriodDays: 60,
    dealbreakers: { bond: false, nightShift: false, contractToHire: false, maxWfoDaysPerWeek: null },
  },
  DEFAULT_SCORING_CONFIG,
);
const { stats, blockerStatIds } = buildStats({
  score,
  years: 5.3,
  job: { expMinYears: 4, expMaxYears: 7, salaryMin: 2_000_000, salaryMax: 3_000_000, salaryDisclosed: true },
  expectedSalaryMin: 1_800_000,
  noticePeriodDays: 60,
  salaryContext: null,
});
const assessed = new Map(score.requirements.map((r) => [r.reqId, r]));
const input: AnalystInput = {
  job: {
    title: "Frontend Engineer",
    company: "Kestrel Pay",
    seniority: "mid",
    domain: "payments",
    responsibilities: ["Build the merchant dashboard in React"],
  },
  requirements: [
    {
      reqId: "R1",
      text: "React",
      kind: "skill",
      importance: "required",
      quote: "Strong React",
      evidenceIds: ["E1"],
      learningEffort: 2,
    },
    {
      reqId: "R2",
      text: "GraphQL",
      kind: "skill",
      importance: "required",
      quote: "GraphQL APIs",
      evidenceIds: [],
      learningEffort: 1,
    },
    {
      reqId: "R3",
      text: "Bachelor's degree",
      kind: "education",
      importance: "required",
      quote: "Bachelor's degree in CS",
      evidenceIds: [],
      learningEffort: null,
    },
  ].map((r) => ({
    ...r,
    held: r.reqId === "R1",
    codeStatus: assessed.get(r.reqId)!.status,
    codeReason: assessed.get(r.reqId)!.reason,
  })),
  evidence: [
    { id: "E1", text: "Built the merchant dashboard in React for 1,200 merchants", section: "experience" },
    { id: "E2", text: "Designed Apollo client caching for the orders API", section: "experience" },
    { id: "E3", text: "B.Tech in Computer Science, 2019", section: "education" },
  ],
  stats,
  recommendation: score.recommendation,
  blockerStatIds,
  matches: [{ responsibility: "Build the merchant dashboard in React", evidenceId: "E1", similarity: 0.82 }],
};

const good = (): FitReport => deterministicFitReport(input);
const paths = (report: FitReport) => validateFitReport(report, input).issues.map((i) => i.path);
const messages = (report: FitReport) => validateFitReport(report, input).issues.map((i) => i.message);

describe("computed stats for the report", () => {
  it("numbers every computed value and gives blockers their own stats", () => {
    expect(score.recommendation).toBe("CONSIDER"); // a high score with one blocker
    expect(stats[0]).toMatchObject({ id: "S1", values: [score.total, 100] });
    expect(stats.find((s) => s.text.startsWith("Your experience"))).toMatchObject({ values: [5.3, 5] });
    expect(stats.find((s) => s.text.startsWith("Disclosed salary"))).toMatchObject({ values: [20, 30] });
    // GraphQL missing is only one required skill; the notice period (60 vs 30) is the blocker.
    expect(blockerStatIds.map((id) => stats.find((s) => s.id === id)!.text)).toEqual([
      "Blocker: Wants joiners within 30 days; your notice is 60 days.",
    ]);
  });
});

describe("Fit Report validator", () => {
  it("passes the report written from code data", () => {
    expect(validateFitReport(good(), input)).toEqual({ passed: true, issues: [], acceptedSemanticMatches: [] });
  });

  it("rejects unknown ids, invented numbers and quotes that aren't in the CV", () => {
    const r = good();
    r.summary = { text: "You led a team of 12 engineers.", evidenceIds: ["E1", "E9"], requirementIds: [], statIds: [] };
    expect(messages(r)).toEqual([
      "Unknown ids: E9.",
      "Numbers not backed by a cited stat, CV line or requirement: 12.",
    ]);
    r.summary = { text: "Your score is 64 of 100.", evidenceIds: [], requirementIds: [], statIds: [] };
    expect(messages(r)[0]).toMatch(/Numbers not backed/);
    r.summary = {
      text: `You "built dashboards for 5,000 merchants" in React.`,
      evidenceIds: ["E1"],
      requirementIds: [],
      statIds: [],
    };
    expect(messages(r)[0]).toBe(
      "Quoted text not found in the CV or the posting: “built dashboards for 5,000 merchants”.",
    );
    r.summary = {
      text: `You "built the merchant dashboard in React for 1,200 merchants".`,
      evidenceIds: ["E1"],
      requirementIds: [],
      statIds: [],
    };
    expect(validateFitReport(r, input).passed).toBe(true);
  });

  it("accepts numbers from a cited requirement's computed reason", () => {
    const r = good();
    const reason = input.requirements[0].codeReason; // e.g. "React at level 4."
    const level = reason.match(/level (\d)/)![1];
    r.experienceRelevance.domainAndScale = {
      text: `Your React is at level ${level}.`,
      evidenceIds: [],
      requirementIds: [],
      statIds: [],
    };
    expect(messages(r)).toEqual([`Numbers not backed by a cited stat, CV line or requirement: ${level}.`]);
    r.experienceRelevance.domainAndScale.requirementIds = ["R1"];
    expect(validateFitReport(r, input).passed).toBe(true);
  });

  it("wants numbers and names in the text, not the ids it cites", () => {
    const r = good();
    r.summary = { text: "Your fit score is S1.", evidenceIds: [], requirementIds: [], statIds: ["S1"] };
    expect(messages(r)).toEqual(["Write the number or name instead of the id in the text (S1)."]);
    r.summary = {
      text: `Your fit score is ${score.total} of 100; you also know AWS S3.`,
      evidenceIds: [],
      requirementIds: [],
      statIds: ["S1"],
    };
    expect(validateFitReport(r, input).passed).toBe(true);
  });

  it("needs every required requirement, with the code's status unless a semantic match is shown", () => {
    const r = good();
    r.requirements = r.requirements.filter((a) => a.reqId !== "R3");
    expect(messages(r)).toEqual(["Required requirement R3 (Bachelor's degree) is not assessed."]);

    const agreeing = good();
    agreeing.requirements[0] = { ...agreeing.requirements[0], semanticMatch: true };
    expect(validateFitReport(agreeing, input).passed).toBe(true);

    const changed = good();
    changed.requirements[0] = { ...changed.requirements[0], status: "partial" };
    expect(messages(changed)).toEqual(["R1 is strong by CareerOS's calculation, not partial."]);

    const semantic = good();
    semantic.requirements[1] = {
      reqId: "R2",
      status: "partial",
      semanticMatch: true,
      evidenceIds: ["E2"],
      statIds: [],
      note: "Apollo client is GraphQL.",
    };
    expect(validateFitReport(semantic, input)).toMatchObject({ passed: true, acceptedSemanticMatches: ["R2"] });
    // A skill the user already holds (R1, React) was judged by the code; no semantic upgrade.
    const held = good();
    held.requirements[0] = { ...held.requirements[0], status: "partial", semanticMatch: true };
    expect(
      validateFitReport(held, {
        ...input,
        requirements: input.requirements.map((r) => (r.reqId === "R1" ? { ...r, codeStatus: "missing" as const } : r)),
      }).acceptedSemanticMatches,
    ).toEqual([]);
    semantic.requirements[1].evidenceIds = [];
    expect(paths(semantic)).toContain("requirements.1");

    const education = good();
    education.requirements[2] = {
      reqId: "R3",
      status: "strong",
      semanticMatch: false,
      evidenceIds: [],
      statIds: [],
      note: "Has a degree.",
    };
    expect(messages(education)).toEqual(["R3 is strong: cite the CV evidence (E…)."]);
    education.requirements[2].evidenceIds = ["E3"];
    expect(validateFitReport(education, input).passed).toBe(true);
  });

  it("keeps the strategy consistent, the language specific and the sections short", () => {
    const r = good();
    r.strategy.action = "apply_now";
    r.recruiterView.standsOut = [
      { text: "A perfect fit for the team.", evidenceIds: [], requirementIds: [], statIds: [] },
    ];
    r.summary = { ...r.summary, text: Array.from({ length: 81 }, () => "word").join(" ") };
    expect(messages(r)).toEqual([
      "Too long (81 words; at most 80).",
      "Generic phrase “perfect fit”.",
      "A statement about you must cite CV evidence (E…).",
      "“apply_now” doesn't fit the CONSIDER recommendation (use tailor_first or seek_referral).",
    ]);
  });
});

/** A provider whose model answers each call with the next scripted JSON report. */
function scripted(answers: FitReport[]) {
  let call = 0;
  const model = new MockLanguageModelV4({
    doGenerate: async () => ({
      content: [{ type: "text" as const, text: JSON.stringify(answers[Math.min(call++, answers.length - 1)]) }],
      finishReason: { unified: "stop" as const, raw: undefined },
      usage: {
        inputTokens: { total: 10, noCache: 10, cacheRead: undefined, cacheWrite: undefined },
        outputTokens: { total: 10, text: 10, reasoning: undefined },
      },
      warnings: [],
    }),
  });
  const provider: AiProvider = {
    name: "scripted",
    label: "Scripted",
    configured: true,
    limits: { day: 100 },
    supportsPdf: false,
    models: { fast: "m", balanced: "m", strong: "m" },
    languageModel: () => model,
  };
  const runner = createAiRunner({
    getProviders: async () => ({ providers: [provider], disabled: new Set() }),
    store: new MemoryProviderStore(),
  });
  return { runner, calls: () => call };
}

describe("FitAnalyst repair", () => {
  const broken = () => {
    const r = good();
    r.requirements = r.requirements.filter((a) => a.reqId !== "R1");
    return r;
  };

  it("sends the validator's problems back once and keeps the fixed answer", async () => {
    const { runner, calls } = scripted([broken(), good()]);
    const result = await writeFitReport(runner, input, "posting text");
    expect(calls()).toBe(2);
    expect(result).toMatchObject({ repaired: true, validation: { passed: true } });
  });

  it("keeps the first answer marked unverified when the repair is no better", async () => {
    const worse = broken();
    worse.requirements = [];
    const { runner, calls } = scripted([broken(), worse]);
    const result = await writeFitReport(runner, input, "posting text");
    expect(calls()).toBe(2);
    expect(result.repaired).toBe(false);
    expect(result.validation.issues.map((i) => i.message)).toEqual([
      "Required requirement R1 (React) is not assessed.",
    ]);
  });
});

describe("parts computed in code", () => {
  it("checks the posting's skill keywords against the CV text, aliases included", () => {
    expect(
      atsKeywordCheck(
        [
          { reqId: "R1", skillName: "React", importance: "required", aliases: ["ReactJS"] },
          { reqId: "R2", skillName: "GraphQL", importance: "preferred", aliases: [] },
          { reqId: "R3", skillName: null, importance: "required", aliases: [] },
        ],
        "Built dashboards with ReactJS and Redux.",
      ),
    ).toEqual({
      present: [{ reqId: "R1", keyword: "React" }],
      missing: [{ reqId: "R2", keyword: "GraphQL", importance: "preferred" }],
    });
  });

  it("lowers confidence for a cut-off or thin posting", () => {
    const base = {
      descriptionTruncated: false,
      descriptionWords: 400,
      requirementCount: 12,
      droppedRequirements: 0,
      extractionMode: "ai",
      reportVerified: true,
    };
    expect(reportConfidence(base)).toEqual({ level: "high", reasons: [] });
    expect(reportConfidence({ ...base, descriptionTruncated: true }).level).toBe("low");
    expect(reportConfidence({ ...base, reportVerified: false })).toEqual({
      level: "medium",
      reasons: ["Some statements couldn't be verified."],
    });
  });
});
