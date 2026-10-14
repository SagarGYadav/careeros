import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import type { CvDraft } from "@/lib/cv/schema";
import { db } from "@/server/db";

const json = (value: unknown) => value as Prisma.InputJsonValue;

export type ProfilePreferences = {
  currentCtc: number | null;
  expectedCtcMin: number | null;
  expectedCtcMax: number | null;
  noticePeriodDays: number | null;
  preferredLocations: string[];
  workModes: string[];
  openToRelocate: boolean;
  dealbreakers: { bond: boolean; nightShift: boolean; contractToHire: boolean; maxWfoDaysPerWeek: number | null };
};

export async function getPersonalDetails(userId: string) {
  return db.personalDetails.findUnique({ where: { userId } });
}

export async function getCareerProfile(userId: string) {
  return db.careerProfile.findUnique({ where: { userId } });
}

export async function getProfileEntries(userId: string) {
  const order = { sortOrder: "asc" } as const;
  const [experience, projects, education, certifications, otherSections] = await Promise.all([
    db.experienceEntry.findMany({ where: { userId }, orderBy: order }),
    db.projectEntry.findMany({ where: { userId }, orderBy: order }),
    db.educationEntry.findMany({ where: { userId }, orderBy: order }),
    db.certificationEntry.findMany({ where: { userId }, orderBy: order }),
    db.otherCvSection.findMany({ where: { userId }, orderBy: order }),
  ]);
  return { experience, projects, education, certifications, otherSections };
}

export function personalDetailsData(personal: CvDraft["personal"]) {
  return {
    fullName: personal.fullName,
    email: personal.email,
    phone: personal.phone,
    city: personal.city,
    state: personal.state,
    country: personal.country,
    linkedinUrl: personal.linkedin,
    githubUrl: personal.github,
    portfolioUrl: personal.portfolio,
    otherLinks: personal.otherLinks.map((l) => l.url),
    otherDetails: json(personal.otherDetails),
  };
}

// The write helpers below return Prisma promises so a caller can run several in one batch transaction
// (`db.$transaction([...])`): one round trip per statement, no interactive transaction to time out.

export function upsertPersonalDetails(userId: string, personal: CvDraft["personal"]) {
  const data = personalDetailsData(personal);
  return db.personalDetails.upsert({ where: { userId }, create: { userId, ...data }, update: data });
}

export function upsertCareerProfile(userId: string, data: Prisma.CareerProfileUncheckedUpdateInput) {
  const create = { ...data, userId } as Prisma.CareerProfileUncheckedCreateInput;
  return db.careerProfile.upsert({ where: { userId }, create, update: data });
}

export function replaceExperience(userId: string, experience: CvDraft["experience"]) {
  return [
    db.experienceEntry.deleteMany({ where: { userId } }),
    db.experienceEntry.createMany({
      data: experience.map((role, sortOrder) => ({
        userId,
        sortOrder,
        company: role.company,
        title: role.title,
        employmentType: role.employmentType,
        location: role.location,
        workMode: role.workMode,
        startDate: role.startDate,
        endDate: role.isCurrent ? null : role.endDate,
        isCurrent: role.isCurrent,
        durationMonths: role.durationMonths,
        domain: role.domain,
        teamSize: role.teamSize === null ? null : String(role.teamSize),
        bullets: json(role.bullets),
        technologies: role.technologies,
      })),
    }),
  ];
}

export function replaceProjects(userId: string, projects: CvDraft["projects"]) {
  return [
    db.projectEntry.deleteMany({ where: { userId } }),
    db.projectEntry.createMany({
      data: projects.map((project, sortOrder) => ({
        userId,
        sortOrder,
        name: project.name,
        role: project.role,
        description: project.description,
        technologies: project.technologies,
        links: project.links,
        startDate: project.startDate,
        endDate: project.endDate,
        bullets: json(project.bullets),
      })),
    }),
  ];
}

export function replaceEducation(userId: string, education: CvDraft["education"]) {
  return [
    db.educationEntry.deleteMany({ where: { userId } }),
    db.educationEntry.createMany({
      data: education.map((degree, sortOrder) => ({
        userId,
        sortOrder,
        institution: degree.institution,
        degree: degree.degree || null,
        field: degree.field,
        startDate: degree.startDate,
        endDate: degree.endDate,
        grade: degree.grade,
        location: degree.location,
      })),
    }),
  ];
}

export function replaceCertifications(userId: string, certifications: CvDraft["certifications"]) {
  return [
    db.certificationEntry.deleteMany({ where: { userId } }),
    db.certificationEntry.createMany({
      data: certifications.map((cert, sortOrder) => ({
        userId,
        sortOrder,
        name: cert.name,
        issuer: cert.issuer,
        issueDate: cert.issueDate,
        expiryDate: cert.expiryDate,
        credentialId: cert.credentialId,
        url: cert.url,
      })),
    }),
  ];
}

export function replaceOtherSections(userId: string, sections: CvDraft["otherSections"]) {
  return [
    db.otherCvSection.deleteMany({ where: { userId } }),
    db.otherCvSection.createMany({
      data: sections.map((section, sortOrder) => ({
        userId,
        sortOrder,
        type: section.kind,
        title: section.heading,
        items: json(section.items),
      })),
    }),
  ];
}

export async function savePreferences(userId: string, prefs: ProfilePreferences) {
  const data = { ...prefs, dealbreakers: json(prefs.dealbreakers) };
  await db.careerProfile.upsert({ where: { userId }, create: { userId, ...data }, update: data });
}

export async function saveHeadlineAndSummary(
  userId: string,
  data: { headline: string | null; summary: string | null },
) {
  await db.careerProfile.upsert({ where: { userId }, create: { userId, ...data }, update: data });
}

export async function savePersonalDetails(userId: string, personal: CvDraft["personal"]) {
  await upsertPersonalDetails(userId, personal);
}

/** Runs write statements as one batch transaction. */
export async function runBatch(statements: Prisma.PrismaPromise<unknown>[]) {
  // Each statement is a round trip to the database; a CV with many entries needs more than the default 5 s.
  await db.$transaction(statements, { maxWait: 10_000, timeout: 30_000 });
}

/** When the user last opened the "For you" feed; jobs found after it get a "New" badge. */
export async function setFeedSeenAt(userId: string, at: Date) {
  await db.careerProfile.updateMany({ where: { userId }, data: { feedSeenAt: at } });
}
