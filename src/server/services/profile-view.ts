import "server-only";
import { z } from "zod";
import { BULLET_KINDS, OTHER_SECTION_KINDS, type CvDraft } from "@/lib/cv/schema";
import { listCareerFacts } from "@/server/repositories/career-facts";
import { getCareerProfile, getPersonalDetails, getProfileEntries } from "@/server/repositories/profile";
import { getDefaultResume, listResumeVersions } from "@/server/repositories/resumes";
import { listUserSkills } from "@/server/repositories/skills";

// Profile tables → the draft shapes the section editors use. JSON columns are validated on the way out.

const bulletsSchema = z
  .array(z.object({ id: z.string(), text: z.string(), kind: z.enum(BULLET_KINDS), hasMetric: z.boolean() }))
  .catch([]);
const otherDetailsSchema = z.array(z.object({ label: z.string(), value: z.string() })).catch([]);
const itemsSchema = z.array(z.string()).catch([]);
const sectionKind = z.enum(OTHER_SECTION_KINDS).catch("other");
const employmentType = z
  .enum(["full_time", "part_time", "contract", "internship", "freelance", "temporary"])
  .nullable()
  .catch(null);
const workMode = z.enum(["onsite", "hybrid", "remote"]).nullable().catch(null);

export async function getProfileForEditing(userId: string) {
  const [personal, profile, entries, defaultResume] = await Promise.all([
    getPersonalDetails(userId),
    getCareerProfile(userId),
    getProfileEntries(userId),
    getDefaultResume(userId),
  ]);

  const details: Pick<CvDraft, "personal" | "headline" | "summary" | "otherSections"> = {
    personal: {
      fullName: personal?.fullName ?? null,
      email: personal?.email ?? null,
      phone: personal?.phone ?? null,
      city: personal?.city ?? null,
      state: personal?.state ?? null,
      country: personal?.country ?? null,
      linkedin: personal?.linkedinUrl ?? null,
      github: personal?.githubUrl ?? null,
      portfolio: personal?.portfolioUrl ?? null,
      otherLinks: (personal?.otherLinks ?? []).map((url) => ({ url, label: null })),
      otherDetails: otherDetailsSchema.parse(personal?.otherDetails ?? []),
    },
    headline: profile?.headline ?? null,
    summary: profile?.summary ?? null,
    otherSections: entries.otherSections.map((s) => ({
      kind: sectionKind.parse(s.type),
      heading: s.title ?? "",
      items: itemsSchema.parse(s.items),
    })),
  };

  const experience: CvDraft["experience"] = entries.experience.map((e) => ({
    company: e.company,
    title: e.title,
    employmentType: employmentType.parse(e.employmentType),
    location: e.location,
    workMode: workMode.parse(e.workMode),
    startDate: e.startDate,
    endDate: e.endDate,
    isCurrent: e.isCurrent,
    durationMonths: e.durationMonths,
    domain: e.domain,
    teamSize: e.teamSize && /^\d+$/.test(e.teamSize) ? Number(e.teamSize) : null,
    bullets: bulletsSchema.parse(e.bullets),
    technologies: e.technologies,
    technologiesEvidenceId: null,
    sourceQuote: "",
  }));

  const projects: CvDraft["projects"] = entries.projects.map((p) => ({
    name: p.name,
    role: p.role,
    description: p.description,
    technologies: p.technologies,
    links: p.links,
    startDate: p.startDate,
    endDate: p.endDate,
    bullets: bulletsSchema.parse(p.bullets),
    sourceQuote: "",
  }));

  const education: CvDraft["education"] = entries.education.map((e) => ({
    evidenceId: "",
    institution: e.institution,
    degree: e.degree ?? "",
    field: e.field,
    location: e.location,
    startDate: e.startDate,
    endDate: e.endDate,
    grade: e.grade,
    sourceQuote: "",
  }));

  const certifications: CvDraft["certifications"] = entries.certifications.map((c) => ({
    evidenceId: "",
    name: c.name,
    issuer: c.issuer,
    issueDate: c.issueDate,
    expiryDate: c.expiryDate,
    credentialId: c.credentialId,
    url: c.url,
    sourceQuote: "",
  }));

  return { details, experience, projects, education, certifications, profile, hasConfirmedCv: Boolean(defaultResume) };
}

export async function getProfileOverview(userId: string) {
  const [personal, profile, entries, skills, facts, resumes] = await Promise.all([
    getPersonalDetails(userId),
    getCareerProfile(userId),
    getProfileEntries(userId),
    listUserSkills(userId),
    listCareerFacts(userId),
    listResumeVersions(userId),
  ]);
  return {
    personal,
    profile,
    counts: {
      experience: entries.experience.length,
      projects: entries.projects.length,
      education: entries.education.length,
      certifications: entries.certifications.length,
      otherSections: entries.otherSections.length,
      skills: skills.length,
      skillsToConfirm: skills.filter((s) => !s.confirmed).length,
      facts: facts.filter((f) => f.status === "active").length,
    },
    resumes,
  };
}
