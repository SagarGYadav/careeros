// Deterministic CV parser. It is the mock AI's answer (so the whole pipeline runs without API keys), the no-AI
// fallback when every provider is unavailable (SPEC §8.1), and the text-based reference the completeness check
// compares the AI's answer with. It copies text as written and never guesses beyond simple layout rules.
import { findDateRange, findDates, type DateRange } from "./dates";
import type { CvLink } from "./extract-text";
import { canonicalUrl, classifyUrl, findEmails, findPhones, findUrls, normalizeUrl } from "./regex";
import { detectSections, sectionsOf, type CvSection } from "./sections";
import { emptyParsedCv, type ParsedCv } from "./schema";
import { skillKey } from "@/lib/skills/normalize";
import { bulletKind, mergeContinuationLines, splitFields, splitLines, splitList, stripBullet, wordCount } from "./text";

export type HeuristicInput = { text: string; links?: CvLink[] };

type Experience = ParsedCv["experience"][number];
type Project = ParsedCv["projects"][number];
type Education = ParsedCv["education"][number];
type Certification = ParsedCv["certifications"][number];

const TITLE_WORDS =
  /\b(developer|engineer|manager|intern|designer|analyst|lead|architect|consultant|scientist|specialist|administrator|tester|programmer|director|head|officer|associate|executive|trainee|founder|co-founder|cto|ceo|sde|swe|devops|qa|owner|coordinator|researcher|fellow|apprentice)\b/i;
const TECH_LABEL =
  /^(technologies|technology|tech stack|tech|tools|stack|environment|skills used|built with|key skills)\s*[:–—-]\s*/i;
const CONTRIBUTIONS = /^(.+?)\s+[—–-]\s+(?:key\s+)?(contributions|achievements|responsibilities|highlights)$/i;
const ACTION_START =
  /^(built|developed|designed|implemented|created|led|managed|wrote|added|migrated|improved|reduced|worked|fixed|introduced|owned?|ran|moved|mentored|integrated|cut|shipped|launched|published|caches|scores|works|visualises|visualizes|used|maintained|optimi[sz]ed|automated|collaborated|delivered|set up|configured|tested|deployed|researched|analy[sz]ed|supported|handled|contributed|helped)\b/i;

// ---------------------------------------------------------------------------------------------------------------
// Small classifiers

function clean(token: string): string {
  return token.replace(/^[\s·|•,;:–—-]+|[\s·|•,;:–—-]+$/g, "").trim();
}

function employmentTypeOf(token: string): Experience["employmentType"] {
  const t = token.toLowerCase().replace(/[()]/g, "").trim();
  if (/^(full[\s-]?time|permanent|fte)$/.test(t)) return "full_time";
  if (/^part[\s-]?time$/.test(t)) return "part_time";
  if (/^(contract|contractor|contractual|c2h)$/.test(t)) return "contract";
  if (/^(intern|internship|summer internship)$/.test(t)) return "internship";
  if (/^(freelance|freelancer|self[\s-]employed)$/.test(t)) return "freelance";
  if (/^(temporary|temp|seasonal)$/.test(t)) return "temporary";
  return null;
}

function workModeOf(token: string): Experience["workMode"] {
  const t = token.toLowerCase().replace(/[()]/g, "").trim();
  if (t === "remote" || t === "work from home" || t === "wfh") return "remote";
  if (t === "hybrid") return "hybrid";
  if (/^(on[\s-]?site|in[\s-]?office|office)$/.test(t)) return "onsite";
  return null;
}

const COUNTRIES = new Set([
  "india", "united states", "usa", "us", "united kingdom", "uk", "canada", "germany", "singapore", "uae",
  "united arab emirates", "australia", "netherlands", "ireland", "france", "japan", "new zealand", "sweden",
  "switzerland", "spain", "italy", "poland", "portugal", "belgium", "denmark", "norway", "finland", "austria",
]); // prettier-ignore

const INDIAN_STATES = new Set([
  "andhra pradesh", "arunachal pradesh", "assam", "bihar", "chhattisgarh", "goa", "gujarat", "haryana",
  "himachal pradesh", "jharkhand", "karnataka", "kerala", "madhya pradesh", "maharashtra", "manipur", "meghalaya",
  "mizoram", "nagaland", "odisha", "punjab", "rajasthan", "sikkim", "tamil nadu", "telangana", "tripura",
  "uttar pradesh", "uttarakhand", "west bengal", "delhi", "new delhi", "jammu and kashmir", "ladakh", "puducherry",
  "chandigarh",
]); // prettier-ignore

type Place = { city: string | null; state: string | null; country: string | null };

/** "Pune, Maharashtra, India" → city, state, country. Needs at least two parts unless `labelled`. */
function parseLocation(text: string, labelled = false): Place | null {
  const parts = text
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  if (!parts.length || parts.length > 4 || (parts.length < 2 && !labelled)) return null;
  if (parts.some((p) => !/^\p{L}[\p{L} .'-]*$/u.test(p) || wordCount(p) > 3)) return null;
  if (TITLE_WORDS.test(text)) return null;
  const place: Place = { city: null, state: null, country: null };
  if (COUNTRIES.has(parts.at(-1)!.toLowerCase())) place.country = parts.pop()!;
  if (parts.length >= 2) place.state = parts.pop()!;
  else if (parts.length === 1 && INDIAN_STATES.has(parts[0].toLowerCase()) && place.country) place.state = parts.pop()!;
  if (parts.length) place.city = parts.join(", ");
  const knownState = Boolean(place.state && INDIAN_STATES.has(place.state.toLowerCase()));
  if (!place.country && knownState) place.country = "India";
  // Without a known country or state, "React, Next.js" would look like a place: only trust labelled values then.
  if (!labelled && !place.country && !knownState) return null;
  return place;
}

/** A comma/dot-separated list of short items, like "React, Vite, IndexedDB" (not a sentence). */
function isListLine(line: string): boolean {
  const items = splitList(line).filter((item) => !findUrls(item).length);
  if (items.length < 2 || /[.!?]$/.test(line.trim())) return false;
  return items.every((item) => wordCount(item) <= 4 && !/[.!?]$/.test(item));
}

function startsWithAction(line: string): boolean {
  return ACTION_START.test(line) || /^\p{L}+ed\b/u.test(line);
}

function sourceQuote(lines: string[]): string {
  return lines.filter(Boolean).join("\n");
}

// ---------------------------------------------------------------------------------------------------------------
// Header: name, headline, contact details, links

const CONTACT_LABEL =
  /^(e-?mail|email id|phone|mobile|mob|tel|telephone|contact|location|address|links?|linkedin|github|portfolio|website)\b\s*[:.-]?\s*/i;
const LINK_LABELS =
  /^(linkedin|github|gitlab|portfolio|website|blog|twitter|x|resume|cv|profile|linkedin profile|github profile|personal website)$/i;
const PERSONAL_DETAIL =
  /^(date of birth|d\.?o\.?b\.?|birth date|nationality|gender|sex|marital status|languages known|father'?s name|mother'?s name|religion|place of birth|passport(?: no\.?| number)?|permanent address)\b\s*[:.\-–]?\s*(.+)$/i;

function isNameLine(line: string): boolean {
  if (/[@\d/:|•·\t,]/.test(line) || TITLE_WORDS.test(line)) return false;
  const words = wordCount(line);
  return words >= 1 && words <= 5 && /^\p{L}[\p{L} .'-]+$/u.test(line);
}

function titleCaseIfShouting(name: string): string {
  return name === name.toUpperCase() ? name.toLowerCase().replace(/(^|[\s'-])\p{L}/gu, (c) => c.toUpperCase()) : name;
}

function isContactLine(line: string): boolean {
  if (findEmails(line).length || findPhones(line).length || findUrls(line).length) return true;
  if (CONTACT_LABEL.test(line)) return true;
  const tokens = line.split(/\s*[|·•,]\s*|\t/).filter(Boolean);
  if (tokens.length && tokens.every((t) => LINK_LABELS.test(t.trim()))) return true;
  return parseLocation(line) !== null;
}

function parseHeader(headerLines: string[], contactLines: string[], allText: string) {
  const lines = mergeContinuationLines(headerLines);
  const personal = emptyParsedCv().personal;
  let headline: string | null = null;

  const nameIndex = lines.findIndex(isNameLine);
  if (nameIndex >= 0) personal.fullName = titleCaseIfShouting(lines[nameIndex]);
  for (const line of lines.slice(nameIndex + 1)) {
    if (!isContactLine(line) && !PERSONAL_DETAIL.test(line) && wordCount(line) <= 15) {
      headline = line;
      break;
    }
  }

  const contactText = [...lines, ...mergeContinuationLines(contactLines)].join("\n");
  personal.email = findEmails(contactText)[0] ?? findEmails(allText)[0] ?? null;
  personal.phone = findPhones(contactText)[0] ?? null;

  const tokens = [...lines, ...contactLines].flatMap((line) => splitFields(line).flatMap((f) => f.split(/\s+\|\s+/)));
  for (let i = 0; i < tokens.length && !personal.city && !personal.country; i++) {
    const labelled = /^(location|address|city)\s*[:.-]?\s*$/i.test(tokens[i - 1] ?? "");
    const value = tokens[i].replace(/^(location|address|city)\s*[:.-]\s*/i, "");
    const place = parseLocation(value, labelled || value !== tokens[i]);
    if (place) Object.assign(personal, place);
  }

  for (const line of [...lines, ...contactLines]) {
    const detail = line.replace(/\t/g, " ").match(PERSONAL_DETAIL);
    if (detail) personal.otherDetails.push({ label: line.split(/[\t:]/)[0].trim(), value: detail[2].trim() });
  }

  return { personal, headline, contactText };
}

/** Personal links: annotations and URLs in the header; repository links belong to projects. */
function personalLinks(contactText: string, links: CvLink[], projectText: string): ParsedCv["personal"]["links"] {
  const out: ParsedCv["personal"]["links"] = [];
  const seen = new Set<string>();
  const add = (url: string, label: string | null) => {
    const normalized = normalizeUrl(url);
    const type = classifyUrl(normalized);
    if (type === "email" || type === "phone" || type === "repository" || seen.has(canonicalUrl(normalized))) return;
    seen.add(canonicalUrl(normalized));
    out.push({
      type: type === "linkedin" || type === "github" || type === "portfolio" ? type : "other",
      url: normalized,
      label,
    });
  };
  for (const link of links) {
    if (link.text && projectText.includes(link.text)) continue;
    add(link.url, link.text);
  }
  for (const url of findUrls(contactText)) add(url, null);
  // Only the first personal site counts as the portfolio; later ones are other links.
  let portfolioSeen = false;
  return out.map((link) => {
    if (link.type !== "portfolio") return link;
    if (portfolioSeen) return { ...link, type: "other" as const };
    portfolioSeen = true;
    return link;
  });
}

// ---------------------------------------------------------------------------------------------------------------
// Experience

function splitTitleCompany(text: string): { title: string; company: string } {
  const separators: [RegExp, "ordered" | "either"][] = [
    [/\s+[—–]\s+/, "either"],
    [/\s+\|\s+/, "either"],
    [/\t/, "either"],
    [/\s+@\s+/, "ordered"],
    [/\s+at\s+/i, "ordered"],
    [/,\s+/, "either"],
    [/\s+-\s+/, "either"],
  ];
  for (const [separator, mode] of separators) {
    const match = separator.exec(text);
    if (!match || match.index === 0) continue;
    const a = clean(text.slice(0, match.index));
    const b = clean(text.slice(match.index + match[0].length));
    if (!a || !b) continue;
    if (mode === "ordered") return { title: a, company: b };
    return TITLE_WORDS.test(b) && !TITLE_WORDS.test(a) ? { title: b, company: a } : { title: a, company: b };
  }
  return TITLE_WORDS.test(text) ? { title: clean(text), company: "" } : { title: "", company: clean(text) };
}

type Meta = Pick<Experience, "employmentType" | "workMode" | "location"> & { leftover: string[] };

function parseMeta(text: string): Meta {
  const meta: Meta = { employmentType: null, workMode: null, location: null, leftover: [] };
  const places: string[] = [];
  for (const field of splitFields(text).map(clean).filter(Boolean)) {
    // "Full-time, Remote" holds two facts.
    const parts = field.split(/\s*,\s*/);
    const known = parts.every((p) => employmentTypeOf(p) || workModeOf(p));
    for (const part of known ? parts : [field]) {
      const type = employmentTypeOf(part);
      const mode = workModeOf(part);
      if (type) meta.employmentType = type;
      else if (mode) meta.workMode = mode;
      else if (TITLE_WORDS.test(part) || /\s[—–]\s/.test(part)) meta.leftover.push(part);
      else places.push(part.replace(/^\(|\)$/g, ""));
    }
  }
  meta.location = places.length ? places.join(", ") : null;
  return meta;
}

function withoutRange(line: string, range: DateRange): string {
  return clean(line.slice(0, range.index) + " " + line.slice(range.index + range.raw.length));
}

function newExperience(header: string, title: string, company: string, range: DateRange | null, meta?: Meta) {
  return {
    company,
    title,
    employmentType: meta?.employmentType ?? null,
    location: meta?.location ?? null,
    workMode: meta?.workMode ?? null,
    start: range?.start ?? null,
    end: range?.end ?? null,
    isCurrent: range?.isCurrent ?? false,
    domain: null,
    teamSize: null,
    bullets: [],
    technologies: [],
    sourceQuote: header,
  } satisfies Experience as Experience;
}

const COLUMN_WORDS: Record<string, RegExp> = {
  company: /^(company|company name|organi[sz]ation|employer|firm)$/i,
  title: /^(role|title|job title|designation|position)$/i,
  dates: /^(duration|dates?|period|tenure|from\s*-\s*to|years?|timeline)$/i,
  location: /^(location|city|place)$/i,
};

function tableColumns(line: string): string[] | null {
  const cells = line.split("\t").map((c) => c.trim());
  if (cells.length < 3) return null;
  const kinds = cells.map((cell) => Object.keys(COLUMN_WORDS).find((k) => COLUMN_WORDS[k].test(cell)) ?? "");
  return kinds.filter(Boolean).length >= 3 ? kinds : null;
}

function teamSizeOf(bullets: string[]): number | null {
  for (const bullet of bullets) {
    const m = bullet.match(/\b(?:led|managed|leading|managing)\s+a\s+team\s+of\s+(\d{1,3})\b/i);
    if (m) return Number(m[1]);
  }
  return null;
}

function parseExperience(rawLines: string[]): Experience[] {
  const lines = mergeContinuationLines(rawLines.map(stripBullet).filter(Boolean));
  const entries: Experience[] = [];
  let current: Experience | null = null;
  let columns: string[] | null = null;

  // A line is a header when the next line holds only dates and place/type ("Bengaluru · Full-time · Apr 2023 – Present").
  const isMetaOnly = (line: string | undefined) => {
    if (!line || TECH_LABEL.test(line)) return false;
    const range = findDateRange(line);
    if (!range) return false;
    const rest = withoutRange(line, range);
    // "Led the migration from 2019 to 2021" has a date range but is a bullet.
    if (wordCount(rest) > 6 || startsWithAction(rest)) return false;
    return parseMeta(rest).leftover.length === 0;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    const header = tableColumns(line);
    if (header) {
      columns = header;
      continue;
    }
    if (columns && line.includes("\t") && findDateRange(line)) {
      const cells = line.split("\t").map((c) => c.trim());
      const cell = (kind: string) => cells[columns!.indexOf(kind)] ?? "";
      const range = findDateRange(cell("dates")) ?? findDateRange(line);
      const entry = newExperience(line, cell("title"), cell("company"), range);
      entry.location = cell("location") || null;
      entries.push(entry);
      current = null;
      continue;
    }
    columns = null;

    const contributions = line.match(CONTRIBUTIONS);
    if (contributions) {
      const company = clean(contributions[1]);
      current = entries.find((e) => e.company.toLowerCase() === company.toLowerCase()) ?? null;
      if (!current) {
        current = newExperience(line, "", company, null);
        entries.push(current);
      }
      continue;
    }

    if (TECH_LABEL.test(line)) {
      if (current) current.technologies.push(...splitList(line.replace(TECH_LABEL, "")));
      continue;
    }

    if (isMetaOnly(lines[i + 1]) && !isMetaOnly(line)) {
      const metaLine = lines[i + 1];
      const range = findDateRange(metaLine)!;
      const { title, company } = splitTitleCompany(line);
      current = newExperience(
        sourceQuote([line, metaLine]),
        title,
        company,
        range,
        parseMeta(withoutRange(metaLine, range)),
      );
      entries.push(current);
      i++;
      continue;
    }

    const range = findDateRange(line);
    if (range) {
      // Title, company and dates on one line: "Frontend Developer, Kestrel Pay | Apr 2023 – Present".
      const meta = parseMeta(withoutRange(line, range));
      if (meta.leftover.length) {
        const { title, company } = splitTitleCompany(meta.leftover.join(" — "));
        current = newExperience(line, title, company, range, { ...meta, leftover: [] });
        entries.push(current);
        continue;
      }
    }

    if (current) current.bullets.push({ text: line, kind: bulletKind(line) });
  }

  for (const entry of entries) entry.teamSize = teamSizeOf(entry.bullets.map((b) => b.text));
  return entries;
}

// ---------------------------------------------------------------------------------------------------------------
// Projects

function parseProjects(rawLines: string[], links: CvLink[]): Project[] {
  const lines = mergeContinuationLines(rawLines.map(stripBullet).filter(Boolean));
  const projects: Project[] = [];
  let current: Project | null = null;

  for (const line of lines) {
    const urls = findUrls(line);
    if (current && (TECH_LABEL.test(line) || isListLine(line))) {
      const items = splitList(line.replace(TECH_LABEL, "")).filter((item) => !findUrls(item).length);
      current.technologies.push(...items);
      current.links.push(...urls);
      continue;
    }
    const isHeader =
      wordCount(line) <= 7 && !/[.!?]$/.test(line) && /^[\p{Lu}\d]/u.test(line) && !startsWithAction(line);
    if (isHeader) {
      const fields = splitFields(line.replace(/\s+[—–]\s+/g, " · "));
      const range = findDateRange(line);
      current = {
        name: clean(fields[0] ?? line),
        role: fields.slice(1).find((f) => TITLE_WORDS.test(f)) ?? null,
        description: null,
        technologies: [],
        links: urls,
        start: range?.start ?? null,
        end: range?.end ?? null,
        bullets: [],
        sourceQuote: line,
      };
      projects.push(current);
      continue;
    }
    if (!current) continue;
    if (!current.description) current.description = line;
    else current.bullets.push({ text: line, kind: bulletKind(line) });
  }

  // Linked project names ("Monsoon Weather" pointing at its repository).
  for (const project of projects) {
    for (const link of links) {
      if (link.text && link.text.trim() === project.name) project.links.push(normalizeUrl(link.url));
    }
    project.links = [...new Set(project.links)];
  }
  return projects;
}

// ---------------------------------------------------------------------------------------------------------------
// Education

const DEGREE_LONG =
  /\b(b\.?\s?tech|m\.?\s?tech|b\.?\s?sc|m\.?\s?sc|b\.?\s?com|m\.?\s?com|bca|mca|mba|pgdm|bba|b\.?\s?arch|b\.?\s?des|m\.?\s?des|ph\.?\s?d|bachelor(?:'s)?|master(?:'s)?|diploma|doctorate|associate degree|hsc|ssc|higher secondary|senior secondary|secondary school|class\s+(?:x|xii|10|12)(?:th)?|10th|12th|intermediate|matriculation|llb|mbbs|b\.?\s?pharm)\b\.?/i;
const DEGREE_SHORT = /(?:^|[\s(])((?:B|M)\.\s?(?:E|A|S)\.?|BE|ME|BS|MS|BA|MA)(?=$|[\s(,])/;
const INSTITUTION_WORDS =
  /\b(universit(y|é)|college|institute|institution|school|academy|iit|nit|iiit|bits|polytechnic|vidyalaya|vidyapeeth|campus)\b/i;
const GRADE_RE =
  /(\d+(?:\.\d+)?\s*(?:\/\s*\d+(?:\.\d+)?)?\s*(?:cgpa|gpa|cpi|sgpa|%|percent|percentage))|((?:cgpa|gpa|cpi|percentage|score|grade|marks)\s*[:-]?\s*\d+(?:\.\d+)?(?:\s*\/\s*\d+)?\s*%?)|(first class(?: with distinction)?|distinction)/i;

function degreeMatch(text: string): string | null {
  return text.match(DEGREE_LONG)?.[0] ?? text.match(DEGREE_SHORT)?.[1] ?? null;
}

function splitDegree(token: string): { degree: string; field: string | null } {
  const paren = token.match(/^(.*?)\s*\(([^)]+)\)\s*$/);
  if (paren && degreeMatch(paren[1])) return { degree: clean(paren[1]), field: clean(paren[2]) };
  const inField = token.match(/^(.+?)\s+in\s+(.+)$/i);
  if (inField && degreeMatch(inField[1])) return { degree: clean(inField[1]), field: clean(inField[2]) };
  const keyword = degreeMatch(token);
  if (keyword && token.trim().startsWith(keyword) && !/^(bachelor|master|diploma)/i.test(keyword)) {
    const rest = clean(token.trim().slice(keyword.length));
    return { degree: keyword.trim(), field: rest || null };
  }
  return { degree: clean(token), field: null };
}

const EDUCATION_COLUMNS: Record<string, RegExp> = {
  degree: /^(degree|qualification|course|programme|program|class|standard)$/i,
  institution: /^(institution|institute|university|college|school|board|board\/university)$/i,
  dates: /^(years?|duration|dates?|period|passing year|year of passing)$/i,
  grade: /^(score|grade|cgpa|gpa|percentage|marks|result)$/i,
};

function educationFromTokens(tokens: string[], quote: string): Education {
  const entry: Education = {
    institution: "",
    degree: "",
    field: null,
    location: null,
    start: null,
    end: null,
    grade: null,
    sourceQuote: quote,
  };
  const rest: string[] = [];
  for (const token of tokens) {
    const range = findDateRange(token);
    const grade = token.match(GRADE_RE);
    if (range && !entry.start) {
      entry.start = range.start;
      entry.end = range.end;
    } else if (grade && !entry.grade && wordCount(token) <= 4) {
      entry.grade = clean(token);
    } else if (!entry.degree && degreeMatch(token)) {
      Object.assign(entry, splitDegree(token));
    } else if (!entry.end && findDates(token).length && wordCount(token) <= 3) {
      entry.end = findDates(token).at(-1)!;
    } else rest.push(token);
  }
  const institutionIndex = rest.findIndex((t) => INSTITUTION_WORDS.test(t));
  const index = institutionIndex >= 0 ? institutionIndex : 0;
  if (rest[index]) entry.institution = rest.splice(index, 1)[0];
  if (rest.length) entry.location = rest.join(", ");
  return entry;
}

function parseEducation(rawLines: string[]): Education[] {
  const lines = mergeContinuationLines(rawLines.map(stripBullet).filter(Boolean));
  const entries: Education[] = [];
  let columns: string[] | null = null;
  let group: string[] = [];

  const flush = () => {
    if (!group.length) return;
    const tokens = group.flatMap((line) => {
      const fields = splitFields(line);
      return fields.length === 1 && (line.match(/,/g)?.length ?? 0) >= 2 ? line.split(/\s*,\s*/) : fields;
    });
    entries.push(educationFromTokens(tokens.map(clean).filter(Boolean), sourceQuote(group)));
    group = [];
  };

  for (const line of lines) {
    const cells = line.split("\t").map((c) => c.trim());
    const kinds = cells.map((c) => Object.keys(EDUCATION_COLUMNS).find((k) => EDUCATION_COLUMNS[k].test(c)) ?? "");
    if (cells.length >= 3 && kinds.filter(Boolean).length >= 3) {
      flush();
      columns = kinds;
      continue;
    }
    if (columns && cells.length >= 2) {
      flush();
      const entry = educationFromTokens(cells, line);
      const at = (kind: string) => cells[columns!.indexOf(kind)];
      if (at("institution")) entry.institution = at("institution");
      if (at("degree")) Object.assign(entry, splitDegree(at("degree")));
      entries.push(entry);
      continue;
    }
    columns = null;
    const hasDegree = Boolean(degreeMatch(line));
    const groupHasDegree = group.some((l) => degreeMatch(l));
    if (hasDegree && groupHasDegree) flush();
    group.push(line);
  }
  flush();
  return entries.filter((e) => e.degree || e.institution);
}

// ---------------------------------------------------------------------------------------------------------------
// Certifications, awards and other list sections

/** Joins wrapped entries in sections where each entry ends with a year ("…Amazon Web" + "Services, May 2023"). */
function joinUntilYear(lines: string[]): string[] {
  const out: string[] = [];
  let pending: string[] = [];
  for (const line of lines) {
    pending.push(line);
    const joined = pending.join(" ");
    if (/\b(19|20)\d{2}\b/.test(joined) || pending.length >= 4) {
      out.push(joined);
      pending = [];
    }
  }
  // No year anywhere: each line is its own entry.
  if (pending.length) out.push(...pending);
  return out;
}

function parseCertifications(rawLines: string[]): Certification[] {
  const lines = joinUntilYear(mergeContinuationLines(rawLines.map(stripBullet).filter(Boolean)));
  return lines.map((line) => {
    const urls = findUrls(line);
    let rest = line;
    for (const url of urls)
      rest = rest.replace(new RegExp(url.replace(/^https:\/\//, "").replace(/[.*+?^${}()|[\]\\/]/g, "\\$&"), "i"), "");
    const credential = rest.match(
      /\(?\b(?:credential\s*id|cert(?:ificate)?\s*(?:id|no\.?)|license|licence|id)\s*[:#]?\s*([A-Z0-9][A-Z0-9-]{3,})\)?/i,
    );
    if (credential) rest = rest.replace(credential[0], "");
    const [name, ...issuerParts] = rest.split(/\s+—\s+|\s+\|\s+/);
    let issuerText = issuerParts.join(" ");
    let issueDate: string | null = null;
    let expiryDate: string | null = null;
    const range = findDateRange(issuerText || name);
    if (range) {
      issueDate = range.start;
      expiryDate = range.end;
      issuerText = issuerText.replace(range.raw, "");
    } else {
      const dates = findDates(issuerText || name);
      issueDate = dates.at(-1) ?? null;
      if (issueDate) issuerText = issuerText.replace(issueDate, "");
    }
    const cleanName = clean(issuerParts.length ? name : issueDate ? name.replace(issueDate, "") : name);
    return {
      name: cleanName.replace(/,\s*$/, ""),
      issuer: clean(issuerText.replace(/\b(issued|expires?|valid until)\b/gi, "")) || null,
      issueDate,
      expiryDate,
      credentialId: credential?.[1] ?? null,
      url: urls[0] ?? null,
      sourceQuote: line,
    };
  });
}

const OTHER_KIND: Partial<Record<CvSection["kind"], ParsedCv["otherSections"][number]["kind"]>> = {
  awards: "awards",
  publications: "publications",
  volunteering: "volunteering",
  languages: "languages",
  interests: "interests",
};

function parseOtherSection(section: CvSection): ParsedCv["otherSections"][number] {
  const lines = mergeContinuationLines(section.lines.map(stripBullet).filter(Boolean));
  const listLike = section.kind === "languages" || section.kind === "interests";
  const items =
    section.kind === "awards" ? joinUntilYear(lines) : listLike ? lines.flatMap((line) => splitList(line)) : lines;
  return { kind: OTHER_KIND[section.kind] ?? "other", heading: section.heading, items };
}

// ---------------------------------------------------------------------------------------------------------------
// Skills

function parseSkills(rawLines: string[]): { explicit: ParsedCv["skills"]["explicit"]; soft: string[] } {
  const lines = mergeContinuationLines(rawLines.map(stripBullet).filter(Boolean));
  const explicit: ParsedCv["skills"]["explicit"] = [];
  const soft: string[] = [];
  const seen = new Set<string>();
  const add = (name: string, category: string | null) => {
    const key = skillKey(name);
    if (!key || seen.has(key)) return;
    seen.add(key);
    if (category && /soft|interpersonal|personal skills/i.test(category)) soft.push(name);
    else explicit.push({ name, category });
  };

  let pendingGroup: string | null = null;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const labelled = line.match(/^([^:\t]{2,40}?)\s*(?::|\t)\s*(.+)$/);
    if (labelled) {
      for (const item of splitList(labelled[2])) add(item, labelled[1].trim());
      pendingGroup = null;
      continue;
    }
    if (isListLine(line) || /[,·|•]/.test(line)) {
      for (const item of splitList(line)) add(item, pendingGroup);
      continue;
    }
    // A short line followed by a list is a group heading ("Frontend" then "React, Next.js, …").
    const next = lines[i + 1];
    if (wordCount(line) <= 3 && next && (isListLine(next) || /[,·|•]/.test(next))) {
      pendingGroup = line;
      continue;
    }
    if (wordCount(line) <= 4) add(line.replace(/[.\s]+$/, ""), pendingGroup);
  }
  return { explicit, soft };
}

// ---------------------------------------------------------------------------------------------------------------
// Summary and job-search details

const JOB_SEARCH_KEYS: [keyof ParsedCv["jobSearch"], RegExp][] = [
  ["noticePeriod", /^notice\s*period$/i],
  ["currentCtc", /^current\s*(ctc|salary|compensation|package)$/i],
  ["expectedCtc", /^expected\s*(ctc|salary|compensation|package)$/i],
  ["preferredLocations", /^preferred\s*(job\s*)?locations?$/i],
];

function parseJobSearch(lines: string[]): { jobSearch: ParsedCv["jobSearch"]; usedLines: Set<string> } {
  const jobSearch = emptyParsedCv().jobSearch;
  const usedLines = new Set<string>();
  for (const line of lines) {
    for (const segment of line.split(/\s+\|\s+|\t/)) {
      const m = segment.match(/^\s*([A-Za-z ]{4,30}?)\s*[:–-]\s*(.+)$/);
      if (!m) continue;
      const key = JOB_SEARCH_KEYS.find(([, re]) => re.test(m[1].trim()))?.[0];
      if (!key) continue;
      usedLines.add(line);
      if (key === "preferredLocations") jobSearch.preferredLocations = splitList(m[2]);
      else jobSearch[key] = m[2].trim();
    }
  }
  return { jobSearch, usedLines };
}

// ---------------------------------------------------------------------------------------------------------------

export function parseCvHeuristically(input: HeuristicInput): ParsedCv {
  const links = input.links ?? [];
  const { header, sections } = detectSections(splitLines(input.text));
  const result = emptyParsedCv();
  const linesOf = (kind: CvSection["kind"]) => sectionsOf(sections, kind).flatMap((s) => s.lines);

  const contactLines = linesOf("contact");
  const parsedHeader = parseHeader(header, contactLines, input.text);
  result.personal = parsedHeader.personal;
  result.headline = parsedHeader.headline;

  for (const line of linesOf("personal_details")) {
    const detail = line.replace(/\t/g, " ").match(PERSONAL_DETAIL);
    const pair = line.match(/^([^:\t]{2,40}?)\s*(?::|\t)\s*(.+)$/);
    if (detail) result.personal.otherDetails.push({ label: line.split(/[\t:]/)[0].trim(), value: detail[2].trim() });
    else if (pair) result.personal.otherDetails.push({ label: pair[1].trim(), value: pair[2].trim() });
  }

  const { jobSearch, usedLines } = parseJobSearch(splitLines(input.text));
  result.jobSearch = jobSearch;

  const summaryLines = linesOf("summary").filter((line) => !usedLines.has(line));
  // A short title-like line inside the summary is the headline when the header had none ("Software Engineer – Angular").
  if (!result.headline) {
    const titleLine = summaryLines.find((l) => wordCount(l) <= 8 && !/[.!?]$/.test(l) && TITLE_WORDS.test(l));
    if (titleLine) result.headline = titleLine;
  }
  const summaryText = mergeContinuationLines(summaryLines.filter((l) => l !== result.headline))
    .join(" ")
    .trim();
  result.summary = summaryText || null;

  result.experience = sectionsOf(sections, "experience").flatMap((s) => parseExperience(s.lines));
  const projectSections = sectionsOf(sections, "projects");
  result.projects = projectSections.flatMap((s) => parseProjects(s.lines, links));
  result.education = sectionsOf(sections, "education").flatMap((s) => parseEducation(s.lines));
  result.certifications = sectionsOf(sections, "certifications").flatMap((s) => parseCertifications(s.lines));

  const skills = parseSkills(linesOf("skills"));
  result.skills.explicit = skills.explicit;
  result.skills.soft = skills.soft;

  // Inferred skills: technologies named in roles and projects but missing from the skills section.
  const listed = new Set(skills.explicit.map((s) => skillKey(s.name)));
  const experienceLines = mergeContinuationLines(linesOf("experience").concat(projectSections.flatMap((s) => s.lines)));
  for (const entry of [...result.experience, ...result.projects]) {
    for (const tech of entry.technologies) {
      const key = skillKey(tech);
      if (!key || listed.has(key)) continue;
      listed.add(key);
      const quote = experienceLines.find((l) => l.includes(tech)) ?? tech;
      result.skills.inferred.push({ name: tech, evidenceQuote: quote });
    }
  }

  result.otherSections = sections
    .filter((s) => OTHER_KIND[s.kind] || s.kind === "other" || s.kind === "declaration" || s.kind === "references")
    .map(parseOtherSection);

  const projectText = projectSections.flatMap((s) => s.lines).join("\n");
  result.personal.links = personalLinks(parsedHeader.contactText, links, projectText);
  return result;
}
