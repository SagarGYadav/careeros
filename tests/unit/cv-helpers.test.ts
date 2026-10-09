import { describe, expect, it } from "vitest";
import { experienceTotals, findDateRange, monthsBetween, parseCvDate } from "@/lib/cv/dates";
import { detectCvFileKind, validateCvFile } from "@/lib/cv/files";
import { canonicalUrl, classifyUrl, findEmails, findPhones, findUrls, normalizeUrl, samePhone } from "@/lib/cv/regex";
import { classifyHeading, detectSections } from "@/lib/cv/sections";
import { bestMatchScore, hasMetric, mergeContinuationLines, normalizeForMatch } from "@/lib/cv/text";
import { AppError } from "@/lib/errors";

const NOW = new Date("2026-10-09T10:00:00Z");

describe("CV dates", () => {
  it("reads the common ways CVs write dates", () => {
    expect(parseCvDate("Apr 2023")).toBe("2023-04");
    expect(parseCvDate("September 2021")).toBe("2021-09");
    expect(parseCvDate("Sept. 2021")).toBe("2021-09");
    expect(parseCvDate("04/2023")).toBe("2023-04");
    expect(parseCvDate("2023-04")).toBe("2023-04");
    expect(parseCvDate("Apr '23")).toBe("2023-04");
    expect(parseCvDate("14 March 1997")).toBe("1997-03");
    expect(parseCvDate("2020")).toBe("2020");
    expect(parseCvDate("13/2023")).toBeNull();
    expect(parseCvDate("Present")).toBeNull();
  });

  it("finds date ranges with dashes, 'to' and present-words", () => {
    expect(findDateRange("Bengaluru · Full-time · Apr 2023 – Present")).toMatchObject({
      start: "Apr 2023",
      end: null,
      isCurrent: true,
    });
    expect(findDateRange("Jul 2021 to Mar 2023")).toMatchObject({ start: "Jul 2021", end: "Mar 2023" });
    expect(findDateRange("Anna University 2016–2020 8.1 CGPA")).toMatchObject({ start: "2016", end: "2020" });
    expect(findDateRange("+91 98765 43210")).toBeNull();
  });

  it("counts months inclusively and merges overlapping roles", () => {
    expect(monthsBetween("2021-07", "2023-03")).toBe(21);
    const totals = experienceTotals(
      [
        { start: "2019-01", end: "2020-12", label: "A" },
        { start: "2020-06", end: "2021-06", label: "B" },
        { start: "2022-01", end: null, label: "C" },
      ],
      NOW,
    );
    // A+B merge to Jan 2019 – Jun 2021 (30 months); C is Jan 2022 – Oct 2026 (58 months).
    expect(totals.totalMonths).toBe(88);
    expect(totals.overlaps).toEqual([{ a: "A", b: "B", months: 7 }]);
    expect(totals.gaps).toEqual([{ from: "2021-07", to: "2021-12", months: 6 }]);
  });
});

describe("CV regex extractors", () => {
  it("finds e-mails and phone numbers but not dates or ids", () => {
    const text = "Mail: Ananya.Iyer@Example.com | +91 98765 43210 | 2017 – 2021 | ID AWS-DVA-EX-4821 | 080-41234567";
    expect(findEmails(text)).toEqual(["ananya.iyer@example.com"]);
    expect(findPhones(text)).toEqual(["+91 98765 43210", "080-41234567"]);
    expect(samePhone("+91 98765 43210", "09876543210")).toBe(true);
  });

  it("finds links, including ones the PDF wrapped, but not technology names", () => {
    const text =
      "B.Tech · Next.js · Node.js · ASP.NET · linkedin.com/in/rohan-mehta-\nexample · rohanmehta.example.dev.";
    expect(findUrls(text)).toEqual([
      "https://www.linkedin.com/in/rohan-mehta-example",
      "https://rohanmehta.example.dev",
    ]);
  });

  it("classifies and normalises links", () => {
    expect(classifyUrl("https://www.linkedin.com/in/x")).toBe("linkedin");
    expect(classifyUrl("https://github.com/x")).toBe("github");
    expect(classifyUrl("https://github.com/x/repo")).toBe("repository");
    expect(classifyUrl("https://x.example.dev")).toBe("portfolio");
    expect(classifyUrl("https://www.credly.com/badges/1")).toBe("other");
    expect(classifyUrl("mailto:a@example.com")).toBe("email");
    expect(normalizeUrl("arjundesai.example.dev/")).toBe("https://arjundesai.example.dev");
    expect(canonicalUrl("https://www.linkedin.com/in/x/")).toBe("linkedin.com/in/x");
  });
});

describe("CV text helpers", () => {
  it("joins lines the PDF wrapped, and keeps separate bullets apart", () => {
    expect(
      mergeContinuationLines([
        "Led a team of 3 engineers to build a platform in Next.js",
        "and Node.js.",
        "Mentored 2 junior developers.",
        "Technologies: Next.js, Docker, GitHub",
        "Actions",
        "github.com/rohan-mehta-",
        "example",
      ]),
    ).toEqual([
      "Led a team of 3 engineers to build a platform in Next.js and Node.js.",
      "Mentored 2 junior developers.",
      "Technologies: Next.js, Docker, GitHub Actions",
      "github.com/rohan-mehta-example",
    ]);
  });

  it("recognises measurable results but not version numbers", () => {
    expect(hasMetric("Cut page load time by 38%.")).toBe(true);
    expect(hasMetric("Mentored 2 junior developers.")).toBe(true);
    expect(hasMetric("Improved LCP from 3.9s to 1.6s.")).toBe(true);
    expect(hasMetric("Built policy screens in Angular 12 with RxJS.")).toBe(false);
    expect(hasMetric("Shipped a checkout meeting WCAG 2.1 AA.")).toBe(false);
    expect(hasMetric("Integrated REST APIs for reporting.")).toBe(false);
  });

  it("matches text despite case, dashes and small differences", () => {
    const cv = normalizeForMatch("Frontend Developer — Kestrel Pay\nRebuilt the merchant dashboard in Next.js");
    expect(bestMatchScore(cv, normalizeForMatch("Frontend Developer - Kestrel Pay"))).toBe(1);
    expect(bestMatchScore(cv, normalizeForMatch("Rebuilt the merchant dashbord in Next.js"))).toBeGreaterThan(0.9);
    expect(bestMatchScore(cv, normalizeForMatch("Designed a payments platform in Go"))).toBeLessThan(0.9);
  });
});

describe("CV sections", () => {
  it("maps heading synonyms to sections", () => {
    expect(classifyHeading("WORK EXPERIENCE")).toEqual({ kind: "experience", heading: "WORK EXPERIENCE" });
    expect(classifyHeading("Technical Skills:")).toEqual({ kind: "skills", heading: "Technical Skills" });
    expect(classifyHeading("Awards & Achievements")).toMatchObject({ kind: "awards" });
    expect(classifyHeading("CURRICULUM VITAE")).toBe("title");
    expect(classifyHeading("Languages: JavaScript, TypeScript")).toBeNull();
    expect(classifyHeading("HTML, CSS")).toBeNull();
  });

  it("keeps an all-caps name in the header, not as a section", () => {
    const { header, sections } = detectSections(["PRIYA SHARMA", "priya@example.com", "EXPERIENCE", "Engineer — Acme"]);
    expect(header).toEqual(["PRIYA SHARMA", "priya@example.com"]);
    expect(sections.map((s) => s.kind)).toEqual(["experience"]);
  });
});

describe("CV upload checks", () => {
  const pdf = new TextEncoder().encode("%PDF-1.7\n...");
  const zip = new Uint8Array([0x50, 0x4b, 0x03, 0x04, ...new TextEncoder().encode("....word/document.xml....")]);
  const legacyDoc = new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);

  it("detects the type from the bytes, not the name", () => {
    expect(detectCvFileKind(pdf)).toBe("pdf");
    expect(detectCvFileKind(zip)).toBe("docx");
    expect(detectCvFileKind(new TextEncoder().encode("hello"))).toBeNull();
    expect(validateCvFile({ fileName: "cv.docx", bytes: pdf }).kind).toBe("pdf");
  });

  it("rejects other files, old .doc files and files over 5 MB", () => {
    const code = (fn: () => unknown) => {
      try {
        fn();
      } catch (error) {
        return (error as AppError).code;
      }
    };
    expect(code(() => validateCvFile({ fileName: "cv.pdf", bytes: new TextEncoder().encode("<html>") }))).toBe(
      "UNSUPPORTED_FILE",
    );
    expect(code(() => validateCvFile({ fileName: "cv.doc", bytes: legacyDoc }))).toBe("UNSUPPORTED_FILE");
    const big = new Uint8Array(5 * 1024 * 1024 + 1);
    big.set(pdf);
    expect(code(() => validateCvFile({ fileName: "cv.pdf", bytes: big }))).toBe("FILE_TOO_LARGE");
  });
});
