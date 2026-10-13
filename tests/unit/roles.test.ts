import { describe, expect, it } from "vitest";
import { checkClaim } from "@/lib/evidence/validate";
import { categoryFor, coreSkillCoverage, seniorityFor } from "@/lib/roles/categorize";
import { suggestRolesHeuristically } from "@/lib/roles/suggest-heuristic";

describe("role category and seniority (computed in code)", () => {
  it("places years in seniority bands", () => {
    expect(seniorityFor(0)).toBe("junior");
    expect(seniorityFor(1.9)).toBe("junior");
    expect(seniorityFor(2)).toBe("mid");
    expect(seniorityFor(5.8)).toBe("senior");
    expect(seniorityFor(12)).toBe("lead");
    expect(seniorityFor(null)).toBe("junior");
  });

  it("uses Core ≥ 70%, Adjacent 40–69%, Stretch < 40%", () => {
    expect(categoryFor(0.7)).toBe("core");
    expect(categoryFor(0.69)).toBe("adjacent");
    expect(categoryFor(0.4)).toBe("adjacent");
    expect(categoryFor(0.39)).toBe("stretch");
  });

  it("counts core skills held at level 3+, including ones implied by a held skill", () => {
    const core = [
      { id: "react", name: "React" },
      { id: "ts", name: "TypeScript" },
      { id: "css", name: "CSS" },
    ];
    const user = [
      { skillId: "nextjs", proficiency: 4 },
      { skillId: "ts", proficiency: 3 },
      { skillId: "css", proficiency: 2 },
    ];
    const coverage = coreSkillCoverage(core, user, new Map([["react", ["nextjs"]]]));
    expect(coverage).toEqual({ held: ["React", "TypeScript"], missing: ["CSS"], total: 3, share: 2 / 3 });
  });
});

describe("evidence binding", () => {
  const catalog = new Map([
    ["E1", { id: "E1", text: "Rebuilt the merchant dashboard in Next.js, cutting page load time by 38%." }],
    ["E2", { id: "E2", text: "Built a component library used by 4 product teams." }],
  ]);

  it("accepts claims whose ids exist and whose numbers come from the evidence or the facts", () => {
    expect(checkClaim("Cut page load by 38% in Next.js [E1].", [], catalog, [5.4]).verified).toBe(true);
    expect(checkClaim("5+ years of frontend work [E2].", ["E2"], catalog, [5.4]).verified).toBe(true);
  });

  it("flags unknown ids and numbers the evidence doesn't contain", () => {
    expect(checkClaim("Led 12 engineers [E9].", [], catalog)).toMatchObject({
      verified: false,
      unknownIds: ["E9"],
      unsupportedNumbers: ["12"],
      evidenceIds: [],
    });
    expect(checkClaim("Strong React skills.", [], catalog).verified).toBe(false);
  });
});

describe("deterministic role suggestions", () => {
  it("ranks catalog roles by core skills held and cites matching evidence", () => {
    const roles = suggestRolesHeuristically({
      years: 3,
      headline: null,
      domains: [],
      skills: [
        { name: "React", proficiency: 4 },
        { name: "TypeScript", proficiency: 3 },
        { name: "Node.js", proficiency: 2 },
      ],
      evidence: [{ id: "E1", kind: "experience_bullet", text: "Built dashboards in React and TypeScript." }],
      families: [
        {
          slug: "react",
          name: "React Developer",
          titleVariants: ["React Developer", "ReactJS Developer"],
          coreSkills: ["React", "TypeScript"],
        },
        {
          slug: "backend",
          name: "Backend Developer",
          titleVariants: ["Backend Developer"],
          coreSkills: ["Node.js", "SQL"],
        },
      ],
    });
    expect(roles).toHaveLength(1);
    expect(roles[0]).toMatchObject({
      roleFamilySlug: "react",
      evidenceIds: ["E1"],
      titleVariants: ["React Developer", "ReactJS Developer"],
    });
    expect(roles[0].fitReason).toContain("[E1]");
  });
});
