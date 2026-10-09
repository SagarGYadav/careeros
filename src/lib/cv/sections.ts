// Section-heading detection (SPEC §9.1 step 2). Completeness checks compare what was extracted with the sections
// found here, so a section the AI skipped triggers a targeted second pass.

export const SECTION_KINDS = [
  "contact",
  "summary",
  "experience",
  "projects",
  "education",
  "certifications",
  "skills",
  "awards",
  "publications",
  "volunteering",
  "languages",
  "interests",
  "personal_details",
  "declaration",
  "references",
  "other",
] as const;

export type SectionKind = (typeof SECTION_KINDS)[number];

const SYNONYMS: Record<Exclude<SectionKind, "other">, string[]> = {
  contact: ["contact", "contact details", "contact information", "contact info"],
  summary: [
    "summary", "profile", "professional summary", "career summary", "profile summary", "executive summary",
    "career objective", "objective", "about", "about me", "overview", "professional profile", "introduction",
  ],
  experience: [
    "experience", "work experience", "professional experience", "employment", "employment history", "work history",
    "career history", "relevant experience", "internships", "internship", "internship experience",
    "experience summary", "professional background",
  ],
  projects: [
    "projects", "personal projects", "academic projects", "key projects", "side projects", "selected projects",
    "project experience", "project work", "notable projects",
  ],
  education: [
    "education", "academic background", "academic qualifications", "educational qualifications",
    "education and training", "academics", "qualifications", "academic details", "educational background",
  ],
  certifications: [
    "certifications", "certificates", "certification", "licenses and certifications", "licences and certifications",
    "courses and certifications", "training and certifications", "courses", "trainings", "training",
  ],
  skills: [
    "skills", "technical skills", "key skills", "core skills", "skills summary", "core competencies", "technologies",
    "tech stack", "tools", "skills and tools", "tools and technologies", "areas of expertise", "expertise",
    "competencies", "technical expertise", "skill set", "skillset",
  ],
  awards: [
    "awards", "honours", "honors", "achievements", "awards and achievements", "accomplishments", "recognition",
    "honours and awards", "honors and awards", "awards and recognition",
  ],
  publications: ["publications", "papers", "research", "research papers"],
  volunteering: ["volunteering", "volunteer experience", "volunteer work", "community", "social work"],
  languages: ["languages", "spoken languages", "language proficiency"],
  interests: ["interests", "hobbies", "hobbies and interests", "interests and hobbies", "extracurricular activities"],
  personal_details: ["personal details", "personal information", "personal data", "personal particulars"],
  declaration: ["declaration"],
  references: ["references", "referees"],
}; // prettier-ignore

const HEADING_INDEX = new Map<string, SectionKind>(
  Object.entries(SYNONYMS).flatMap(([kind, names]) => names.map((name) => [name, kind as SectionKind])),
);

/** Title lines that are not sections. */
const DOCUMENT_TITLES = new Set(["curriculum vitae", "resume", "résumé", "cv", "bio data", "biodata", "bio-data"]);

function headingKey(line: string): string {
  return line
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[:：|•·\-–—_*#]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export type HeadingMatch = { kind: SectionKind; heading: string } | "title" | null;

/** A known heading ("Work Experience", "TECHNICAL SKILLS:"), or an unknown short ALL-CAPS line kept as "other". */
export function classifyHeading(line: string): HeadingMatch {
  const key = headingKey(line);
  if (!key || key.split(" ").length > 5) return null;
  if (DOCUMENT_TITLES.has(key)) return "title";
  const kind = HEADING_INDEX.get(key);
  if (kind) return { kind, heading: line.replace(/[:：]\s*$/, "").trim() };
  const letters = line.replace(/[^A-Za-z]/g, "");
  const allCaps = letters.length >= 4 && letters === letters.toUpperCase();
  if (allCaps && !/[\d@/,]/.test(line) && !line.includes("\t") && key.split(" ").length <= 4) {
    return { kind: "other", heading: line.trim() };
  }
  return null;
}

export type CvSection = { kind: SectionKind; heading: string; lines: string[] };

/** Splits CV lines into the header (before the first heading) and sections in reading order. */
export function detectSections(lines: string[]): { header: string[]; sections: CvSection[] } {
  const header: string[] = [];
  const sections: CvSection[] = [];
  for (const line of lines) {
    const match = classifyHeading(line);
    if (match === "title") continue;
    // An unknown ALL-CAPS line before the first real section is the name or headline, not a heading.
    if (match && match.kind === "other" && !sections.length) header.push(line);
    else if (match) sections.push({ kind: match.kind, heading: match.heading, lines: [] });
    else if (sections.length) sections.at(-1)!.lines.push(line);
    else header.push(line);
  }
  // A heading with nothing under it is more likely a stray word than a section.
  return { header, sections: sections.filter((s) => s.lines.length > 0) };
}

export function sectionsOf(sections: CvSection[], kind: SectionKind): CvSection[] {
  return sections.filter((s) => s.kind === kind);
}
