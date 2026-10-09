import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { CV_FIXTURES, expectedExtraction } from "../../fixtures/cv/personas";
import { ROLE_FAMILIES } from "../../prisma/seed/role-families";
import { SKILLS } from "../../prisma/seed/skills";
import { assertCatalogueConsistent } from "../../prisma/seed/validate";
import { buildSkillIndex, matchSkill, skillKey } from "@/lib/skills/normalize";

const catalogue = SKILLS.map((s) => ({ id: s.slug, slug: s.slug, name: s.name, aliases: s.aliases ?? [] }));
const index = buildSkillIndex(catalogue);
const slugOf = (name: string) => matchSkill(index, name)?.slug ?? null;

describe("skillKey", () => {
  it("ignores case, spaces and punctuation but keeps # and +", () => {
    expect(skillKey("React.js")).toBe("reactjs");
    expect(skillKey(" Next JS ")).toBe("nextjs");
    expect(skillKey("Node_JS")).toBe("nodejs");
    expect(skillKey("C#")).toBe("c#");
    expect(skillKey("C++")).toBe("c++");
  });
});

describe("skill matching against the seed catalogue", () => {
  it.each([
    ["ReactJS", "react"],
    ["react js", "react"],
    ["NEXTJS", "nextjs"],
    ["Node", "nodejs"],
    ["Express.js", "express"],
    ["Vuejs", "vue"],
    ["Postgres", "postgresql"],
    ["React Query", "tanstack-query"],
    ["RTL", "react-testing-library"],
    ["a11y", "accessibility"],
    ["K8s", "kubernetes"],
    ["C#", "csharp"],
    ["Golang", "go"],
  ])("%s → %s", (name, slug) => {
    expect(slugOf(name)).toBe(slug);
  });

  it("keeps distinct skills apart", () => {
    expect(slugOf("React Native")).toBe("react-native");
    expect(slugOf("Java")).toBe("java");
    expect(slugOf("JavaScript")).toBe("javascript");
    expect(slugOf("Redux Toolkit")).toBe("redux-toolkit");
  });

  it("returns null for skills outside the catalogue", () => {
    expect(slugOf("COBOL")).toBeNull();
    expect(slugOf("")).toBeNull();
  });
});

describe("seed catalogue", () => {
  it("is internally consistent (no shared aliases, valid relations and role families)", () => {
    expect(() => assertCatalogueConsistent()).not.toThrow();
  });

  it("covers every skill used in the CV fixtures", () => {
    const unmatched = CV_FIXTURES.flatMap((cv) => cv.skills.flatMap((g) => g.items)).filter((s) => !slugOf(s));
    expect(unmatched).toEqual([]);
  });

  it("gives every role family title variants and core skills", () => {
    for (const family of ROLE_FAMILIES) {
      expect(family.titleVariants.length).toBeGreaterThan(2);
      expect(family.coreSkills.length).toBeGreaterThan(4);
    }
  });
});

describe("CV fixtures", () => {
  it("has the six layouts required by SPEC §9.4", () => {
    expect(CV_FIXTURES.map((cv) => cv.layout).sort()).toEqual(
      ["docx", "indian-format", "linked-text", "single-column", "table-heavy", "two-column"].sort(),
    );
  });

  it.each(CV_FIXTURES.map((cv) => [cv.id, cv] as const))(
    "%s: the expected-answer file matches the fixture data (run npm run fixtures:cv after edits)",
    (id, cv) => {
      const file = path.join(process.cwd(), "fixtures", "cv", `${id}.expected.json`);
      expect(JSON.parse(readFileSync(file, "utf8"))).toEqual(expectedExtraction(cv));
    },
  );

  it("uses only reserved example domains for contact details", () => {
    for (const cv of CV_FIXTURES) {
      expect(cv.personal.email.endsWith("@example.com")).toBe(true);
      for (const url of [cv.personal.portfolio].filter(Boolean)) expect(url).toMatch(/example\.dev/);
    }
  });
});
