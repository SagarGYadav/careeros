// Role catalogue (SPEC §10.1). RoleSuggester prefers these; a role's category for a user (Core / Adjacent / Stretch)
// is the share of its core skills the user has at proficiency 3+, computed in code.

export const SENIORITY_BANDS = [
  { level: "intern", minYears: 0, maxYears: 0.5 },
  { level: "junior", minYears: 0, maxYears: 2 },
  { level: "mid", minYears: 2, maxYears: 5 },
  { level: "senior", minYears: 5, maxYears: 8 },
  { level: "lead", minYears: 8, maxYears: 40 },
];

export type RoleFamilySeed = {
  slug: string;
  name: string;
  description: string;
  titleVariants: string[];
  coreSkills: string[];
  adjacent: string[];
};

export const ROLE_FAMILIES: RoleFamilySeed[] = [
  {
    slug: "frontend",
    name: "Frontend Developer",
    description: "Builds user interfaces for the web.",
    titleVariants: [
      "Frontend Developer",
      "Front End Engineer",
      "Frontend Engineer",
      "UI Developer",
      "SDE - Frontend",
      "Web Developer",
    ],
    coreSkills: ["javascript", "typescript", "html", "css", "react", "responsive-design", "rest-apis", "git"],
    adjacent: ["react", "nextjs", "javascript", "ui-engineering", "fullstack"],
  },
  {
    slug: "react",
    name: "React Developer",
    description: "Frontend work focused on React applications.",
    titleVariants: [
      "React Developer",
      "React.js Developer",
      "ReactJS Developer",
      "React Engineer",
      "React Frontend Developer",
    ],
    coreSkills: ["react", "javascript", "typescript", "html", "css", "redux", "rest-apis", "jest"],
    adjacent: ["frontend", "nextjs", "react-native", "javascript"],
  },
  {
    slug: "nextjs",
    name: "Next.js Developer",
    description: "React applications built with Next.js, including server rendering.",
    titleVariants: ["Next.js Developer", "NextJS Developer", "React/Next.js Developer", "Next.js Engineer"],
    coreSkills: ["nextjs", "react", "typescript", "javascript", "ssr", "rest-apis", "css"],
    adjacent: ["react", "frontend", "fullstack"],
  },
  {
    slug: "javascript",
    name: "JavaScript Developer",
    description: "General JavaScript and TypeScript development across the stack.",
    titleVariants: ["JavaScript Developer", "JavaScript Engineer", "TypeScript Developer", "JS Developer"],
    coreSkills: ["javascript", "typescript", "html", "css", "nodejs", "rest-apis", "git"],
    adjacent: ["frontend", "react", "fullstack"],
  },
  {
    slug: "react-native",
    name: "React Native Developer",
    description: "Cross-platform mobile apps with React Native.",
    titleVariants: ["React Native Developer", "React Native Engineer", "Mobile Developer (React Native)"],
    coreSkills: ["react-native", "react", "javascript", "typescript", "redux", "rest-apis", "expo"],
    adjacent: ["react", "mobile"],
  },
  {
    slug: "fullstack",
    name: "Full Stack Developer",
    description: "Frontend and backend work on the same product.",
    titleVariants: [
      "Full Stack Developer",
      "Full Stack Engineer",
      "MERN Stack Developer",
      "Software Engineer - Full Stack",
    ],
    coreSkills: ["javascript", "typescript", "react", "nodejs", "express", "rest-apis", "sql", "git", "docker"],
    adjacent: ["frontend", "backend", "javascript", "nextjs"],
  },
  {
    slug: "backend",
    name: "Backend Developer",
    description: "APIs, databases and server-side systems.",
    titleVariants: ["Backend Developer", "Backend Engineer", "Node.js Developer", "API Developer", "SDE - Backend"],
    coreSkills: ["nodejs", "typescript", "rest-apis", "postgresql", "sql", "docker", "system-design", "git"],
    adjacent: ["fullstack", "software-engineer"],
  },
  {
    slug: "mobile",
    name: "Mobile Developer",
    description: "Native or cross-platform mobile apps.",
    titleVariants: [
      "Mobile Developer",
      "Mobile App Developer",
      "Android Developer",
      "iOS Developer",
      "Flutter Developer",
    ],
    coreSkills: ["react-native", "flutter", "android", "ios", "kotlin", "swift", "rest-apis"],
    adjacent: ["react-native"],
  },
  {
    slug: "ui-engineering",
    name: "UI Engineer",
    description: "Design systems, accessibility and pixel-accurate interfaces.",
    titleVariants: ["UI Engineer", "Design Systems Engineer", "Frontend UI Engineer", "UI/UX Developer"],
    coreSkills: [
      "html",
      "css",
      "javascript",
      "design-systems",
      "accessibility",
      "storybook",
      "figma",
      "responsive-design",
    ],
    adjacent: ["frontend", "react"],
  },
  {
    slug: "software-engineer",
    name: "Software Engineer",
    description: "Generalist product engineering roles (SDE).",
    titleVariants: ["Software Engineer", "Software Developer", "SDE", "SDE-1", "SDE-2", "Associate Software Engineer"],
    coreSkills: ["dsa", "system-design", "oop", "git", "sql", "rest-apis"],
    adjacent: ["fullstack", "backend", "frontend"],
  },
];
