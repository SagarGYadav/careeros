// Generates the fictional test CVs in fixtures/cv from fixtures/cv/personas.ts (SPEC §9.4):
// five PDFs with different layouts (rendered from HTML by Playwright's Chromium) and one DOCX, plus an
// .expected.json per CV for the extraction eval. Run: `npm run fixtures:cv`.
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "@playwright/test";
import { Document, ExternalHyperlink, HeadingLevel, Packer, Paragraph, TextRun } from "docx";
import { CV_FIXTURES, expectedExtraction, type CvFixture } from "../fixtures/cv/personas";

const OUT_DIR = path.join(process.cwd(), "fixtures", "cv");
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const month = (ym: string | null) => (ym ? `${MONTHS[Number(ym.slice(5, 7)) - 1]} ${ym.slice(0, 4)}` : "Present");
const range = (start: string, end: string | null) => `${month(start)} – ${month(end)}`;
const bare = (url: string) => url.replace(/^https?:\/\/(www\.)?/, "");
const location = (cv: CvFixture) =>
  [cv.personal.city, cv.personal.state, cv.personal.country].filter(Boolean).join(", ");

const BASE_CSS = `
  * { box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; font-size: 10.5pt; color: #1f2328; margin: 0; line-height: 1.4; }
  h1 { font-size: 20pt; margin: 0 0 2px; } h2 { font-size: 11pt; text-transform: uppercase; letter-spacing: .06em;
  border-bottom: 1px solid #c9ced6; padding-bottom: 2px; margin: 14px 0 6px; } h3 { font-size: 10.5pt; margin: 8px 0 0; }
  .muted { color: #57606a; } ul { margin: 4px 0 0 18px; padding: 0; } li { margin: 1px 0; } a { color: #0b57d0; }
  table { border-collapse: collapse; width: 100%; } td, th { border: 1px solid #c9ced6; padding: 4px 6px; text-align: left; vertical-align: top; }
`;

function experienceHtml(cv: CvFixture) {
  return cv.experience
    .map(
      (e) => `<h3>${esc(e.title)} — ${esc(e.company)}</h3>
      <div class="muted">${esc(e.location)} · ${esc(e.employmentType ?? "")} · ${range(e.start, e.end)}</div>
      <ul>${e.bullets.map((b) => `<li>${esc(b)}</li>`).join("")}</ul>
      <div class="muted">Technologies: ${esc(e.technologies.join(", "))}</div>`,
    )
    .join("");
}

function projectsHtml(cv: CvFixture) {
  if (!cv.projects.length) return "";
  return `<h2>Projects</h2>${cv.projects
    .map(
      (p) => `<h3>${esc(p.name)}</h3><div>${esc(p.description)}</div>
      <ul>${p.bullets.map((b) => `<li>${esc(b)}</li>`).join("")}</ul>
      <div class="muted">${esc(p.technologies.join(", "))}${p.link ? ` · ${esc(bare(p.link))}` : ""}</div>`,
    )
    .join("")}`;
}

function educationHtml(cv: CvFixture) {
  return `<h2>Education</h2>${cv.education
    .map(
      (e) => `<h3>${esc(e.degree)} in ${esc(e.field)}</h3>
      <div>${esc(e.institution)} · ${range(e.start, e.end)} · ${esc(e.grade)}</div>`,
    )
    .join("")}`;
}

function certificationsHtml(cv: CvFixture) {
  if (!cv.certifications.length) return "";
  return `<h2>Certifications</h2><ul>${cv.certifications
    .map(
      (c) =>
        `<li>${esc(c.name)} — ${esc(c.issuer)}, ${month(c.issueDate)}${c.credentialId ? ` (ID ${esc(c.credentialId)})` : ""}</li>`,
    )
    .join("")}</ul>`;
}

function extrasHtml(cv: CvFixture) {
  return [
    cv.awards?.length ? `<h2>Awards</h2><ul>${cv.awards.map((a) => `<li>${esc(a)}</li>`).join("")}</ul>` : "",
    cv.languages?.length ? `<h2>Languages</h2><div>${esc(cv.languages.join(", "))}</div>` : "",
    cv.interests?.length ? `<h2>Interests</h2><div>${esc(cv.interests.join(", "))}</div>` : "",
  ].join("");
}

const contactLine = (cv: CvFixture) =>
  [
    cv.personal.email,
    cv.personal.phone,
    location(cv),
    cv.personal.linkedin && bare(cv.personal.linkedin),
    cv.personal.github && bare(cv.personal.github),
    cv.personal.portfolio && bare(cv.personal.portfolio),
  ]
    .filter(Boolean)
    .map((s) => esc(String(s)))
    .join(" · ");

function singleColumn(cv: CvFixture) {
  return `<h1>${esc(cv.personal.fullName)}</h1><div><strong>${esc(cv.headline)}</strong></div>
    <div class="muted">${contactLine(cv)}</div>
    <h2>Summary</h2><p>${esc(cv.summary)}</p>
    <h2>Experience</h2>${experienceHtml(cv)}${projectsHtml(cv)}
    <h2>Skills</h2>${cv.skills.map((g) => `<div><strong>${esc(g.group)}:</strong> ${esc(g.items.join(", "))}</div>`).join("")}
    ${educationHtml(cv)}${certificationsHtml(cv)}${extrasHtml(cv)}`;
}

function twoColumn(cv: CvFixture) {
  return `<style>.grid{display:grid;grid-template-columns:32% 1fr;gap:18px}.side{background:#f3f5f8;padding:12px;border-radius:6px}</style>
    <h1>${esc(cv.personal.fullName)}</h1><div><strong>${esc(cv.headline)}</strong></div>
    <div class="grid"><aside class="side">
      <h2>Contact</h2><div>${esc(cv.personal.email)}</div><div>${esc(cv.personal.phone)}</div><div>${esc(location(cv))}</div>
      ${[cv.personal.linkedin, cv.personal.github, cv.personal.portfolio]
        .filter(Boolean)
        .map((u) => `<div>${esc(bare(u!))}</div>`)
        .join("")}
      <h2>Skills</h2>${cv.skills.map((g) => `<h3>${esc(g.group)}</h3><div>${esc(g.items.join(", "))}</div>`).join("")}
      ${certificationsHtml(cv)}${extrasHtml(cv)}
    </aside><main>
      <h2>Profile</h2><p>${esc(cv.summary)}</p>
      <h2>Experience</h2>${experienceHtml(cv)}${projectsHtml(cv)}${educationHtml(cv)}
    </main></div>`;
}

function tableHeavy(cv: CvFixture) {
  return `<h1>${esc(cv.personal.fullName)}</h1><div><strong>${esc(cv.headline)}</strong></div>
    <table><tr><th>Email</th><td>${esc(cv.personal.email)}</td><th>Phone</th><td>${esc(cv.personal.phone)}</td></tr>
    <tr><th>Location</th><td>${esc(location(cv))}</td><th>Links</th><td>${[cv.personal.linkedin, cv.personal.portfolio]
      .filter(Boolean)
      .map((u) => esc(bare(u!)))
      .join("<br>")}</td></tr></table>
    <h2>Summary</h2><p>${esc(cv.summary)}</p>
    <h2>Skills</h2><table>${cv.skills.map((g) => `<tr><th>${esc(g.group)}</th><td>${esc(g.items.join(", "))}</td></tr>`).join("")}</table>
    <h2>Work Experience</h2><table><tr><th>Company</th><th>Role</th><th>Duration</th><th>Location</th></tr>
    ${cv.experience.map((e) => `<tr><td>${esc(e.company)}</td><td>${esc(e.title)}</td><td>${range(e.start, e.end)}</td><td>${esc(e.location)}</td></tr>`).join("")}</table>
    ${cv.experience.map((e) => `<h3>${esc(e.company)} — key contributions</h3><ul>${e.bullets.map((b) => `<li>${esc(b)}</li>`).join("")}</ul><div class="muted">Tools: ${esc(e.technologies.join(", "))}</div>`).join("")}
    <h2>Education</h2><table><tr><th>Degree</th><th>Institution</th><th>Years</th><th>Score</th></tr>
    ${cv.education.map((e) => `<tr><td>${esc(e.degree)} (${esc(e.field)})</td><td>${esc(e.institution)}</td><td>${e.start.slice(0, 4)}–${e.end.slice(0, 4)}</td><td>${esc(e.grade)}</td></tr>`).join("")}</table>
    ${certificationsHtml(cv)}`;
}

function indianFormat(cv: CvFixture) {
  const js = cv.jobSearch ?? {};
  return `<div style="text-align:center"><h1>CURRICULUM VITAE</h1><div><strong>${esc(cv.personal.fullName)}</strong></div>
    <div>Mobile: ${esc(cv.personal.phone)} | Email: ${esc(cv.personal.email)}</div><div>${esc(location(cv))}</div></div>
    <h2>Career Objective</h2><p>${esc(cv.summary)}</p>
    <h2>Professional Summary</h2><div>${esc(cv.headline)}</div>
    <div>Current CTC: ${esc(js.currentCtc ?? "")} | Expected CTC: ${esc(js.expectedCtc ?? "")} | Notice Period: ${esc(js.noticePeriod ?? "")}</div>
    <div>Preferred Location: ${esc((js.preferredLocations ?? []).join(", "))}</div>
    <h2>Work Experience</h2>${experienceHtml(cv)}
    <h2>Technical Skills</h2>${cv.skills.map((g) => `<div>${esc(g.items.join(", "))}</div>`).join("")}
    ${educationHtml(cv)}${certificationsHtml(cv)}
    <h2>Personal Details</h2><table>${Object.entries(cv.personal.other ?? {})
      .map(([k, v]) => `<tr><th>${esc(k)}</th><td>${esc(v)}</td></tr>`)
      .join("")}</table>
    <h2>Declaration</h2><p>I hereby declare that the information furnished above is true to the best of my knowledge.</p>
    <p>Place: ${esc(cv.personal.city)}<br>(${esc(cv.personal.fullName)})</p>`;
}

function linkedText(cv: CvFixture) {
  // The URLs exist only as link targets: the visible text says "LinkedIn", "GitHub", "Portfolio".
  const links = [
    cv.personal.linkedin && `<a href="${esc(cv.personal.linkedin)}">LinkedIn</a>`,
    cv.personal.github && `<a href="${esc(cv.personal.github)}">GitHub</a>`,
    cv.personal.portfolio && `<a href="${esc(cv.personal.portfolio)}">Portfolio</a>`,
  ].filter(Boolean);
  return `<h1>${esc(cv.personal.fullName)}</h1><div><strong>${esc(cv.headline)}</strong></div>
    <div><a href="mailto:${esc(cv.personal.email)}">${esc(cv.personal.email)}</a> · ${esc(cv.personal.phone)} · ${esc(location(cv))}</div>
    <div>${links.join(" | ")}</div>
    <h2>About</h2><p>${esc(cv.summary)}</p>
    <h2>Experience</h2>${experienceHtml(cv)}
    <h2>Projects</h2>${cv.projects
      .map(
        (
          p,
        ) => `<h3>${p.link ? `<a href="${esc(p.link)}">${esc(p.name)}</a>` : esc(p.name)}</h3><div>${esc(p.description)}</div>
        <ul>${p.bullets.map((b) => `<li>${esc(b)}</li>`).join("")}</ul><div class="muted">${esc(p.technologies.join(", "))}</div>`,
      )
      .join("")}
    <h2>Skills</h2><div>${esc(cv.skills.flatMap((g) => g.items).join(" · "))}</div>${educationHtml(cv)}`;
}

const RENDERERS: Record<Exclude<CvFixture["layout"], "docx">, (cv: CvFixture) => string> = {
  "single-column": singleColumn,
  "two-column": twoColumn,
  "table-heavy": tableHeavy,
  "indian-format": indianFormat,
  "linked-text": linkedText,
};

function docxFor(cv: CvFixture): Document {
  const heading = (text: string) => new Paragraph({ text, heading: HeadingLevel.HEADING_2, spacing: { before: 240 } });
  const bullet = (text: string) => new Paragraph({ text, bullet: { level: 0 } });
  const link = (text: string, url: string) =>
    new ExternalHyperlink({ link: url, children: [new TextRun({ text, style: "Hyperlink" })] });
  const children: Paragraph[] = [
    new Paragraph({ text: cv.personal.fullName, heading: HeadingLevel.TITLE }),
    new Paragraph({ children: [new TextRun({ text: cv.headline, bold: true })] }),
    new Paragraph({ text: `${cv.personal.email} | ${cv.personal.phone} | ${location(cv)}` }),
  ];
  if (cv.personal.linkedin)
    children.push(new Paragraph({ children: [link("LinkedIn profile", cv.personal.linkedin)] }));
  children.push(heading("Summary"), new Paragraph({ text: cv.summary }), heading("Experience"));
  for (const e of cv.experience) {
    children.push(
      new Paragraph({ children: [new TextRun({ text: `${e.title}, ${e.company}`, bold: true })] }),
      new Paragraph({ text: `${e.location} | ${e.employmentType ?? ""} | ${range(e.start, e.end)}` }),
      ...e.bullets.map(bullet),
      new Paragraph({ text: `Technologies: ${e.technologies.join(", ")}` }),
    );
  }
  if (cv.projects.length) children.push(heading("Projects"));
  for (const p of cv.projects) {
    children.push(
      new Paragraph({ children: [new TextRun({ text: p.name, bold: true })] }),
      new Paragraph({ text: p.description }),
      ...p.bullets.map(bullet),
    );
  }
  children.push(
    heading("Skills"),
    ...cv.skills.map((g) => new Paragraph({ text: `${g.group}: ${g.items.join(", ")}` })),
  );
  children.push(heading("Education"));
  for (const e of cv.education) {
    children.push(
      new Paragraph({ text: `${e.degree} in ${e.field}, ${e.institution}, ${range(e.start, e.end)}, ${e.grade}` }),
    );
  }
  if (cv.interests?.length) children.push(heading("Interests"), new Paragraph({ text: cv.interests.join(", ") }));
  return new Document({ creator: "CareerOS fixtures", title: `${cv.personal.fullName} CV`, sections: [{ children }] });
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  const browser = await chromium.launch();
  try {
    for (const cv of CV_FIXTURES) {
      const file = path.join(OUT_DIR, `${cv.id}.${cv.format}`);
      if (cv.format === "docx") {
        await writeFile(file, await Packer.toBuffer(docxFor(cv)));
      } else {
        const page = await browser.newPage();
        const body = RENDERERS[cv.layout as keyof typeof RENDERERS](cv);
        await page.setContent(
          `<!doctype html><html><head><meta charset="utf-8"><style>${BASE_CSS}</style></head><body>${body}</body></html>`,
        );
        await page.pdf({
          path: file,
          format: "A4",
          printBackground: true,
          margin: { top: "16mm", bottom: "16mm", left: "14mm", right: "14mm" },
        });
        await page.close();
      }
      await writeFile(
        path.join(OUT_DIR, `${cv.id}.expected.json`),
        `${JSON.stringify(expectedExtraction(cv), null, 2)}\n`,
      );
      console.log(`wrote ${path.relative(process.cwd(), file)}`);
    }
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
