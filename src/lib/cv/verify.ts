// Verification layer (SPEC §9.1 step 4), all in code:
// - grounding: every extracted string must appear in the CV text (normalised fuzzy match ≥ 0.9), else it is flagged;
// - deterministic fields win: e-mail, phone and links found by regex or link annotations override the AI;
// - completeness: each detected section must have content, with counts compared against the text-based parse;
// - dates are normalised to YYYY-MM and durations, totals, overlaps and gaps are computed here.
import { currentYearMonth, experienceTotals, isPresentWord, monthsBetween, monthIndex, parseCvDate } from "./dates";
import { buildEvidenceCatalog, mentionsSkill, pageLocator, skillKeysIn } from "./evidence";
import type { ExtractedCv } from "./extract-text";
import { canonicalUrl, classifyUrl, findEmails, findPhones, findUrls, normalizeUrl, samePhone } from "./regex";
import type { CvDraft, EvidenceItem, ParsedCv } from "./schema";
import type { CvSection, SectionKind } from "./sections";
import { bestMatchScore, hasMetric, normalizeForMatch } from "./text";

export const GROUNDING_THRESHOLD = 0.9;

export type FlagIssue =
  | "not_found_in_cv"
  | "overridden"
  | "added_from_text"
  | "date_unparsed"
  | "date_order"
  | "section_incomplete"
  | "empty_field";

/** A field the review screen highlights. `path` is a dot path into the draft, e.g. "experience.0.bullets.2". */
export type VerificationFlag = { path: string; issue: FlagIssue; message: string; value?: string | null };

export type SectionCheck = {
  kind: SectionKind;
  heading: string;
  extracted: number;
  /** What the text-based parse found; null when it couldn't read the section. */
  expected: number | null;
  complete: boolean;
};

export type VerificationReport = {
  version: 1;
  grounding: { checked: number; notFound: number; threshold: number };
  overrides: { field: string; aiValue: string | null; value: string; source: "text" | "link" }[];
  completeness: {
    sections: SectionCheck[];
    secondPass: { requested: SectionKind[]; improved: SectionKind[] };
  };
  flags: VerificationFlag[];
};

/** Sections a targeted second pass can re-extract. */
export const SECOND_PASS_SECTIONS = ["experience", "projects", "education", "certifications", "skills"] as const;
export type SecondPassSection = (typeof SECOND_PASS_SECTIONS)[number];

export type VerifyContext = {
  extracted: ExtractedCv;
  sections: CvSection[];
  /** The deterministic parse of the same text: the reference for completeness. */
  reference: ParsedCv;
  now: Date;
  secondPass?: { requested: SectionKind[]; improved: SectionKind[] };
};

export type VerifiedCv = {
  draft: CvDraft;
  evidence: EvidenceItem[];
  report: VerificationReport;
  /** Sections whose extraction looks incomplete and that a second pass can retry. */
  incompleteSections: SecondPassSection[];
};

/** Grounding helpers over one CV text. */
export function groundingIndex(text: string) {
  const normalized = normalizeForMatch(text);
  const skillKeys = skillKeysIn(text);
  const urls = new Set(findUrls(text).map(canonicalUrl));
  return {
    score: (value: string) => bestMatchScore(normalized, normalizeForMatch(value)),
    found: (value: string) => bestMatchScore(normalized, normalizeForMatch(value)) >= GROUNDING_THRESHOLD,
    /** Skills are short names: matched by skill key ("NodeJS" = "Node.js") rather than by edit distance. */
    skillFound: (name: string) => mentionsSkill(skillKeys, name) || normalized.includes(normalizeForMatch(name)),
    urls,
  };
}

const PERSONAL_LINK_TYPES = new Set(["linkedin", "github", "portfolio"]);

function countSection(parsed: ParsedCv, kind: SectionKind): { entries: number; bullets: number } | null {
  switch (kind) {
    case "experience":
      return {
        entries: parsed.experience.length,
        bullets: parsed.experience.reduce((n, e) => n + e.bullets.length, 0),
      };
    case "projects":
      return { entries: parsed.projects.length, bullets: parsed.projects.reduce((n, p) => n + p.bullets.length, 0) };
    case "education":
      return { entries: parsed.education.length, bullets: 0 };
    case "certifications":
      return { entries: parsed.certifications.length, bullets: 0 };
    case "skills":
      return { entries: parsed.skills.explicit.length + parsed.skills.soft.length, bullets: 0 };
    case "summary":
      return { entries: parsed.summary ? 1 : 0, bullets: 0 };
    case "personal_details":
      return { entries: parsed.personal.otherDetails.length, bullets: 0 };
    case "awards":
    case "publications":
    case "volunteering":
    case "languages":
    case "interests":
      return {
        entries: parsed.otherSections.filter((s) => s.kind === kind).reduce((n, s) => n + s.items.length, 0),
        bullets: 0,
      };
    default:
      return null;
  }
}

export function verifyCv(parsed: ParsedCv, context: VerifyContext): VerifiedCv {
  const { extracted, now } = context;
  const index = groundingIndex(extracted.text);
  const flags: VerificationFlag[] = [];
  const overrides: VerificationReport["overrides"] = [];
  let checked = 0;
  let notFound = 0;

  const ground = (path: string, value: string | null | undefined, kind: "text" | "skill" = "text") => {
    if (!value || !value.trim()) return true;
    checked++;
    const ok = kind === "skill" ? index.skillFound(value) : index.found(value);
    if (!ok) {
      notFound++;
      flags.push({ path, issue: "not_found_in_cv", message: "Not found in the CV text. Check or remove it.", value });
    }
    return ok;
  };
  const requireValue = (path: string, value: string | null | undefined, label: string) => {
    if (!value || !value.trim()) flags.push({ path, issue: "empty_field", message: `${label} is missing.` });
  };
  const currentMonth = currentYearMonth(now);
  const parseDate = (path: string, value: string | null | undefined) => {
    if (!value || isPresentWord(value)) return null;
    const parsedDate = parseCvDate(value);
    if (!parsedDate) flags.push({ path, issue: "date_unparsed", message: "This date couldn't be read.", value });
    return parsedDate;
  };
  const checkOrder = (path: string, start: string | null, end: string | null) => {
    if (start && end && monthIndex(start) > monthIndex(end)) {
      flags.push({ path, issue: "date_order", message: "The end date is before the start date." });
    }
    if (start && monthIndex(start) > monthIndex(currentMonth)) {
      flags.push({ path, issue: "date_order", message: "The start date is in the future." });
    }
  };

  // ---- Personal details: deterministic values win.
  const p = parsed.personal;
  const linkUrls = extracted.links.map((l) => l.url);
  const emails = [
    ...findEmails(extracted.text),
    ...linkUrls
      .filter((u) => /^mailto:/i.test(u))
      .map((u) =>
        u
          .replace(/^mailto:/i, "")
          .split("?")[0]
          .toLowerCase(),
      ),
  ];
  let email = p.email?.trim().toLowerCase() || null;
  if (emails.length && (!email || !emails.includes(email))) {
    overrides.push({ field: "personal.email", aiValue: p.email, value: emails[0], source: "text" });
    flags.push({
      path: "personal.email",
      issue: email ? "overridden" : "added_from_text",
      message: email ? "Replaced with the address written in the CV." : "Found in the CV text.",
      value: emails[0],
    });
    email = emails[0];
  } else if (email && !emails.includes(email)) {
    ground("personal.email", email);
  }

  const phones = [
    ...findPhones(extracted.text),
    ...linkUrls.filter((u) => /^tel:/i.test(u)).map((u) => decodeURIComponent(u.replace(/^tel:/i, ""))),
  ];
  let phone = p.phone?.trim() || null;
  const writtenPhone = phone ? phones.find((candidate) => samePhone(candidate, phone!)) : undefined;
  if (writtenPhone) phone = writtenPhone;
  else if (phones.length) {
    overrides.push({ field: "personal.phone", aiValue: p.phone, value: phones[0], source: "text" });
    flags.push({
      path: "personal.phone",
      issue: phone ? "overridden" : "added_from_text",
      message: phone ? "Replaced with the number written in the CV." : "Found in the CV text.",
      value: phones[0],
    });
    phone = phones[0];
  } else if (phone) ground("personal.phone", phone);

  // Links: annotations and URLs in the text are the truth; the AI's links must be among them.
  const deterministic = new Map<string, { url: string; label: string | null; source: "text" | "link" }>();
  for (const link of extracted.links) {
    const type = classifyUrl(normalizeUrl(link.url));
    if (type === "email" || type === "phone") continue;
    deterministic.set(canonicalUrl(normalizeUrl(link.url)), {
      url: normalizeUrl(link.url),
      label: link.text,
      source: "link",
    });
  }
  for (const url of findUrls(extracted.text)) {
    if (!deterministic.has(canonicalUrl(url)))
      deterministic.set(canonicalUrl(url), { url, label: null, source: "text" });
  }
  const personalLinks = {
    linkedin: null as string | null,
    github: null as string | null,
    portfolio: null as string | null,
  };
  const otherLinks: CvDraft["personal"]["otherLinks"] = [];
  p.links.forEach((link, i) => {
    const url = normalizeUrl(link.url);
    const known = deterministic.get(canonicalUrl(url));
    if (!known) {
      checked++;
      notFound++;
      flags.push({
        path: `personal.links.${i}`,
        issue: "not_found_in_cv",
        message: "This link isn't in the CV.",
        value: link.url,
      });
    }
    const type = classifyUrl(url);
    const slot = type === "linkedin" || type === "github" ? type : link.type === "portfolio" ? "portfolio" : null;
    if (slot && PERSONAL_LINK_TYPES.has(slot) && !personalLinks[slot] && known) personalLinks[slot] = known.url;
    else if (known && type !== "repository") otherLinks.push({ url: known.url, label: link.label });
  });
  // LinkedIn and GitHub profiles found in the file but missing from the AI's answer are added.
  for (const [, link] of deterministic) {
    const type = classifyUrl(link.url);
    if ((type === "linkedin" || type === "github") && !personalLinks[type]) {
      personalLinks[type] = link.url;
      overrides.push({ field: `personal.${type}`, aiValue: null, value: link.url, source: link.source });
      flags.push({
        path: `personal.${type}`,
        issue: "added_from_text",
        message: "Found in the CV's links.",
        value: link.url,
      });
    }
  }
  if (!personalLinks.portfolio) {
    const portfolio = context.reference.personal.links.find((l) => l.type === "portfolio");
    if (portfolio) {
      personalLinks.portfolio = portfolio.url;
      overrides.push({ field: "personal.portfolio", aiValue: null, value: portfolio.url, source: "text" });
      flags.push({
        path: "personal.portfolio",
        issue: "added_from_text",
        message: "Found in the CV's header.",
        value: portfolio.url,
      });
    }
  }

  requireValue("personal.fullName", p.fullName, "Name");
  ground("personal.fullName", p.fullName);
  ground("personal.city", p.city);
  p.otherDetails.forEach((d, i) => ground(`personal.otherDetails.${i}`, d.value));
  ground("headline", parsed.headline);
  ground("summary", parsed.summary);

  // ---- Experience
  const experience: CvDraft["experience"] = parsed.experience.map((role, i) => {
    const path = `experience.${i}`;
    requireValue(`${path}.company`, role.company, "Company");
    requireValue(`${path}.title`, role.title, "Job title");
    ground(`${path}.company`, role.company);
    ground(`${path}.title`, role.title);
    const isCurrent = role.isCurrent || (role.end ? isPresentWord(role.end) : false);
    const startDate = parseDate(`${path}.startDate`, role.start);
    const endDate = isCurrent ? null : parseDate(`${path}.endDate`, role.end);
    if (!role.start) flags.push({ path: `${path}.startDate`, issue: "empty_field", message: "Start date is missing." });
    checkOrder(`${path}.startDate`, startDate, endDate);
    role.technologies.forEach((t, j) => ground(`${path}.technologies.${j}`, t, "skill"));
    return {
      company: role.company.trim(),
      title: role.title.trim(),
      employmentType: role.employmentType,
      location: role.location,
      workMode: role.workMode,
      startDate,
      endDate,
      isCurrent,
      durationMonths: startDate ? monthsBetween(startDate, endDate ?? currentMonth) : null,
      domain: role.domain,
      teamSize: role.teamSize,
      bullets: role.bullets.map((b, j) => {
        ground(`${path}.bullets.${j}`, b.text);
        return { id: "", text: b.text.trim(), kind: b.kind, hasMetric: hasMetric(b.text) };
      }),
      technologies: role.technologies,
      technologiesEvidenceId: null,
      sourceQuote: role.sourceQuote,
    };
  });

  // ---- Projects
  const projects: CvDraft["projects"] = parsed.projects.map((project, i) => {
    const path = `projects.${i}`;
    ground(`${path}.name`, project.name);
    ground(`${path}.description`, project.description);
    project.technologies.forEach((t, j) => ground(`${path}.technologies.${j}`, t, "skill"));
    const links = project.links.map(normalizeUrl);
    links.forEach((url, j) => {
      if (!deterministic.has(canonicalUrl(url))) {
        checked++;
        notFound++;
        flags.push({
          path: `${path}.links.${j}`,
          issue: "not_found_in_cv",
          message: "This link isn't in the CV.",
          value: url,
        });
      }
    });
    const startDate = parseDate(`${path}.startDate`, project.start);
    const endDate = parseDate(`${path}.endDate`, project.end);
    checkOrder(`${path}.startDate`, startDate, endDate);
    return {
      name: project.name.trim(),
      role: project.role,
      description: project.description,
      technologies: project.technologies,
      links,
      startDate,
      endDate,
      bullets: project.bullets.map((b, j) => {
        ground(`${path}.bullets.${j}`, b.text);
        return { id: "", text: b.text.trim(), kind: b.kind, hasMetric: hasMetric(b.text) };
      }),
      sourceQuote: project.sourceQuote,
    };
  });

  // ---- Education and certifications
  const education: CvDraft["education"] = parsed.education.map((degree, i) => {
    const path = `education.${i}`;
    requireValue(`${path}.institution`, degree.institution, "Institution");
    ground(`${path}.institution`, degree.institution);
    ground(`${path}.degree`, degree.degree);
    ground(`${path}.field`, degree.field);
    ground(`${path}.grade`, degree.grade);
    const startDate = parseDate(`${path}.startDate`, degree.start);
    const endDate = parseDate(`${path}.endDate`, degree.end);
    checkOrder(`${path}.startDate`, startDate, endDate);
    return {
      evidenceId: "",
      institution: degree.institution.trim(),
      degree: degree.degree.trim(),
      field: degree.field,
      location: degree.location,
      startDate,
      endDate,
      grade: degree.grade,
      sourceQuote: degree.sourceQuote,
    };
  });

  const certifications: CvDraft["certifications"] = parsed.certifications.map((cert, i) => {
    const path = `certifications.${i}`;
    ground(`${path}.name`, cert.name);
    ground(`${path}.issuer`, cert.issuer);
    ground(`${path}.credentialId`, cert.credentialId);
    return {
      evidenceId: "",
      name: cert.name.trim(),
      issuer: cert.issuer,
      issueDate: parseDate(`${path}.issueDate`, cert.issueDate),
      expiryDate: parseDate(`${path}.expiryDate`, cert.expiryDate),
      credentialId: cert.credentialId,
      url: cert.url ? normalizeUrl(cert.url) : null,
      sourceQuote: cert.sourceQuote,
    };
  });

  // ---- Skills and other sections
  const explicit = parsed.skills.explicit.map((s, i) => {
    ground(`skills.explicit.${i}`, s.name, "skill");
    return { name: s.name.trim(), category: s.category, evidenceIds: [] as string[] };
  });
  const inferred = parsed.skills.inferred.map((s, i) => {
    ground(`skills.inferred.${i}`, s.name, "skill");
    return { name: s.name.trim(), evidenceIds: [] as string[], evidenceQuote: s.evidenceQuote };
  });
  parsed.skills.soft.forEach((s, i) => ground(`skills.soft.${i}`, s, "skill"));
  parsed.otherSections.forEach((section, i) =>
    section.items.forEach((item, j) => ground(`otherSections.${i}.items.${j}`, item)),
  );
  const js = parsed.jobSearch;
  ground("jobSearch.noticePeriod", js.noticePeriod);
  ground("jobSearch.currentCtc", js.currentCtc);
  ground("jobSearch.expectedCtc", js.expectedCtc);

  const draftWithoutTotals: Omit<CvDraft, "computed"> = {
    version: 1,
    personal: {
      fullName: p.fullName?.trim() || null,
      email,
      phone,
      city: p.city,
      state: p.state,
      country: p.country,
      ...personalLinks,
      otherLinks,
      otherDetails: p.otherDetails,
    },
    headline: parsed.headline,
    summary: parsed.summary,
    experience,
    projects,
    education,
    certifications,
    skills: { explicit, inferred, soft: parsed.skills.soft },
    otherSections: parsed.otherSections,
    jobSearch: js,
  };

  const evidence = buildEvidenceCatalog(draftWithoutTotals, {
    isGrounded: (text) => index.found(text) || index.skillFound(text),
    pageOf: pageLocator(extracted.kind === "pdf" ? extracted.pages : []),
  });

  // ---- Experience totals (code computes; overlapping roles count once).
  const intervals = experience
    .filter((r) => r.startDate)
    .map((r) => ({
      start: r.startDate!,
      end: r.endDate,
      label: `${r.title} at ${r.company}`,
      internship: r.employmentType === "internship",
    }));
  const totals = experienceTotals(intervals, now);
  const professional = experienceTotals(
    intervals.filter((r) => !r.internship),
    now,
  );
  const draft: CvDraft = {
    ...draftWithoutTotals,
    computed: {
      totalExperienceMonths: totals.totalMonths,
      professionalExperienceMonths: professional.totalMonths,
      gaps: totals.gaps,
      overlaps: totals.overlaps,
    },
  };

  // ---- Completeness: every detected section has content, and counts are not below the text-based parse.
  const sectionChecks: SectionCheck[] = [];
  const incomplete = new Set<SecondPassSection>();
  for (const section of context.sections) {
    const got = countSection(parsed, section.kind);
    if (!got || sectionChecks.some((c) => c.kind === section.kind)) continue;
    const want = countSection(context.reference, section.kind)!;
    const entriesShort = got.entries < want.entries;
    const bulletsShort = want.bullets > 0 && got.bullets < Math.ceil(want.bullets * 0.9);
    const empty = got.entries === 0;
    const complete = !empty && !entriesShort && !bulletsShort;
    sectionChecks.push({
      kind: section.kind,
      heading: section.heading,
      extracted: got.entries + got.bullets,
      expected: want.entries + want.bullets || null,
      complete,
    });
    if (!complete) {
      flags.push({
        path: section.kind,
        issue: "section_incomplete",
        message: empty
          ? `The "${section.heading}" section wasn't extracted.`
          : `Fewer items than the CV shows (${got.entries + got.bullets} of ${want.entries + want.bullets}).`,
      });
      if ((SECOND_PASS_SECTIONS as readonly string[]).includes(section.kind)) {
        incomplete.add(section.kind as SecondPassSection);
      }
    }
  }

  return {
    draft,
    evidence,
    report: {
      version: 1,
      grounding: { checked, notFound, threshold: GROUNDING_THRESHOLD },
      overrides,
      completeness: {
        sections: sectionChecks,
        secondPass: context.secondPass ?? { requested: [], improved: [] },
      },
      flags,
    },
    incompleteSections: [...incomplete],
  };
}
