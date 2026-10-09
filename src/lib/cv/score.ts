// Extraction accuracy against a known answer (SPEC §9.4). Used by the fixture tests and `npm run eval:resume`.
import { skillKey } from "@/lib/skills/normalize";
import { parseCvDate } from "./dates";
import { canonicalUrl, samePhone } from "./regex";
import type { CvDraft } from "./schema";
import { bestMatchScore, normalizeForMatch } from "./text";
import { GROUNDING_THRESHOLD, type VerificationReport } from "./verify";

/** The shape of `fixtures/cv/*.expected.json`. */
export type ExpectedCv = {
  id: string;
  personal: {
    fullName: string;
    email: string;
    phone: string;
    linkedin: string | null;
    github: string | null;
    portfolio: string | null;
  };
  experience: { company: string; title: string; start: string; end: string | null }[];
  bullets: string[];
  skills: string[];
  education: { institution: string; degree: string; grade: string }[];
  certifications: string[];
  jobSearch: {
    noticePeriod?: string;
    currentCtc?: string;
    expectedCtc?: string;
    preferredLocations?: string[];
  } | null;
};

export type Ratio = { correct: number; total: number };

export type ExtractionScore = {
  contact: Ratio;
  experienceFound: Ratio;
  experienceFields: Ratio;
  bulletsCaptured: Ratio;
  /** Bullets the verifier could not find in the CV text (must be 0). */
  bulletsInvented: number;
  skillRecall: Ratio;
  skillPrecision: Ratio;
  educationFields: Ratio;
  certifications: Ratio;
  jobSearch: Ratio;
  /** Human-readable misses, for the eval report. */
  misses: string[];
};

export const rate = (r: Ratio) => (r.total === 0 ? 1 : r.correct / r.total);

const same = (a: string | null | undefined, b: string | null | undefined) =>
  normalizeForMatch(a ?? "") === normalizeForMatch(b ?? "");

/** SPEC §9.4 targets. */
export const EXTRACTION_TARGETS = {
  contact: 1,
  experienceFound: 1,
  experienceFields: 0.95,
  bulletsCaptured: 0.95,
  skillRecall: 0.9,
  skillPrecision: 0.95,
  educationFields: 0.95,
  certifications: 0.95,
} as const;

export function scoreExtraction(expected: ExpectedCv, draft: CvDraft, report: VerificationReport): ExtractionScore {
  const misses: string[] = [];
  const tally = (ok: boolean, ratio: Ratio, miss: string) => {
    ratio.total++;
    if (ok) ratio.correct++;
    else misses.push(miss);
  };

  const contact: Ratio = { correct: 0, total: 0 };
  const p = draft.personal;
  tally(same(p.fullName, expected.personal.fullName), contact, `name: ${p.fullName}`);
  tally((p.email ?? "").toLowerCase() === expected.personal.email.toLowerCase(), contact, `email: ${p.email}`);
  tally(Boolean(p.phone) && samePhone(p.phone!, expected.personal.phone), contact, `phone: ${p.phone}`);
  for (const key of ["linkedin", "github", "portfolio"] as const) {
    const want = expected.personal[key];
    const got = p[key];
    tally(want ? Boolean(got) && canonicalUrl(got!) === canonicalUrl(want) : !got, contact, `${key}: ${got}`);
  }

  const experienceFound: Ratio = { correct: 0, total: 0 };
  const experienceFields: Ratio = { correct: 0, total: 0 };
  for (const want of expected.experience) {
    const got = draft.experience.find((e) => same(e.company, want.company));
    tally(Boolean(got), experienceFound, `role missing: ${want.title} at ${want.company}`);
    tally(Boolean(got), experienceFields, `company: ${want.company}`);
    tally(Boolean(got) && same(got!.title, want.title), experienceFields, `title: ${got?.title} ≠ ${want.title}`);
    tally(got?.startDate === parseCvDate(want.start), experienceFields, `start: ${got?.startDate} ≠ ${want.start}`);
    tally(
      (got?.endDate ?? null) === (want.end ? parseCvDate(want.end) : null),
      experienceFields,
      `end: ${got?.endDate} ≠ ${want.end}`,
    );
  }

  const bulletsCaptured: Ratio = { correct: 0, total: 0 };
  const gotBullets = [...draft.experience.flatMap((e) => e.bullets), ...draft.projects.flatMap((p) => p.bullets)];
  const gotText = gotBullets.map((b) => normalizeForMatch(b.text));
  for (const bullet of expected.bullets) {
    const needle = normalizeForMatch(bullet);
    const ok = gotText.some((t) => t === needle || bestMatchScore(t, needle) >= GROUNDING_THRESHOLD);
    tally(ok, bulletsCaptured, `bullet: ${bullet}`);
  }
  const bulletsInvented = report.flags.filter(
    (f) => f.issue === "not_found_in_cv" && /^(experience|projects)\.\d+\.bullets\.\d+$/.test(f.path),
  ).length;

  const expectedSkills = new Set(expected.skills.map(skillKey));
  const gotSkills = new Set(draft.skills.explicit.map((s) => skillKey(s.name)));
  const skillRecall: Ratio = { correct: 0, total: 0 };
  for (const skill of expected.skills) tally(gotSkills.has(skillKey(skill)), skillRecall, `skill missing: ${skill}`);
  const skillPrecision: Ratio = { correct: 0, total: 0 };
  for (const skill of draft.skills.explicit) {
    tally(expectedSkills.has(skillKey(skill.name)), skillPrecision, `skill extra: ${skill.name}`);
  }

  const educationFields: Ratio = { correct: 0, total: 0 };
  for (const want of expected.education) {
    const got = draft.education.find((e) => same(e.institution, want.institution));
    tally(Boolean(got), educationFields, `institution: ${want.institution}`);
    tally(Boolean(got) && same(got!.degree, want.degree), educationFields, `degree: ${got?.degree} ≠ ${want.degree}`);
    tally(Boolean(got) && same(got!.grade, want.grade), educationFields, `grade: ${got?.grade} ≠ ${want.grade}`);
  }

  const certifications: Ratio = { correct: 0, total: 0 };
  for (const name of expected.certifications) {
    tally(
      draft.certifications.some((c) => same(c.name, name)),
      certifications,
      `certification: ${name}`,
    );
  }

  const jobSearch: Ratio = { correct: 0, total: 0 };
  if (expected.jobSearch) {
    const js = draft.jobSearch;
    for (const key of ["noticePeriod", "currentCtc", "expectedCtc"] as const) {
      if (expected.jobSearch[key]) tally(same(js[key], expected.jobSearch[key]), jobSearch, `${key}: ${js[key]}`);
    }
    for (const place of expected.jobSearch.preferredLocations ?? []) {
      tally(
        js.preferredLocations.some((l) => same(l, place)),
        jobSearch,
        `preferred location: ${place}`,
      );
    }
  }

  return {
    contact,
    experienceFound,
    experienceFields,
    bulletsCaptured,
    bulletsInvented,
    skillRecall,
    skillPrecision,
    educationFields,
    certifications,
    jobSearch,
    misses,
  };
}

/** Which §9.4 targets a score misses, e.g. ["skillRecall 0.86 < 0.9"]. */
export function missedTargets(score: ExtractionScore): string[] {
  const missed = Object.entries(EXTRACTION_TARGETS)
    .filter(([key, target]) => rate(score[key as keyof typeof EXTRACTION_TARGETS]) < target)
    .map(([key, target]) => `${key} ${rate(score[key as keyof typeof EXTRACTION_TARGETS]).toFixed(2)} < ${target}`);
  if (score.bulletsInvented > 0) missed.push(`bulletsInvented ${score.bulletsInvented} > 0`);
  return missed;
}
