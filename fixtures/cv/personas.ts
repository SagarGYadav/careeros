// Six fictional CVs used to test CV extraction (SPEC §9.4). Every person, company, email, phone number and link is
// invented; example.com and example.dev are reserved for documentation. The files in this folder are generated
// from this data by `npm run fixtures:cv`, and the expected answers for evals come from the same data.

export type CvFixture = {
  id: string;
  /** How the file is laid out: the extraction pipeline must cope with each. */
  layout: "single-column" | "two-column" | "docx" | "table-heavy" | "indian-format" | "linked-text";
  format: "pdf" | "docx";
  personal: {
    fullName: string;
    email: string;
    phone: string;
    city: string;
    state?: string;
    country: string;
    linkedin?: string;
    github?: string;
    portfolio?: string;
    /** Indian-format CVs often list these; they must be captured but never used for matching. */
    other?: Record<string, string>;
  };
  headline: string;
  summary: string;
  experience: {
    company: string;
    title: string;
    location: string;
    employmentType?: string;
    start: string;
    /** null = current role */
    end: string | null;
    bullets: string[];
    technologies: string[];
  }[];
  projects: { name: string; description: string; technologies: string[]; link?: string; bullets: string[] }[];
  education: { institution: string; degree: string; field: string; start: string; end: string; grade: string }[];
  certifications: { name: string; issuer: string; issueDate: string; credentialId?: string }[];
  skills: { group: string; items: string[] }[];
  languages?: string[];
  awards?: string[];
  interests?: string[];
  jobSearch?: { noticePeriod?: string; currentCtc?: string; expectedCtc?: string; preferredLocations?: string[] };
};

export const CV_FIXTURES: CvFixture[] = [
  {
    id: "ananya-single-column",
    layout: "single-column",
    format: "pdf",
    personal: {
      fullName: "Ananya Iyer",
      email: "ananya.iyer@example.com",
      phone: "+91 98765 43210",
      city: "Bengaluru",
      state: "Karnataka",
      country: "India",
      linkedin: "https://www.linkedin.com/in/ananya-iyer-example",
      github: "https://github.com/ananya-iyer-example",
    },
    headline: "Frontend Developer · React, Next.js, TypeScript",
    summary:
      "Frontend developer with 3+ years building fast, accessible React and Next.js applications for fintech products. Comfortable owning features from design hand-off to production monitoring.",
    experience: [
      {
        company: "Kestrel Pay",
        title: "Frontend Developer",
        location: "Bengaluru",
        employmentType: "Full-time",
        start: "2023-04",
        end: null,
        bullets: [
          "Rebuilt the merchant dashboard in Next.js and TypeScript, cutting page load time by 38%.",
          "Built a shared component library with Storybook used by 4 product teams.",
          "Introduced React Testing Library and Jest, raising unit test coverage from 22% to 71%.",
          "Worked with designers in Figma to ship an accessible checkout flow meeting WCAG 2.1 AA.",
        ],
        technologies: ["Next.js", "React", "TypeScript", "Tailwind CSS", "Storybook", "Jest"],
      },
      {
        company: "Lumen Logistics",
        title: "Associate Software Engineer",
        location: "Bengaluru",
        employmentType: "Full-time",
        start: "2021-07",
        end: "2023-03",
        bullets: [
          "Developed shipment-tracking screens in React with Redux Toolkit and REST APIs.",
          "Reduced bundle size by 120 KB by code-splitting routes with React.lazy.",
          "Fixed cross-browser layout issues for Safari and older Android browsers.",
        ],
        technologies: ["React", "Redux Toolkit", "JavaScript", "Sass", "REST APIs"],
      },
    ],
    projects: [
      {
        name: "Budget Buddy",
        description: "Personal finance tracker with charts and offline support.",
        technologies: ["React", "Vite", "IndexedDB", "Recharts"],
        link: "https://github.com/ananya-iyer-example/budget-buddy",
        bullets: ["Works offline as a PWA with background sync.", "Visualises monthly spending with Recharts."],
      },
    ],
    education: [
      {
        institution: "PES University",
        degree: "B.Tech",
        field: "Computer Science and Engineering",
        start: "2017-08",
        end: "2021-06",
        grade: "8.4 CGPA",
      },
    ],
    certifications: [
      { name: "Meta Front-End Developer Professional Certificate", issuer: "Coursera", issueDate: "2022-11" },
    ],
    skills: [
      { group: "Languages", items: ["JavaScript", "TypeScript", "HTML", "CSS"] },
      { group: "Frameworks", items: ["React", "Next.js", "Redux Toolkit", "Tailwind CSS"] },
      { group: "Testing and tools", items: ["Jest", "React Testing Library", "Storybook", "Git", "Figma"] },
    ],
    languages: ["English", "Tamil", "Kannada"],
  },
  {
    id: "rohan-two-column",
    layout: "two-column",
    format: "pdf",
    personal: {
      fullName: "Rohan Mehta",
      email: "rohan.mehta@example.com",
      phone: "+91 98765 43211",
      city: "Pune",
      state: "Maharashtra",
      country: "India",
      linkedin: "https://www.linkedin.com/in/rohan-mehta-example",
      github: "https://github.com/rohan-mehta-example",
      portfolio: "https://rohanmehta.example.dev",
    },
    headline: "Full Stack Engineer (MERN, Next.js)",
    summary:
      "Full stack engineer with 5 years of experience across React, Node.js and PostgreSQL. Led a team of 3 to launch a B2B ordering platform used by 1,200 retailers.",
    experience: [
      {
        company: "Quill Commerce",
        title: "Senior Software Engineer",
        location: "Pune",
        employmentType: "Full-time",
        start: "2022-01",
        end: null,
        bullets: [
          "Led a team of 3 engineers to build a B2B ordering platform in Next.js and Node.js.",
          "Designed PostgreSQL schemas and REST APIs serving 2 million requests per day.",
          "Moved CI to GitHub Actions with Docker builds, cutting deploy time from 25 to 8 minutes.",
          "Mentored 2 junior developers through code reviews and pairing.",
        ],
        technologies: ["Next.js", "Node.js", "Express", "PostgreSQL", "Docker", "GitHub Actions"],
      },
      {
        company: "Banyan Analytics",
        title: "Software Engineer",
        location: "Mumbai",
        employmentType: "Full-time",
        start: "2019-06",
        end: "2021-12",
        bullets: [
          "Built analytics dashboards in React with D3.js for 40 enterprise clients.",
          "Wrote MongoDB aggregation pipelines that reduced report generation time by 60%.",
          "Added Cypress end-to-end tests for the 10 most-used user journeys.",
        ],
        technologies: ["React", "D3.js", "Node.js", "MongoDB", "Cypress"],
      },
    ],
    projects: [
      {
        name: "OpenShelf",
        description: "Open-source library management app for small schools.",
        technologies: ["Next.js", "Prisma", "PostgreSQL"],
        link: "https://github.com/rohan-mehta-example/openshelf",
        bullets: ["Used by 6 schools; 120 GitHub stars."],
      },
    ],
    education: [
      {
        institution: "College of Engineering, Pune",
        degree: "B.E.",
        field: "Information Technology",
        start: "2015-08",
        end: "2019-05",
        grade: "76%",
      },
    ],
    certifications: [
      {
        name: "AWS Certified Developer – Associate",
        issuer: "Amazon Web Services",
        issueDate: "2023-05",
        credentialId: "AWS-DVA-EX-4821",
      },
    ],
    skills: [
      { group: "Frontend", items: ["React", "Next.js", "TypeScript", "Redux"] },
      { group: "Backend", items: ["Node.js", "Express", "REST APIs", "GraphQL"] },
      { group: "Data", items: ["PostgreSQL", "MongoDB", "Redis"] },
      { group: "DevOps", items: ["Docker", "AWS", "GitHub Actions"] },
    ],
    languages: ["English", "Hindi", "Marathi"],
    awards: ["Quill Commerce Engineering Excellence Award, 2023"],
  },
  {
    id: "sneha-docx",
    layout: "docx",
    format: "docx",
    personal: {
      fullName: "Sneha Kulkarni",
      email: "sneha.kulkarni@example.com",
      phone: "+91 98765 43212",
      city: "Hyderabad",
      state: "Telangana",
      country: "India",
      linkedin: "https://www.linkedin.com/in/sneha-kulkarni-example",
    },
    headline: "React Native Developer",
    summary:
      "Mobile developer with 2.5 years of React Native experience shipping consumer apps to the Play Store and App Store.",
    experience: [
      {
        company: "Marigold Health",
        title: "React Native Developer",
        location: "Hyderabad",
        employmentType: "Full-time",
        start: "2023-02",
        end: null,
        bullets: [
          "Built the patient app in React Native and Expo, rated 4.6 on the Play Store.",
          "Added offline appointment booking with Redux Persist and background sync.",
          "Cut crash rate from 2.1% to 0.4% by fixing memory leaks found with Flipper.",
        ],
        technologies: ["React Native", "Expo", "TypeScript", "Redux"],
      },
      {
        company: "Peregrine Mobility",
        title: "Junior Mobile Developer",
        location: "Hyderabad",
        employmentType: "Internship",
        start: "2022-06",
        end: "2023-01",
        bullets: [
          "Implemented ride-tracking screens with React Native Maps.",
          "Wrote Jest tests for booking and payment reducers.",
        ],
        technologies: ["React Native", "JavaScript", "Jest"],
      },
    ],
    projects: [
      {
        name: "Chai Break",
        description: "Habit tracker app with reminders.",
        technologies: ["React Native", "Expo", "Firebase"],
        bullets: ["Published on the Play Store with 1,000+ downloads."],
      },
    ],
    education: [
      {
        institution: "Jawaharlal Nehru Technological University",
        degree: "B.Tech",
        field: "Electronics and Communication Engineering",
        start: "2018-08",
        end: "2022-05",
        grade: "7.9 CGPA",
      },
    ],
    certifications: [],
    skills: [
      { group: "Mobile", items: ["React Native", "Expo", "Android"] },
      { group: "Languages", items: ["TypeScript", "JavaScript"] },
      { group: "State and data", items: ["Redux", "Firebase", "REST APIs"] },
      { group: "Testing", items: ["Jest"] },
    ],
    interests: ["Badminton", "Sketching"],
  },
  {
    id: "vikram-table-heavy",
    layout: "table-heavy",
    format: "pdf",
    personal: {
      fullName: "Vikram Nair",
      email: "vikram.nair@example.com",
      phone: "+91 98765 43213",
      city: "Chennai",
      state: "Tamil Nadu",
      country: "India",
      linkedin: "https://www.linkedin.com/in/vikram-nair-example",
      portfolio: "https://vikramnair.example.dev",
    },
    headline: "UI Engineer · Design Systems & Accessibility",
    summary:
      "UI engineer with 4 years of experience building design systems and accessible interfaces in React and Vue.",
    experience: [
      {
        company: "Saffron Retail Tech",
        title: "UI Engineer",
        location: "Chennai",
        employmentType: "Full-time",
        start: "2022-08",
        end: null,
        bullets: [
          "Own the company design system: 60 React components documented in Storybook.",
          "Ran accessibility audits with axe and fixed 140 WCAG issues across 3 apps.",
          "Built Figma-to-code token pipeline used by 5 teams.",
        ],
        technologies: ["React", "TypeScript", "Storybook", "CSS Modules", "Figma"],
      },
      {
        company: "Tidewater Fintech",
        title: "Frontend Developer",
        location: "Chennai",
        employmentType: "Full-time",
        start: "2020-07",
        end: "2022-07",
        bullets: [
          "Built customer onboarding screens in Vue.js and Vuex.",
          "Improved Lighthouse performance score from 54 to 91 on the landing pages.",
        ],
        technologies: ["Vue.js", "JavaScript", "Sass"],
      },
    ],
    projects: [],
    education: [
      {
        institution: "Anna University",
        degree: "B.E.",
        field: "Computer Science",
        start: "2016-08",
        end: "2020-05",
        grade: "8.1 CGPA",
      },
    ],
    certifications: [{ name: "Web Accessibility Specialist (WAS)", issuer: "IAAP", issueDate: "2023-09" }],
    skills: [
      { group: "Core", items: ["HTML", "CSS", "JavaScript", "TypeScript"] },
      { group: "Frameworks", items: ["React", "Vue.js"] },
      { group: "Design systems", items: ["Storybook", "Figma", "Design systems"] },
      { group: "Quality", items: ["Web accessibility", "Web performance", "Jest"] },
    ],
  },
  {
    id: "priya-indian-format",
    layout: "indian-format",
    format: "pdf",
    personal: {
      fullName: "Priya Sharma",
      email: "priya.sharma@example.com",
      phone: "+91 98765 43214",
      city: "Gurugram",
      state: "Haryana",
      country: "India",
      other: {
        "Date of Birth": "14 March 1997",
        Nationality: "Indian",
        "Languages Known": "English, Hindi, Punjabi",
      },
    },
    headline: "Software Engineer – Angular & React",
    summary:
      "Software engineer with 3.5 years of experience developing web applications in Angular and React for insurance and HR clients.",
    experience: [
      {
        company: "Orbit Learning Pvt. Ltd.",
        title: "Software Engineer",
        location: "Gurugram",
        employmentType: "Full-time",
        start: "2022-05",
        end: null,
        bullets: [
          "Developed course-authoring modules in React with TypeScript and Material UI.",
          "Integrated REST APIs for assessments and reporting.",
          "Reduced form errors by 30% by adding React Hook Form validation.",
        ],
        technologies: ["React", "TypeScript", "Material UI", "React Hook Form"],
      },
      {
        company: "Brightline Insurance Services",
        title: "Associate Developer",
        location: "Noida",
        employmentType: "Full-time",
        start: "2021-01",
        end: "2022-04",
        bullets: [
          "Built policy management screens in Angular 12 with RxJS.",
          "Wrote unit tests with Jasmine and Karma for 15 components.",
        ],
        technologies: ["Angular", "RxJS", "TypeScript"],
      },
    ],
    projects: [],
    education: [
      {
        institution: "Guru Gobind Singh Indraprastha University",
        degree: "B.Tech",
        field: "Information Technology",
        start: "2016-08",
        end: "2020-07",
        grade: "72%",
      },
    ],
    certifications: [{ name: "Angular – The Complete Guide", issuer: "Udemy", issueDate: "2021-03" }],
    skills: [
      {
        group: "Technical skills",
        items: ["Angular", "React", "TypeScript", "JavaScript", "RxJS", "Material UI", "HTML", "CSS"],
      },
    ],
    jobSearch: {
      noticePeriod: "60 days",
      currentCtc: "8.5 LPA",
      expectedCtc: "12 LPA",
      preferredLocations: ["Gurugram", "Noida", "Remote"],
    },
  },
  {
    id: "arjun-linked-text",
    layout: "linked-text",
    format: "pdf",
    personal: {
      fullName: "Arjun Desai",
      email: "arjun.desai@example.com",
      phone: "+91 98765 43215",
      city: "Mumbai",
      state: "Maharashtra",
      country: "India",
      linkedin: "https://www.linkedin.com/in/arjun-desai-example",
      github: "https://github.com/arjun-desai-example",
      portfolio: "https://arjundesai.example.dev",
    },
    headline: "Next.js Developer",
    summary:
      "Next.js developer with 2 years of experience building server-rendered marketing sites and dashboards with a focus on Core Web Vitals.",
    experience: [
      {
        company: "Banyan Analytics",
        title: "Frontend Engineer",
        location: "Mumbai",
        employmentType: "Full-time",
        start: "2023-07",
        end: null,
        bullets: [
          "Migrated 30 marketing pages to the Next.js App Router with static generation.",
          "Improved Largest Contentful Paint from 3.9s to 1.6s on mobile.",
          "Built a reusable form system with Zod and React Hook Form.",
        ],
        technologies: ["Next.js", "React", "TypeScript", "Zod", "Vercel"],
      },
    ],
    projects: [
      {
        name: "Monsoon Weather",
        description: "Weather dashboard with city search.",
        technologies: ["Next.js", "TanStack Query", "Tailwind CSS"],
        link: "https://github.com/arjun-desai-example/monsoon-weather",
        bullets: ["Caches forecasts with TanStack Query.", "Scores 100 for accessibility in Lighthouse."],
      },
    ],
    education: [
      {
        institution: "University of Mumbai",
        degree: "B.Sc.",
        field: "Information Technology",
        start: "2020-07",
        end: "2023-05",
        grade: "9.1 CGPA",
      },
    ],
    certifications: [],
    skills: [
      { group: "Skills", items: ["Next.js", "React", "TypeScript", "Tailwind CSS", "TanStack Query", "Vercel", "Git"] },
    ],
  },
];

/** What a correct extraction must find, used by the ResumeParser eval (SPEC §9.4). */
export function expectedExtraction(cv: CvFixture) {
  return {
    id: cv.id,
    personal: {
      fullName: cv.personal.fullName,
      email: cv.personal.email,
      phone: cv.personal.phone,
      linkedin: cv.personal.linkedin ?? null,
      github: cv.personal.github ?? null,
      portfolio: cv.personal.portfolio ?? null,
    },
    experience: cv.experience.map((e) => ({ company: e.company, title: e.title, start: e.start, end: e.end })),
    bulletCount:
      cv.experience.reduce((n, e) => n + e.bullets.length, 0) + cv.projects.reduce((n, p) => n + p.bullets.length, 0),
    skills: [...new Set(cv.skills.flatMap((g) => g.items))],
    education: cv.education.map((e) => ({ institution: e.institution, degree: e.degree, grade: e.grade })),
    certifications: cv.certifications.map((c) => c.name),
    jobSearch: cv.jobSearch ?? null,
  };
}
