import { describe, expect, it } from "vitest";
import { extractJobHeuristically, mentionsCatalogueSkill } from "@/lib/jobs/extract-heuristic";
import { finalizeRequirements } from "@/lib/jobs/requirements";
import { skillKeysIn } from "@/lib/cv/evidence";
import { buildSkillIndex } from "@/lib/skills/normalize";

const CATALOGUE = [
  { id: "react", slug: "react", name: "React", aliases: ["ReactJS", "React.js"] },
  { id: "ts", slug: "typescript", name: "TypeScript", aliases: ["TS"] },
  { id: "next", slug: "nextjs", name: "Next.js", aliases: ["NextJS"] },
  { id: "rest", slug: "rest-apis", name: "REST APIs", aliases: ["REST"] },
  { id: "gql", slug: "graphql", name: "GraphQL", aliases: [] },
  { id: "jest", slug: "jest", name: "Jest", aliases: [] },
  { id: "pw", slug: "playwright", name: "Playwright", aliases: [] },
  { id: "go", slug: "go", name: "Go", aliases: ["Golang"] },
  { id: "redux", slug: "redux", name: "Redux", aliases: [] },
];
const FAMILIES = [{ slug: "frontend-developer", name: "Frontend Developer", titleVariants: ["Frontend Engineer"] }];

// A fictional posting with the usual sections.
const POSTING = `Frontend Engineer (Payments)
About us: Kestrel Pay builds payment tools for small merchants.
What you'll do:
- Build the merchant dashboard in Next.js and React
- Own performance and accessibility of the checkout flow
Requirements:
- 4+ years of frontend experience
- Strong TypeScript and React
- Experience with REST APIs
- Bachelor's degree in Computer Science or equivalent
- Good communication with designers and backend engineers
Good to have:
- GraphQL
- Experience with Jest or Playwright
Notice period: 30 days. Hybrid, 3 days a week in the office.`;

describe("deterministic job extractor", () => {
  const result = extractJobHeuristically({
    text: POSTING,
    title: "Frontend Engineer",
    skills: CATALOGUE,
    families: FAMILIES,
  });
  const find = (text: string) => result.requirements.find((r) => r.text === text);

  it("reads sections: duties, must-haves, good-to-haves and skills named only in the duties", () => {
    expect(result.responsibilities).toEqual([
      "Build the merchant dashboard in Next.js and React",
      "Own performance and accessibility of the checkout flow",
    ]);
    expect(find("React")).toMatchObject({ kind: "skill", importance: "required" });
    expect(find("TypeScript")).toMatchObject({ importance: "required", quote: "Strong TypeScript and React" });
    expect(find("REST APIs")).toMatchObject({ importance: "required" });
    expect(find("Next.js")).toMatchObject({ importance: "implied" });
    expect(find("GraphQL")).toMatchObject({ importance: "preferred" });
    expect(find("Jest")).toMatchObject({ importance: "preferred" });
    expect(find("Playwright")).toMatchObject({ importance: "preferred" });
    expect(find("4+ years of frontend experience")).toMatchObject({ kind: "experience", yearsRequired: 4 });
    expect(find("Bachelor's degree in Computer Science or equivalent")).toMatchObject({ kind: "education" });
    expect(find("Good communication with designers and backend engineers")).toMatchObject({ kind: "soft" });
  });

  it("fills the overall fields it can read", () => {
    expect(result).toMatchObject({
      experience: { min: 4, max: null },
      roleFamilySlug: "frontend-developer",
      domain: "payments",
      workMode: "hybrid",
      seniority: "mid",
    });
  });

  it("reads a one-paragraph posting (no headings) as required skills", () => {
    const paragraph = extractJobHeuristically({
      text: "We need a developer with 3+ years of React and solid TypeScript. GraphQL is a plus.",
      title: "React Developer",
      skills: CATALOGUE,
      families: FAMILIES,
    });
    expect(paragraph.requirements.map((r) => [r.text, r.importance, r.yearsRequired])).toEqual([
      ["React", "required", null],
      ["TypeScript", "required", null],
      ["GraphQL", "preferred", null],
    ]);
  });

  it("counts short, common-word skill names only when written as the skill", () => {
    const go = CATALOGUE.find((s) => s.name === "Go")!;
    const check = (text: string) => mentionsCatalogueSkill(text, skillKeysIn(text), go);
    expect(check("Ready to go live in a fast-paced team")).toBe(false);
    expect(check("Services in Go and Kafka")).toBe(true);
    expect(check("Backend in Golang")).toBe(true);
  });
});

describe("requirement checks in code", () => {
  const posting =
    "Build dashboards in React.\nRequirements: 3+ years with ReactJS. Good communication.\nWe use Redux for state.";

  it("drops what the posting doesn't say, maps aliases, adds missed catalogue skills and numbers must-haves first", () => {
    const { requirements, dropped } = finalizeRequirements(
      [
        {
          text: "React",
          skillName: "React",
          kind: "skill",
          importance: "implied",
          yearsRequired: null,
          quote: "build dashboards in React",
        },
        {
          text: "ReactJS",
          skillName: "ReactJS",
          kind: "skill",
          importance: "required",
          yearsRequired: 3,
          quote: "3+ years with ReactJS",
        },
        {
          text: "Kubernetes",
          skillName: "Kubernetes",
          kind: "skill",
          importance: "required",
          yearsRequired: null,
          quote: "Kubernetes in production",
        },
        {
          text: "Good communication",
          skillName: null,
          kind: "soft",
          importance: "preferred",
          yearsRequired: null,
          quote: "Good communication",
        },
      ],
      posting,
      CATALOGUE,
      buildSkillIndex(CATALOGUE),
    );
    expect(dropped).toEqual(["Kubernetes"]);
    expect(requirements.map((r) => [r.reqId, r.text, r.importance, r.source, r.yearsRequired])).toEqual([
      ["R1", "React", "required", "ai", 3],
      ["R2", "Good communication", "preferred", "ai", null],
      ["R3", "Redux", "implied", "keyword", null],
    ]);
    expect(requirements[0]).toMatchObject({ skillId: "react", quote: "3+ years with ReactJS" });
    expect(requirements[2].quote).toBe("We use Redux for state.");
  });

  it("treats years of a known skill as a skill requirement", () => {
    const { requirements } = finalizeRequirements(
      [
        {
          text: "3+ years of React",
          skillName: "React",
          kind: "experience",
          importance: "required",
          yearsRequired: 3,
          quote: "3+ years with ReactJS",
        },
      ],
      posting,
      CATALOGUE,
      buildSkillIndex(CATALOGUE),
    );
    expect(requirements[0]).toMatchObject({ kind: "skill", skillId: "react", text: "React", yearsRequired: 3 });
  });
});
