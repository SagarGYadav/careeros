// Confirming a reviewed CV writes the profile, skills and default resume; section edits keep evidence in step.
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { cvDraftSchema, evidenceItemSchema } from "@/lib/cv/schema";
import { db } from "@/server/db";
import { getProfileEntries } from "@/server/repositories/profile";
import { getDefaultResume, getResumeVersion } from "@/server/repositories/resumes";
import { listUserSkills } from "@/server/repositories/skills";
import { processCvUpload } from "@/server/services/cv-pipeline";
import { confirmResume, saveExperienceSection } from "@/server/services/profile";
import { getProfileForEditing } from "@/server/services/profile-view";

const EMAIL_DOMAIN = "@profile.integration.careeros.test";
const NOW = new Date("2026-10-09T10:00:00Z");
let userId: string;

beforeAll(async () => {
  userId = randomUUID();
  await db.user.create({ data: { id: userId, name: "Profile Test", email: `p-${userId}${EMAIL_DOMAIN}` } });
});

afterAll(async () => {
  await db.user.deleteMany({ where: { email: { endsWith: EMAIL_DOMAIN } } });
  await db.$disconnect();
});

describe("profile from a confirmed CV", () => {
  it("writes the profile, skills with suggested levels and the default resume", async () => {
    const bytes = new Uint8Array(readFileSync("fixtures/cv/priya-indian-format.pdf"));
    const { resumeId, draft } = await processCvUpload(userId, { fileName: "priya.pdf", bytes }, { now: NOW });
    await confirmResume(userId, resumeId, draft, NOW);

    const [resume, entries, skills, profile] = await Promise.all([
      getResumeVersion(userId, resumeId),
      getProfileEntries(userId),
      listUserSkills(userId),
      db.careerProfile.findUnique({ where: { userId } }),
    ]);
    expect(resume).toMatchObject({ parseStatus: "confirmed", isDefault: true });
    expect(entries.experience.map((e) => e.company)).toEqual([
      "Orbit Learning Pvt. Ltd.",
      "Brightline Insurance Services",
    ]);
    expect(entries.education[0]).toMatchObject({ degree: "B.Tech", grade: "72%" });
    // Job-search details from the CV fill the empty preferences; years of experience are computed.
    expect(profile).toMatchObject({
      noticePeriodDays: 60,
      currentCtc: 850_000,
      expectedCtcMin: 1_200_000,
      preferredLocations: ["Gurugram", "Noida"],
      workModes: ["remote"],
      yearsExperience: 5.8,
    });
    const angular = skills.find((s) => s.skill.slug === "angular");
    expect(angular).toMatchObject({ source: "cv_section", proficiencySource: "rule", confirmed: false });
    expect(angular!.evidenceIds.length).toBeGreaterThan(0);
    // Inferred from experience, not listed: React Hook Form.
    expect(skills.some((s) => s.source === "cv_inferred")).toBe(true);
  });

  it("keeps bullet evidence ids stable when experience is edited", async () => {
    const before = await getDefaultResume(userId);
    const evidenceBefore = evidenceItemSchema.array().parse(before!.evidence);
    const { experience } = await getProfileForEditing(userId);
    const firstId = experience[0].bullets[0].id;
    experience[0].bullets[0].text = "Led the rebuild of the assessment platform for 12 enterprise clients.";
    experience[0].bullets.push({ id: "", text: "Mentored two interns.", kind: "responsibility", hasMetric: false });
    await saveExperienceSection(userId, experience, NOW);

    const after = await getDefaultResume(userId);
    const evidence = evidenceItemSchema.array().parse(after!.evidence);
    const edited = evidence.find((e) => e.id === firstId)!;
    expect(edited.text).toBe("Led the rebuild of the assessment platform for 12 enterprise clients.");
    expect(edited.grounded).toBe(false);
    const maxBefore = Math.max(...evidenceBefore.map((e) => Number(e.id.slice(1))));
    expect(evidence.find((e) => e.text === "Mentored two interns.")?.id).toBe(`E${maxBefore + 1}`);
    expect(cvDraftSchema.parse(after!.parsed).experience[0].bullets).toHaveLength(4);
  });
});
