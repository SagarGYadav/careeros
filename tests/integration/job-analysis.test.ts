// Fit analysis of a job against the test database, with the mock AI (the deterministic JobExtractor).
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { descriptionHash } from "@/lib/jobs/normalize";
import { db } from "@/server/db";
import { savePreferences } from "@/server/repositories/profile";
import { listTargetRoles, updateTargetRole } from "@/server/repositories/target-roles";
import { processCvUpload } from "@/server/services/cv-pipeline";
import { analyseJobFit } from "@/server/services/job-analysis";
import { confirmResume } from "@/server/services/profile";
import { getScoringSettings, resetScoringSettings, saveScoringSettings } from "@/server/services/scoring-settings";
import { addCustomRole, suggestTargetRoles } from "@/server/services/target-roles";

const EMAIL_DOMAIN = "@analysis.integration.careeros.test";
const NOW = new Date("2026-10-13T10:00:00Z");
let userId: string;
let jobId: string;

// A fictional posting.
const POSTING = `What you'll do:
- Build the merchant dashboard in Next.js and React
- Own performance and accessibility of the checkout flow
Requirements:
- 4+ years of frontend experience
- Strong TypeScript and React
- Experience with REST APIs
- Kubernetes and Terraform for deployments
Good to have:
- GraphQL
Notice period: 30 days.`;

beforeAll(async () => {
  userId = randomUUID();
  await db.user.create({ data: { id: userId, name: "Analysis Test", email: `a-${userId}${EMAIL_DOMAIN}` } });
  const bytes = new Uint8Array(readFileSync("fixtures/cv/ananya-single-column.pdf"));
  const { resumeId, draft } = await processCvUpload(userId, { fileName: "ananya.pdf", bytes }, { now: NOW });
  await confirmResume(userId, resumeId, draft, NOW);
  await suggestTargetRoles(userId);
  for (const role of await listTargetRoles(userId)) await updateTargetRole(userId, role.id, { selected: false });
  await addCustomRole(userId, "Frontend Engineer");
  await savePreferences(userId, {
    currentCtc: null,
    expectedCtcMin: 1_800_000,
    expectedCtcMax: null,
    noticePeriodDays: 60,
    preferredLocations: ["Bengaluru"],
    workModes: ["hybrid", "remote"],
    openToRelocate: false,
    dealbreakers: { bond: false, nightShift: false, contractToHire: false, maxWfoDaysPerWeek: null },
  });
  const job = await db.job.create({
    data: {
      userId,
      title: "Frontend Engineer",
      companyName: "Kestrel Pay",
      descriptionRaw: POSTING,
      descriptionHash: descriptionHash(POSTING),
      origin: "manual",
      provider: "manual",
      externalId: randomUUID(),
      applyLinks: [],
      locationCity: "Bengaluru",
      workMode: "hybrid",
      salaryMinAnnual: 2_000_000,
      salaryMaxAnnual: 3_000_000,
      salaryDisclosed: true,
      conditions: { noticePeriodMaxDays: 30 },
    },
  });
  jobId = job.id;
}, 180_000);

afterAll(async () => {
  await db.user.deleteMany({ where: { email: { endsWith: EMAIL_DOMAIN } } });
  await db.$disconnect();
});

describe("Fit analysis", () => {
  it("extracts numbered requirements, scores the job in code and saves the analysis", async () => {
    const analysis = await analyseJobFit(userId, jobId, NOW);
    expect(analysis.extractionMode).toBe("ai"); // the mock AI answered
    const stored = await db.jobRequirement.findMany({ where: { jobId }, orderBy: { sortOrder: "asc" } });
    expect(stored.map((r) => r.reqId)).toEqual(stored.map((_, i) => `R${i + 1}`));
    const byText = new Map(stored.map((r) => [r.text, r]));
    expect(byText.get("React")).toMatchObject({ importance: "required", kind: "skill" });
    expect(byText.get("TypeScript")?.skillId).not.toBeNull();
    expect(byText.get("GraphQL")).toMatchObject({ importance: "preferred" });
    expect(byText.get("Next.js")).toMatchObject({ importance: "implied" });
    expect(stored[0].importance).toBe("required"); // must-haves first

    const job = await db.job.findUniqueOrThrow({ where: { id: jobId } });
    expect(job).toMatchObject({ expMinYears: 4, extractionPromptVersion: "1" });
    expect(job.responsibilities).toHaveLength(2);

    const { score } = analysis;
    expect(score.total).toBeGreaterThan(0);
    expect(score.total).toBeLessThanOrEqual(100);
    expect(score.components.map((c) => c.key)).toEqual(["skills", "experience", "roleAlignment", "location", "salary"]);
    expect(score.requirements).toHaveLength(stored.length);
    // The fictional CV has no Kubernetes or Terraform, and the notice period (60) is longer than the 30 days asked.
    expect(score.blockers.map((b) => b.kind)).toEqual(["skills", "notice"]);
    expect(score.recommendation).toBe("LOW_PRIORITY");
    expect(score.gains.map((g) => g.skillName)).toEqual(expect.arrayContaining(["Kubernetes", "Terraform"]));

    const saved = await db.jobAnalysis.findUniqueOrThrow({ where: { id: analysis.id } });
    expect(saved).toMatchObject({
      userId,
      scoreTotal: score.total,
      recommendation: "LOW_PRIORITY",
      scoringConfigVersion: 0,
    });
    expect(saved.report).toBeNull(); // FitAnalyst adds the report (step 4b)
  }, 120_000);

  it("reuses the extraction and the analysis when nothing changed", async () => {
    const before = await db.jobRequirement.findMany({ where: { jobId }, select: { id: true } });
    const first = await db.jobAnalysis.findFirstOrThrow({ where: { jobId } });
    const again = await analyseJobFit(userId, jobId, NOW);
    expect(again.id).toBe(first.id);
    const after = await db.jobRequirement.findMany({ where: { jobId }, select: { id: true } });
    expect(after).toEqual(before);
    expect(await db.jobAnalysis.count({ where: { jobId } })).toBe(1);
  }, 120_000);

  it("uses the user's scoring settings as a new version, and goes back to the defaults", async () => {
    const before = await analyseJobFit(userId, jobId, NOW);
    const version = await saveScoringSettings(userId, {
      weights: { skills: 25, experience: 25, roleAlignment: 25, location: 15, salary: 10 },
      thresholds: { apply: 70, consider: 50 },
    });
    expect(version).toBe(1);
    const custom = await analyseJobFit(userId, jobId, NOW);
    expect(custom.scoringConfigVersion).toBe(1);
    expect(custom.id).not.toBe(before.id);
    expect(custom.score.components.find((c) => c.key === "skills")?.max).toBe(25);

    await expect(
      saveScoringSettings(userId, {
        weights: { skills: 90, experience: 20, roleAlignment: 0, location: 0, salary: 0 },
        thresholds: { apply: 70, consider: 50 },
      }),
    ).rejects.toThrow();

    await resetScoringSettings(userId);
    expect((await getScoringSettings(userId)).isDefault).toBe(true);
    const back = await analyseJobFit(userId, jobId, NOW);
    expect(back.id).toBe(before.id); // same inputs as the first analysis
  }, 120_000);

  it("extracts again when the description changes", async () => {
    const longer = `${POSTING}\nExperience with Redux is a plus.`;
    await db.job.update({
      where: { id: jobId },
      data: { descriptionRaw: longer, descriptionHash: descriptionHash(longer) },
    });
    const analysis = await analyseJobFit(userId, jobId, NOW);
    expect(analysis.requirements.find((r) => r.text === "Redux")).toMatchObject({ importance: "preferred" });
  }, 120_000);
});
