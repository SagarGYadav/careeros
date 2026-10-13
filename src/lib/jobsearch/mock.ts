// Mock job-search provider (SPEC §10.3): ~60 fictional Indian postings, so search, dedupe and ranking can be built
// and tested without keys. Every company and posting is invented. The data is deliberately messy the way real
// results are: company suffixes, city spellings, salary formats, near-duplicates, agency reposts, conditions.
import { normalizeForMatch } from "@/lib/cv/text";
import type { JobSearchProvider, NormalizedJob } from "./types";

type Seed = {
  title: string;
  company: string;
  city: string;
  exp: string;
  skills: string[];
  salary: string | null;
  mode: "remote" | "hybrid" | "onsite";
  days: number;
  extra?: string;
};

const COMPANIES = [
  "Kestrel Pay Pvt. Ltd.", "Lumen Logistics Private Limited", "Quill Commerce", "Banyan Analytics Technologies Pvt Ltd",
  "Marigold Health Inc.", "Saffron Retail Tech", "Orbit Learning Pvt. Ltd.", "Tidewater Fintech Solutions LLP",
  "Peregrine Mobility", "Brightline Insurance Services", "Cobalt Cloudworks", "Monsoon Labs", "Indigo Ledger Pvt Ltd",
  "Neem Software", "Garnet Games Studio", "Harbor HR Tech", "Vela Travel Technologies", "Jasmine Media Pvt. Ltd.",
]; // prettier-ignore

const STAFFING = "TalentBridge Staffing Solutions";

const SEEDS: Seed[] = [
  { title: "React Developer", company: COMPANIES[0], city: "Bengaluru", exp: "2-4 years", skills: ["React", "TypeScript", "Redux", "REST APIs"], salary: "₹10,00,000 - ₹16,00,000 a year", mode: "hybrid", days: 2 },
  { title: "Senior Frontend Engineer", company: COMPANIES[1], city: "Bangalore", exp: "5-8 years", skills: ["React", "Next.js", "TypeScript", "Web performance"], salary: "25-35 LPA", mode: "hybrid", days: 4 },
  { title: "Frontend Developer", company: COMPANIES[2], city: "Pune", exp: "3+ years", skills: ["React", "JavaScript", "CSS", "Jest"], salary: null, mode: "onsite", days: 1, extra: "Immediate joiners preferred. Notice period up to 30 days." },
  { title: "Next.js Developer", company: COMPANIES[3], city: "Mumbai", exp: "2-5 years", skills: ["Next.js", "React", "TypeScript", "Tailwind CSS"], salary: "₹1,20,000 - ₹1,60,000 a month", mode: "remote", days: 6 },
  { title: "Full Stack Developer (MERN)", company: COMPANIES[4], city: "Hyderabad", exp: "3-6 years", skills: ["React", "Node.js", "MongoDB", "Express"], salary: "12-18 LPA", mode: "hybrid", days: 3 },
  { title: "React Native Developer", company: COMPANIES[8], city: "Hyderabad", exp: "2-4 years", skills: ["React Native", "Expo", "TypeScript", "Redux"], salary: "Not disclosed", mode: "onsite", days: 9 },
  { title: "UI Engineer - Design Systems", company: COMPANIES[5], city: "Chennai", exp: "4-7 years", skills: ["React", "Storybook", "Figma", "Web accessibility"], salary: "₹18L – ₹26L a year", mode: "hybrid", days: 5 },
  { title: "Software Engineer - Frontend", company: COMPANIES[6], city: "Gurugram", exp: "1-3 years", skills: ["Angular", "TypeScript", "RxJS"], salary: "8-12 LPA", mode: "onsite", days: 12, extra: "Service bond of 18 months applies." },
  { title: "Lead Frontend Engineer", company: COMPANIES[7], city: "Bengaluru", exp: "8-12 years", skills: ["React", "Micro-frontends", "TypeScript", "Leadership"], salary: "45-60 LPA", mode: "hybrid", days: 2 },
  { title: "Junior React Developer", company: COMPANIES[9], city: "Noida", exp: "0-1 years", skills: ["React", "JavaScript", "HTML", "CSS"], salary: "3.5-5 LPA", mode: "onsite", days: 7 },
  { title: "Node.js Backend Developer", company: COMPANIES[10], city: "Pune", exp: "3-5 years", skills: ["Node.js", "PostgreSQL", "Docker", "AWS"], salary: "14-20 LPA", mode: "remote", days: 4 },
  { title: "Frontend Developer - React", company: COMPANIES[11], city: "Remote", exp: "2-4 years", skills: ["React", "TypeScript", "GraphQL"], salary: "$30,000 - $40,000 a year", mode: "remote", days: 8 },
  { title: "Senior React Developer", company: COMPANIES[12], city: "Gurgaon", exp: "5-7 years", skills: ["React", "Redux", "TypeScript", "Jest"], salary: "22-30 LPA", mode: "onsite", days: 1, extra: "Rotational night shifts to support US clients." },
  { title: "JavaScript Developer", company: COMPANIES[13], city: "Chennai", exp: "2-4 years", skills: ["JavaScript", "Vue.js", "Node.js"], salary: null, mode: "onsite", days: 15 },
  { title: "Frontend Engineer (Games)", company: COMPANIES[14], city: "Hyderabad", exp: "3-5 years", skills: ["TypeScript", "WebGL", "React"], salary: "16-22 LPA", mode: "hybrid", days: 10 },
  { title: "React Developer - Contract to Hire", company: STAFFING, city: "Bengaluru", exp: "3-5 years", skills: ["React", "Redux", "JavaScript"], salary: "₹90,000 a month", mode: "onsite", days: 3, extra: "Contract to hire for a leading fintech client. 5 days work from office." },
  { title: "Full Stack Engineer", company: COMPANIES[15], city: "Mumbai", exp: "4-6 years", skills: ["Next.js", "Node.js", "PostgreSQL", "Prisma"], salary: "20-28 LPA", mode: "hybrid", days: 5 },
  { title: "Frontend Developer", company: COMPANIES[16], city: "Bengaluru", exp: "2-5 years", skills: ["React", "TypeScript", "CSS Modules"], salary: "Not disclosed", mode: "hybrid", days: 20 },
  { title: "Web Developer", company: COMPANIES[17], city: "Mumbai", exp: "1-3 years", skills: ["HTML", "CSS", "JavaScript", "WordPress"], salary: "4-6 LPA", mode: "onsite", days: 2 },
  { title: "Java Backend Engineer", company: COMPANIES[10], city: "Pune", exp: "4-8 years", skills: ["Java", "Spring Boot", "Kafka"], salary: "18-26 LPA", mode: "onsite", days: 6 },
  { title: "Data Analyst", company: COMPANIES[2], city: "Pune", exp: "1-3 years", skills: ["SQL", "Excel", "Power BI"], salary: "6-9 LPA", mode: "onsite", days: 3 },
  { title: "DevOps Engineer", company: COMPANIES[3], city: "Mumbai", exp: "3-6 years", skills: ["Kubernetes", "Terraform", "AWS"], salary: "18-24 LPA", mode: "hybrid", days: 11 },
  { title: "Principal Frontend Architect", company: COMPANIES[1], city: "Bengaluru", exp: "12+ years", skills: ["React", "Architecture", "Leadership"], salary: "70-90 LPA", mode: "hybrid", days: 14 },
  { title: "Frontend Intern", company: COMPANIES[13], city: "Chennai", exp: "0 years", skills: ["HTML", "CSS", "JavaScript"], salary: "₹20,000 a month", mode: "onsite", days: 4 },
  { title: "Next.js Engineer", company: COMPANIES[0], city: "Remote", exp: "3-6 years", skills: ["Next.js", "React", "TypeScript", "Vercel"], salary: "18-25 LPA", mode: "remote", days: 1 },
  { title: "React.js Developer", company: COMPANIES[4], city: "Hyderabad", exp: "2-4 years", skills: ["React", "Redux Toolkit", "TypeScript"], salary: "10-14 LPA", mode: "hybrid", days: 35 },
  { title: "SDE 2 - Frontend", company: COMPANIES[12], city: "Bengaluru", exp: "3-5 years", skills: ["React", "TypeScript", "System design"], salary: "28-36 LPA", mode: "hybrid", days: 2 },
  { title: "Mobile Developer (React Native)", company: COMPANIES[16], city: "Gurugram", exp: "3-6 years", skills: ["React Native", "TypeScript", "Firebase"], salary: "15-22 LPA", mode: "hybrid", days: 8 },
  { title: "UI Developer", company: COMPANIES[17], city: "Noida", exp: "2-5 years", skills: ["HTML", "CSS", "JavaScript", "Figma"], salary: "7-11 LPA", mode: "onsite", days: 5 },
  { title: "Frontend Engineer", company: COMPANIES[15], city: "Remote", exp: "4-7 years", skills: ["React", "TypeScript", "Testing Library", "Accessibility"], salary: "24-32 LPA", mode: "remote", days: 3 },
]; // prettier-ignore

// Near-duplicates the dedupe step must merge: the same jobs reposted with small differences.
const DUPLICATES: { of: number; title?: string; city?: string; company?: string; days: number }[] = [
  { of: 0, title: "React JS Developer", city: "Bangalore", days: 3 },
  { of: 2, company: "Quill Commerce Pvt Ltd", days: 2 },
  { of: 3, title: "NextJS Developer", days: 7 },
  { of: 12, city: "Gurugram", days: 2 },
  { of: 26, title: "SDE II - Frontend", days: 4 },
];

function description(seed: Seed): string {
  const mode = {
    remote: "This role is fully remote within India.",
    hybrid: "Hybrid: 3 days a week in the office.",
    onsite: "Work from office.",
  }[seed.mode];
  return [
    `${seed.company} is hiring a ${seed.title} in ${seed.city}.`,
    `Experience: ${seed.exp}.`,
    `You will build and maintain product features using ${seed.skills.join(", ")}.`,
    "Responsibilities: ship features end to end, review code, write tests and work closely with design and product.",
    `Requirements: strong ${seed.skills[0]} skills; experience with ${seed.skills.slice(1).join(" and ")}; good communication.`,
    mode,
    seed.salary ? `Compensation: ${seed.salary}.` : "",
    seed.extra ?? "",
  ]
    .filter(Boolean)
    .join("\n");
}

/** Every mock posting, dated relative to `now`. */
export function mockPostings(now: Date): NormalizedJob[] {
  const seeds = SEEDS.flatMap((seed, index) => [
    { seed, id: `mock-${index + 1}`, days: seed.days },
    ...DUPLICATES.filter((d) => d.of === index).map((d, n) => ({
      seed: { ...seed, title: d.title ?? seed.title, city: d.city ?? seed.city, company: d.company ?? seed.company },
      id: `mock-${index + 1}-dup${n + 1}`,
      days: d.days,
    })),
  ]);
  // A second batch in other cities makes ~60 postings in total.
  const otherCities = ["Pune", "Hyderabad", "Chennai", "Mumbai", "Noida"];
  const more = SEEDS.slice(0, 25).map((seed, index) => ({
    seed: {
      ...seed,
      city: seed.city === "Remote" ? "Remote" : otherCities[index % otherCities.length],
      company: COMPANIES[(index + 7) % COMPANIES.length],
    },
    id: `mock-b${index + 1}`,
    days: (seed.days + index) % 28,
  }));
  return [...seeds, ...more].map(({ seed, id, days }) => ({
    provider: "mock",
    externalId: id,
    title: seed.title,
    company: seed.company,
    location: seed.city === "Remote" ? "Remote, India" : `${seed.city}, India`,
    description: description(seed),
    descriptionTruncated: false,
    salaryText: seed.salary,
    salaryMin: null,
    salaryMax: null,
    salaryEstimated: false,
    employmentType: /contract/i.test(seed.title) ? "Contract" : /intern/i.test(seed.title) ? "Internship" : "Full-time",
    workModeHint: seed.mode,
    postedAt: new Date(now.getTime() - days * 86_400_000),
    postedVia: seed.company === STAFFING ? "Naukri" : "Company website",
    applyLinks: [{ site: "Company website", url: `https://careers.example.com/jobs/${id}` }],
  }));
}

const PAGE_SIZE = 20;
const STOP_WORDS = new Set(["developer", "engineer", "senior", "junior", "lead", "sde", "software", "-", "the", "and"]);

/** Mock search: title words must overlap the query; location is a city or Remote. */
export function mockProvider(now: () => Date = () => new Date()): JobSearchProvider {
  return {
    name: "mock",
    label: "Mock job search (sample postings)",
    configured: true,
    isMock: true,
    limits: {},
    async search(params) {
      const words = normalizeForMatch(params.query)
        .split(" ")
        .filter((w) => w && !STOP_WORDS.has(w));
      const wanted = normalizeForMatch(params.location)
        .replace(/\bbangalore\b/, "bengaluru")
        .replace(/\bgurgaon\b/, "gurugram");
      const matches = mockPostings(now()).filter((job) => {
        const title = normalizeForMatch(job.title).replace(/\./g, "");
        const titleHit = words.length === 0 || words.some((w) => title.includes(w.replace(/\./g, "")));
        const place = normalizeForMatch(job.location)
          .replace(/\bbangalore\b/, "bengaluru")
          .replace(/\bgurgaon\b/, "gurugram");
        return (
          titleHit &&
          (wanted.startsWith("remote") ? place.startsWith("remote") : place.startsWith(wanted.split(" ")[0]))
        );
      });
      const page = Number(params.page ?? "1");
      const slice = matches.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
      return {
        jobs: slice,
        nextPage: page * PAGE_SIZE < matches.length ? String(page + 1) : undefined,
        requestsUsed: 1,
      };
    },
  };
}
