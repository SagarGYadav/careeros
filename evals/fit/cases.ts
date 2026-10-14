// Golden set for JobExtractor and FitAnalyst (SPEC §12.6): 10 fictional job postings, each paired with one of the
// fictional CVs in fixtures/cv. Every company and posting is invented. For each posting: the requirements an expert
// would list (with importance, as the posting words it), and a checklist of what an expert reviewer expects the
// report to say, written as checks code can run.

export type Importance = "required" | "preferred" | "nice_to_have" | "implied";

/** A requirement the extractor should find. `skill` matches the catalogue skill; else every term must appear. */
export type ExpectedRequirement = { skill?: string; terms?: string[]; importance: Importance };

export type Section =
  "summary" | "role" | "requirements" | "redFlags" | "standsOut" | "risks" | "strategy" | "questions";

export type ChecklistItem = { id: string; expect: string } & (
  | {
      kind: "status";
      requirement: { skill?: string; terms?: string[] };
      status: ("strong" | "partial" | "missing" | "unclear")[];
    }
  | { kind: "blocker"; blocker: "experience" | "skills" | "notice" | "dealbreaker" }
  | { kind: "noBlocker" }
  | { kind: "recommendation"; in: ("APPLY" | "CONSIDER" | "LOW_PRIORITY")[] }
  | { kind: "strategy"; in: ("apply_now" | "tailor_first" | "seek_referral" | "skip")[] }
  /** Some sentence in one of the sections mentions every term group (case-insensitive; any alternative; /…/ is a regex). */
  | { kind: "mentions"; sections: Section[]; terms: string[][] }
  /** Some sentence in the section cites CV evidence. */
  | { kind: "citesEvidence"; section: Section }
);

export type GoldenCase = {
  id: string;
  cv: string;
  job: {
    title: string;
    company: string;
    location: string;
    workMode: "remote" | "hybrid" | "onsite" | null;
    salaryText: string | null;
    description: string;
  };
  preferences: {
    expectedCtcLpa: number;
    noticePeriodDays: number;
    locations: string[];
    workModes: ("remote" | "hybrid" | "onsite")[];
  };
  /** Added as the user's target role, so role alignment reflects a real search. */
  targetRole: string;
  requirements: ExpectedRequirement[];
  checklist: ChecklistItem[];
};

export const GOLDEN_CASES: GoldenCase[] = [
  {
    id: "ananya-payments-frontend",
    cv: "ananya-single-column",
    targetRole: "Frontend Developer",
    job: {
      title: "Senior Frontend Engineer (Payments)",
      company: "Copperleaf Payments",
      location: "Bengaluru",
      workMode: "hybrid",
      salaryText: "24-32 LPA",
      description: `Copperleaf Payments builds checkout and payout tools for 40,000 Indian merchants.

What you'll do:
- Build and own the merchant dashboard in React and Next.js
- Improve the performance of our checkout pages
- Write unit tests and review code with the team

Requirements:
- 4-7 years of frontend experience
- Strong React and TypeScript
- Experience with Next.js
- Experience consuming REST APIs
- Unit testing with Jest or React Testing Library

Good to have:
- GraphQL
- Experience in fintech or payments

Hybrid: 3 days a week in our Bengaluru office.`,
    },
    preferences: {
      expectedCtcLpa: 22,
      noticePeriodDays: 30,
      locations: ["Bengaluru"],
      workModes: ["hybrid", "remote"],
    },
    requirements: [
      { terms: ["4", "years"], importance: "required" },
      { skill: "React", importance: "required" },
      { skill: "TypeScript", importance: "required" },
      { skill: "Next.js", importance: "required" },
      { skill: "REST APIs", importance: "required" },
      { skill: "Jest", importance: "required" },
      { skill: "GraphQL", importance: "preferred" },
      { terms: ["payments"], importance: "preferred" },
    ],
    checklist: [
      {
        id: "react-strong",
        expect: "React is a strong match",
        kind: "status",
        requirement: { skill: "React" },
        status: ["strong"],
      },
      {
        id: "next-strong",
        expect: "Next.js is a strong match",
        kind: "status",
        requirement: { skill: "Next.js" },
        status: ["strong"],
      },
      {
        id: "graphql-gap",
        expect: "GraphQL is not shown as a strength",
        kind: "status",
        requirement: { skill: "GraphQL" },
        status: ["missing", "partial", "unclear"],
      },
      { id: "no-blocker", expect: "No blockers", kind: "noBlocker" },
      { id: "apply", expect: "Recommends applying", kind: "recommendation", in: ["APPLY"] },
      {
        id: "strategy",
        expect: "Strategy is to apply (now or after tailoring)",
        kind: "strategy",
        in: ["apply_now", "tailor_first"],
      },
      {
        id: "fintech",
        expect: "Notes the fintech/payments experience at Kestrel Pay",
        kind: "mentions",
        sections: ["summary", "standsOut", "strategy", "role"],
        terms: [["payment", "fintech", "kestrel"]],
      },
      {
        id: "graphql-risk",
        expect: "Names GraphQL as a gap to address",
        kind: "mentions",
        sections: ["risks", "redFlags", "summary"],
        terms: [["graphql"]],
      },
      { id: "evidence", expect: "What stands out cites the CV", kind: "citesEvidence", section: "standsOut" },
    ],
  },
  {
    id: "ananya-staff-frontend",
    cv: "ananya-single-column",
    targetRole: "Frontend Developer",
    job: {
      title: "Staff Frontend Engineer",
      company: "Northwind Ledger",
      location: "Bengaluru",
      workMode: "onsite",
      salaryText: null,
      description: `Northwind Ledger is hiring a Staff Frontend Engineer to set the technical direction of our web platform. You will lead a team of six engineers, own the frontend architecture and mentor senior developers. We are looking for someone with 9+ years of experience building large web applications, deep expertise in React and TypeScript, and experience designing micro-frontends. Experience with system design and leading hiring is required. Exposure to Kubernetes is a plus.`,
    },
    preferences: {
      expectedCtcLpa: 22,
      noticePeriodDays: 30,
      locations: ["Bengaluru"],
      workModes: ["hybrid", "onsite"],
    },
    requirements: [
      { terms: ["9", "years"], importance: "required" },
      { skill: "React", importance: "required" },
      { skill: "TypeScript", importance: "required" },
      { skill: "Micro-frontends", importance: "required" },
      { skill: "System design", importance: "required" },
      { terms: ["hiring"], importance: "required" },
      { skill: "Kubernetes", importance: "preferred" },
      { skill: "Leadership", importance: "implied" },
    ],
    checklist: [
      {
        id: "experience-blocker",
        expect: "Flags 9+ years asked against about 5",
        kind: "blocker",
        blocker: "experience",
      },
      {
        id: "years-flag",
        expect: "Says the years gap in words",
        kind: "mentions",
        sections: ["summary", "redFlags", "risks"],
        terms: [["9"], ["year"]],
      },
      {
        id: "not-apply",
        expect: "Doesn't recommend applying straight away",
        kind: "recommendation",
        in: ["CONSIDER", "LOW_PRIORITY"],
      },
      {
        id: "seniority",
        expect: "Reads the role as staff/lead level",
        kind: "mentions",
        sections: ["role"],
        terms: [["staff", "lead", "principal"]],
      },
      {
        id: "leadership-gap",
        expect: "Names team leadership or mentoring as a gap",
        kind: "mentions",
        sections: ["risks", "redFlags"],
        terms: [["lead", "mentor", "manag", "hiring"]],
      },
      { id: "strategy", expect: "Strategy is a referral or skip", kind: "strategy", in: ["seek_referral", "skip"] },
    ],
  },
  {
    id: "rohan-fullstack-node",
    cv: "rohan-two-column",
    targetRole: "Full Stack Developer",
    job: {
      title: "Full Stack Engineer (Node.js + React)",
      company: "Tamarind Commerce",
      location: "Pune",
      workMode: "hybrid",
      salaryText: "28-38 LPA",
      description: `About the role
Tamarind Commerce runs storefronts for 2,000 D2C brands. You will build features end to end.

Responsibilities
- Design and build REST APIs in Node.js and Express
- Build customer-facing pages in React and Next.js
- Model data in PostgreSQL and tune slow queries
- Ship with Docker and GitHub Actions

Must have
- 5+ years of software engineering experience
- Node.js, Express and PostgreSQL in production
- React with TypeScript
- Docker

Nice to have
- AWS
- Kubernetes`,
    },
    preferences: { expectedCtcLpa: 30, noticePeriodDays: 60, locations: ["Pune"], workModes: ["hybrid", "remote"] },
    requirements: [
      { terms: ["5", "years"], importance: "required" },
      { skill: "Node.js", importance: "required" },
      { skill: "Express", importance: "required" },
      { skill: "PostgreSQL", importance: "required" },
      { skill: "React", importance: "required" },
      { skill: "TypeScript", importance: "required" },
      { skill: "Docker", importance: "required" },
      { skill: "AWS", importance: "nice_to_have" },
      { skill: "Kubernetes", importance: "nice_to_have" },
      { skill: "Next.js", importance: "implied" },
      { skill: "GitHub Actions", importance: "implied" },
    ],
    checklist: [
      {
        id: "node-strong",
        expect: "Node.js is a strong match",
        kind: "status",
        requirement: { skill: "Node.js" },
        status: ["strong"],
      },
      {
        id: "postgres-strong",
        expect: "PostgreSQL is a strong match",
        kind: "status",
        requirement: { skill: "PostgreSQL" },
        status: ["strong"],
      },
      {
        id: "kubernetes-gap",
        expect: "Kubernetes is a gap",
        kind: "status",
        requirement: { skill: "Kubernetes" },
        status: ["missing", "partial", "unclear"],
      },
      { id: "apply", expect: "Recommends applying", kind: "recommendation", in: ["APPLY"] },
      {
        id: "end-to-end",
        expect: "Notes the end-to-end work at Quill Commerce",
        kind: "mentions",
        sections: ["summary", "standsOut", "strategy"],
        terms: [["quill", "full stack", "full-stack", "end to end", "end-to-end"]],
      },
      { id: "strategy", expect: "Strategy is to apply", kind: "strategy", in: ["apply_now", "tailor_first"] },
      { id: "evidence", expect: "What to lead with cites the CV", kind: "citesEvidence", section: "strategy" },
    ],
  },
  {
    id: "rohan-go-backend",
    cv: "rohan-two-column",
    targetRole: "Backend Developer",
    job: {
      title: "Backend Engineer (Go)",
      company: "Halcyon Streams",
      location: "Pune",
      workMode: "hybrid",
      salaryText: "30-40 LPA",
      description: `What you'll do:
- Build high-throughput event pipelines in Go
- Run services on Kubernetes and keep them observable
- Design microservices that process millions of events a day

Requirements:
- 4+ years of backend development
- Production experience with Go
- Kafka or a similar event streaming system
- Kubernetes
- Microservices architecture
- SQL databases

Good to have:
- Terraform`,
    },
    preferences: { expectedCtcLpa: 30, noticePeriodDays: 60, locations: ["Pune"], workModes: ["hybrid", "remote"] },
    requirements: [
      { terms: ["4", "years"], importance: "required" },
      { skill: "Go", importance: "required" },
      { terms: ["kafka"], importance: "required" },
      { skill: "Kubernetes", importance: "required" },
      { skill: "Microservices", importance: "required" },
      { skill: "SQL", importance: "required" },
      { skill: "Terraform", importance: "preferred" },
    ],
    checklist: [
      { id: "go-missing", expect: "Go is missing", kind: "status", requirement: { skill: "Go" }, status: ["missing"] },
      {
        id: "kafka-missing",
        expect: "Kafka is missing",
        kind: "status",
        requirement: { terms: ["kafka"] },
        status: ["missing", "unclear"],
      },
      { id: "skills-blocker", expect: "Blocks on missing must-have skills", kind: "blocker", blocker: "skills" },
      { id: "low", expect: "Not recommended as is", kind: "recommendation", in: ["LOW_PRIORITY", "CONSIDER"] },
      {
        id: "go-flag",
        expect: "Names Go as the main gap",
        kind: "mentions",
        sections: ["summary", "redFlags", "risks"],
        terms: [["/\\bgo\\b/", "golang"]],
      },
      {
        id: "transferable",
        expect: "Notes the transferable backend work (Node.js/PostgreSQL)",
        kind: "mentions",
        sections: ["summary", "standsOut", "risks", "strategy"],
        terms: [["node", "postgres", "backend"]],
      },
      {
        id: "strategy",
        expect: "Strategy is a referral or skip",
        kind: "strategy",
        in: ["seek_referral", "skip", "tailor_first"],
      },
    ],
  },
  {
    id: "sneha-react-native",
    cv: "sneha-docx",
    targetRole: "Mobile Developer",
    job: {
      title: "React Native Developer",
      company: "Juniper Health",
      location: "Hyderabad",
      workMode: "hybrid",
      salaryText: "14-20 LPA",
      description: `Juniper Health's app helps 300,000 patients book doctor visits.

Your role:
- Build features in our React Native app (iOS and Android)
- Work with designers on accessible, fast screens
- Integrate REST APIs and push notifications

What we're looking for:
- 3+ years of mobile development
- React Native with TypeScript
- Redux or another state management library
- Experience publishing apps to the Play Store

Good to have:
- Native Android with Kotlin
- Healthcare domain experience`,
    },
    preferences: {
      expectedCtcLpa: 15,
      noticePeriodDays: 30,
      locations: ["Hyderabad"],
      workModes: ["hybrid", "remote"],
    },
    requirements: [
      { terms: ["3", "years"], importance: "required" },
      { skill: "React Native", importance: "required" },
      { skill: "TypeScript", importance: "required" },
      { skill: "Redux", importance: "required" },
      { terms: ["play store"], importance: "required" },
      { skill: "Kotlin", importance: "preferred" },
      { terms: ["healthcare"], importance: "preferred" },
      { skill: "REST APIs", importance: "implied" },
    ],
    checklist: [
      {
        id: "rn-strong",
        expect: "React Native is a strong match",
        kind: "status",
        requirement: { skill: "React Native" },
        status: ["strong"],
      },
      {
        id: "kotlin-gap",
        expect: "Kotlin is a gap",
        kind: "status",
        requirement: { skill: "Kotlin" },
        status: ["missing", "partial", "unclear"],
      },
      {
        id: "health",
        expect: "Notes the health-app experience at Marigold Health",
        kind: "mentions",
        sections: ["summary", "standsOut", "strategy", "role"],
        terms: [["health", "marigold"]],
      },
      { id: "apply", expect: "Recommends applying", kind: "recommendation", in: ["APPLY", "CONSIDER"] },
      { id: "no-blocker", expect: "No blockers", kind: "noBlocker" },
      { id: "evidence", expect: "What stands out cites the CV", kind: "citesEvidence", section: "standsOut" },
    ],
  },
  {
    id: "sneha-flutter",
    cv: "sneha-docx",
    targetRole: "Mobile Developer",
    job: {
      title: "Flutter Developer",
      company: "Bluebell Travel",
      location: "Hyderabad",
      workMode: "onsite",
      salaryText: "12-16 LPA",
      description: `Bluebell Travel is rebuilding its booking app in Flutter. You will build screens, manage state with Bloc and ship to both stores. Requirements: 2+ years of Flutter and Dart, Bloc or Provider for state management, Firebase. Experience with native iOS (Swift) is a plus. Work from our Hyderabad office five days a week.`,
    },
    preferences: {
      expectedCtcLpa: 15,
      noticePeriodDays: 30,
      locations: ["Hyderabad"],
      workModes: ["hybrid", "onsite"],
    },
    requirements: [
      { skill: "Flutter", importance: "required" },
      { skill: "Dart", importance: "required" },
      { terms: ["bloc"], importance: "required" },
      { skill: "Firebase", importance: "required" },
      { skill: "Swift", importance: "preferred" },
    ],
    checklist: [
      {
        // Changed after the first run from "missing" only: SPEC §12.2 gives a related skill (React Native ↔ Flutter
        // in the taxonomy) half credit, so "partial" is the specified answer. Recorded in ROADMAP Decisions.
        id: "flutter-not-strong",
        expect: "Flutter isn't shown as a strength (related to React Native at most)",
        kind: "status",
        requirement: { skill: "Flutter" },
        status: ["missing", "partial"],
      },
      {
        id: "dart-missing",
        expect: "Dart is missing",
        kind: "status",
        requirement: { skill: "Dart" },
        status: ["missing"],
      },
      {
        id: "firebase",
        expect: "Firebase is a match",
        kind: "status",
        requirement: { skill: "Firebase" },
        status: ["strong", "partial"],
      },
      { id: "skills-blocker", expect: "Blocks on missing must-have skills", kind: "blocker", blocker: "skills" },
      {
        id: "flutter-flag",
        expect: "Names the switch to Flutter as the main gap",
        kind: "mentions",
        sections: ["summary", "redFlags", "risks"],
        terms: [["flutter"]],
      },
      { id: "low", expect: "Not recommended as is", kind: "recommendation", in: ["LOW_PRIORITY", "CONSIDER"] },
    ],
  },
  {
    id: "vikram-design-systems",
    cv: "vikram-table-heavy",
    targetRole: "UI Engineer",
    job: {
      title: "Design Systems Engineer",
      company: "Mosaic Retail Cloud",
      location: "Chennai",
      workMode: "hybrid",
      salaryText: "25-34 LPA",
      description: `Mosaic Retail Cloud is building a shared design system used by 12 product teams.

Responsibilities:
- Build and document accessible React components in Storybook
- Work with designers in Figma to define tokens and patterns
- Audit products against WCAG 2.2 and fix accessibility issues

Requirements:
- 5+ years of frontend development
- React and TypeScript
- Storybook
- Web accessibility (WCAG) in practice
- Design systems experience

Nice to have:
- Web performance tuning
- Visual regression testing`,
    },
    preferences: { expectedCtcLpa: 24, noticePeriodDays: 30, locations: ["Chennai"], workModes: ["hybrid", "remote"] },
    requirements: [
      { terms: ["5", "years"], importance: "required" },
      { skill: "React", importance: "required" },
      { skill: "TypeScript", importance: "required" },
      { skill: "Storybook", importance: "required" },
      { skill: "Web accessibility", importance: "required" },
      { skill: "Design systems", importance: "required" },
      { skill: "Web performance", importance: "nice_to_have" },
      { terms: ["visual regression"], importance: "nice_to_have" },
      { skill: "Figma", importance: "implied" },
    ],
    checklist: [
      {
        id: "a11y-strong",
        expect: "Web accessibility is a strong match",
        kind: "status",
        requirement: { skill: "Web accessibility" },
        status: ["strong"],
      },
      {
        id: "storybook-strong",
        expect: "Storybook is a strong match",
        kind: "status",
        requirement: { skill: "Storybook" },
        status: ["strong"],
      },
      { id: "apply", expect: "Recommends applying", kind: "recommendation", in: ["APPLY"] },
      {
        id: "a11y-standout",
        expect: "Leads with the accessibility work or certification",
        kind: "mentions",
        sections: ["summary", "standsOut", "strategy"],
        terms: [["accessib", "wcag"]],
      },
      {
        id: "design-system",
        expect: "Mentions the design-system work at Saffron",
        kind: "mentions",
        sections: ["summary", "standsOut", "strategy"],
        terms: [["design system", "saffron", "component"]],
      },
      { id: "evidence", expect: "What stands out cites the CV", kind: "citesEvidence", section: "standsOut" },
    ],
  },
  {
    id: "priya-angular-notice",
    cv: "priya-indian-format",
    targetRole: "Frontend Developer",
    job: {
      title: "Angular Developer",
      company: "Kestrel Insurance Tech",
      location: "Gurugram",
      workMode: "hybrid",
      salaryText: "10-14 LPA",
      description: `We need an Angular developer to build our policy servicing portal.

Requirements:
- 3+ years of experience with Angular
- RxJS and TypeScript
- Experience in insurance or financial services is a plus
- Immediate joiners or notice period of up to 30 days

Responsibilities:
- Build reactive forms and dashboards
- Work with the API team on REST integrations`,
    },
    preferences: { expectedCtcLpa: 12, noticePeriodDays: 60, locations: ["Gurugram"], workModes: ["hybrid", "remote"] },
    requirements: [
      { skill: "Angular", importance: "required" },
      { skill: "RxJS", importance: "required" },
      { skill: "TypeScript", importance: "required" },
      { terms: ["insurance"], importance: "preferred" },
      { skill: "REST APIs", importance: "implied" },
    ],
    checklist: [
      { id: "notice-blocker", expect: "Blocks on the 30-day notice against 60", kind: "blocker", blocker: "notice" },
      {
        id: "angular",
        expect: "Angular is a match",
        kind: "status",
        requirement: { skill: "Angular" },
        status: ["strong", "partial"],
      },
      {
        id: "notice-flag",
        expect: "Talks about the notice period",
        kind: "mentions",
        sections: ["summary", "redFlags", "risks", "strategy", "questions"],
        terms: [["notice"]],
      },
      {
        id: "buyout",
        expect: "Suggests asking about a notice buyout or early release",
        kind: "mentions",
        sections: ["questions", "strategy", "risks"],
        terms: [["buyout", "buy-out", "early release", "negotiat", "notice"]],
      },
      {
        id: "insurance",
        expect: "Notes the insurance experience at Brightline",
        kind: "mentions",
        sections: ["summary", "standsOut", "strategy", "requirements"],
        terms: [["insurance", "brightline"]],
      },
    ],
  },
  {
    id: "arjun-senior-react",
    cv: "arjun-linked-text",
    targetRole: "Frontend Developer",
    job: {
      title: "Senior React Developer",
      company: "Larkspur Media",
      location: "Mumbai",
      workMode: "hybrid",
      salaryText: null,
      description: `Larkspur Media is looking for a Senior React Developer with 5+ years of experience to lead the rebuild of our news site in Next.js. You'll own server-side rendering and SEO, work with TanStack Query and Tailwind CSS, and guide two junior developers. Strong TypeScript is a must. Experience with Vercel deployments is good to have.`,
    },
    preferences: { expectedCtcLpa: 16, noticePeriodDays: 30, locations: ["Mumbai"], workModes: ["hybrid", "remote"] },
    requirements: [
      { terms: ["5", "years"], importance: "required" },
      { skill: "React", importance: "required" },
      { skill: "Next.js", importance: "required" },
      { skill: "TypeScript", importance: "required" },
      { skill: "Server-side rendering", importance: "required" },
      { skill: "SEO", importance: "required" },
      { skill: "TanStack Query", importance: "required" },
      { skill: "Tailwind CSS", importance: "required" },
      { skill: "Vercel", importance: "preferred" },
      { skill: "Mentoring", importance: "implied" },
    ],
    checklist: [
      {
        id: "years-partial",
        expect: "The 5-year requirement isn't met (about 3)",
        kind: "status",
        requirement: { terms: ["5", "year"] },
        status: ["missing", "partial"],
      },
      {
        id: "years-flag",
        expect: "Flags the 5-year requirement against about 3",
        kind: "mentions",
        sections: ["summary", "redFlags", "risks"],
        terms: [["5"], ["year"]],
      },
      {
        id: "next-strong",
        expect: "Next.js is a strong match",
        kind: "status",
        requirement: { skill: "Next.js" },
        status: ["strong"],
      },
      {
        id: "tanstack",
        expect: "TanStack Query is a match",
        kind: "status",
        requirement: { skill: "TanStack Query" },
        status: ["strong", "partial"],
      },
      {
        id: "seo-gap",
        expect: "SEO is not shown as a strength",
        kind: "status",
        requirement: { skill: "SEO" },
        status: ["missing", "partial", "unclear"],
      },
      {
        id: "not-apply",
        expect: "Doesn't recommend applying straight away",
        kind: "recommendation",
        in: ["CONSIDER", "LOW_PRIORITY"],
      },
    ],
  },
  {
    id: "vikram-vue-nuxt",
    cv: "vikram-table-heavy",
    targetRole: "Frontend Developer",
    job: {
      title: "Frontend Developer (Vue.js)",
      company: "Tidepool Analytics",
      location: "Chennai",
      workMode: "remote",
      salaryText: "18-24 LPA",
      description: `Tidepool Analytics builds dashboards for logistics companies.

You will:
- Build dashboard screens in Vue 3 and Nuxt
- Manage state with Pinia
- Write component tests with Vitest

You have:
- 4+ years of frontend experience
- Vue.js 3 with the Composition API
- Nuxt
- Pinia
- Vitest or Jest

Bonus:
- D3.js or another charting library`,
    },
    preferences: { expectedCtcLpa: 24, noticePeriodDays: 30, locations: ["Chennai"], workModes: ["hybrid", "remote"] },
    requirements: [
      { terms: ["4", "years"], importance: "required" },
      { skill: "Vue.js", importance: "required" },
      { skill: "Nuxt", importance: "required" },
      { terms: ["pinia"], importance: "required" },
      { skill: "Vitest", importance: "required" },
      { skill: "D3.js", importance: "preferred" },
    ],
    checklist: [
      {
        id: "vue",
        expect: "Vue.js is a match (used 2020–2022)",
        kind: "status",
        requirement: { skill: "Vue.js" },
        status: ["strong", "partial"],
      },
      {
        id: "nuxt-missing",
        expect: "Nuxt is missing",
        kind: "status",
        requirement: { skill: "Nuxt" },
        status: ["missing", "partial", "unclear"],
      },
      {
        id: "vue-recency",
        expect: "Notes the Vue work at Tidewater Fintech",
        kind: "mentions",
        sections: ["summary", "standsOut", "risks", "strategy", "requirements"],
        terms: [["vue", "tidewater"]],
      },
      {
        id: "nuxt-risk",
        expect: "Names Nuxt or Pinia as a gap",
        kind: "mentions",
        sections: ["risks", "redFlags", "summary"],
        terms: [["nuxt", "pinia"]],
      },
      {
        id: "pinia-missing",
        expect: "Pinia is missing",
        kind: "status",
        requirement: { terms: ["pinia"] },
        status: ["missing", "unclear"],
      },
    ],
  },
];
