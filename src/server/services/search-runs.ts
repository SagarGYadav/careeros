import "server-only";
import { createHash } from "node:crypto";
import { z } from "zod";
import { AppError, isAppError } from "@/lib/errors";
import { isSameJob, mergeApplyLinks, preferDescription, type DedupeKey } from "@/lib/jobs/dedupe";
import { canonicalCity } from "@/lib/jobs/normalize";
import { buildSearchPlan, type PlannedQuery } from "@/lib/jobs/plan";
import { prepareJob, type PreparedJob } from "@/lib/jobs/prepare";
import { scoreJob, type RankingProfile } from "@/lib/jobs/relevance";
import type { Conditions } from "@/lib/jobs/conditions";
import type { ApplyLink, JobSearchParams, NormalizedJob } from "@/lib/jobsearch/types";
import { embeddings, loadEmbeddingProviders } from "@/server/embeddings/runner";
import { jobSearch } from "@/server/jobsearch/runner";
import {
  countJobs,
  createJobs,
  findDedupeCandidates,
  listJobsForRanking,
  mergeIntoJob,
  runBatch,
  saveScores,
  topJobsOfRun,
  upsertCompanies,
  type NewJobRow,
} from "@/server/repositories/jobs";
import { getCareerProfile, getProfileEntries } from "@/server/repositories/profile";
import {
  createSearchRun,
  getActiveSearchRun,
  getLatestFinishedRun,
  getSearchRun,
  saveSearchRun,
} from "@/server/repositories/search-runs";
import { formatSalaryRange } from "@/lib/format";
import { listSkillCatalogue, listSkillImplicationIds, listUserSkills } from "@/server/repositories/skills";
import { listTargetRoles } from "@/server/repositories/target-roles";
import {
  getProfileEmbeddingInfo,
  jobSimilarities,
  jobsNeedingEmbedding,
  setJobEmbeddings,
  setProfileEmbedding,
} from "@/server/repositories/vectors";

// Search runs (SPEC §10.4, §11.5): the browser calls advance() again and again; each call works for a short time
// budget and saves where it stopped, so a run survives free-hosting time limits and a closed tab.

const num = (value: string | undefined, fallback: number) => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};
const MAX_QUERIES = () => num(process.env.JOB_SEARCH_MAX_QUERIES_PER_RUN, 8);
const PRIORITY_QUERIES = () => num(process.env.SERPAPI_PRIORITY_QUERIES_PER_RUN, 2);
const COUNTRY = () => process.env.JOB_SEARCH_COUNTRY || "in";
const COUNTRY_NAMES: Record<string, string> = { in: "India" };
/** Work per advance() call; stays well under the 60 s limit of free serverless hosting. */
const STEP_BUDGET_MS = 15_000;
const EMBED_PAGE = 48;
const RANK_PAGE = 200;

const stateSchema = z.object({
  stage: z.enum(["search", "embed", "rank", "done"]),
  queryIndex: z.number().int(),
  embedded: z.number().int(),
  embeddingsDeferred: z.boolean(),
  rankAfter: z.string().nullable(),
  ranked: z.number().int(),
  rankTotal: z.number().int(),
});
type RunState = z.infer<typeof stateSchema>;
const planSchema = z.object({
  queries: z.array(
    z.object({ query: z.string(), location: z.string(), priority: z.boolean(), roleIds: z.array(z.string()) }),
  ),
});

export type RunProgress = {
  runId: string;
  status: "running" | "done" | "failed";
  stage: RunState["stage"];
  queriesDone: number;
  queriesTotal: number;
  found: number;
  newJobs: number;
  duplicates: number;
  embedded: number;
  embeddingsDeferred: boolean;
  ranked: number;
  rankTotal: number;
  errors: string[];
};

type RunRow = NonNullable<Awaited<ReturnType<typeof getSearchRun>>>;

function progressOf(run: RunRow): RunProgress {
  const state = stateSchema.parse(run.state);
  const plan = planSchema.parse(run.plan);
  return {
    runId: run.id,
    status: run.status as RunProgress["status"],
    stage: state.stage,
    queriesDone: Math.min(state.queryIndex, plan.queries.length),
    queriesTotal: plan.queries.length,
    found: run.resultCount,
    newJobs: run.newCount,
    duplicates: run.duplicateCount,
    embedded: state.embedded,
    embeddingsDeferred: state.embeddingsDeferred,
    ranked: state.ranked,
    rankTotal: state.rankTotal,
    errors: z
      .array(z.object({ message: z.string() }))
      .catch([])
      .parse(run.errors)
      .map((e) => e.message),
  };
}

/** Starts a run for the selected target roles, or returns the one already in progress. */
export async function startSearchRun(userId: string): Promise<RunProgress> {
  const active = await getActiveSearchRun(userId);
  if (active) return progressOf(active);

  const [roles, profile] = await Promise.all([listTargetRoles(userId), getCareerProfile(userId)]);
  const selected = roles.filter((r) => r.selected);
  if (!selected.length) {
    throw new AppError("VALIDATION", { message: "Select at least one target role to search for." });
  }
  const locations = [
    ...new Set((profile?.preferredLocations ?? []).map(canonicalCity).filter((c): c is string => Boolean(c))),
  ];
  const plan = buildSearchPlan({
    roles: selected.map((r) => ({ id: r.id, titleVariants: r.titleVariants.length ? r.titleVariants : [r.title] })),
    locations,
    wantsRemote: (profile?.workModes ?? []).includes("remote"),
    maxQueries: MAX_QUERIES(),
    priorityCount: PRIORITY_QUERIES(),
    countryName: COUNTRY_NAMES[COUNTRY()] ?? COUNTRY(),
  });
  const state: RunState = {
    stage: "search",
    queryIndex: 0,
    embedded: 0,
    embeddingsDeferred: false,
    rankAfter: null,
    ranked: 0,
    rankTotal: 0,
  };
  const run = await createSearchRun(userId, {
    targetRoleIds: selected.map((r) => r.id),
    plan: { queries: plan },
    state,
  });
  return progressOf(run);
}

// ---------------------------------------------------------------------------------------------------------------
// Saving results: clean, drop duplicates (within the batch and against saved jobs), merge apply links.

type Counters = { found: number; newJobs: number; duplicates: number };

const keyOf = (job: PreparedJob): DedupeKey => ({
  provider: job.provider,
  externalId: job.externalId,
  companyKey: job.companyKey,
  city: job.city,
  title: job.title,
  descriptionHash: job.descriptionHash,
  postedAt: job.postedAt,
});

const linksOf = (value: unknown): ApplyLink[] =>
  z
    .array(z.object({ site: z.string(), url: z.string() }))
    .catch([])
    .parse(value);

async function saveResults(
  userId: string,
  runId: string,
  jobs: NormalizedJob[],
  roleIds: string[],
  now: Date,
): Promise<Counters> {
  const unique: PreparedJob[] = [];
  let duplicates = 0;
  for (const job of jobs.map((j) => prepareJob(j, now))) {
    const same = unique.findIndex((u) => isSameJob(keyOf(u), keyOf(job)));
    if (same < 0) {
      unique.push(job);
      continue;
    }
    duplicates++;
    const keep = preferDescription(
      { description: unique[same].description, truncated: unique[same].descriptionTruncated },
      { description: job.description, truncated: job.descriptionTruncated },
    );
    const merged = keep === "b" ? { ...job } : { ...unique[same] };
    merged.applyLinks = mergeApplyLinks(unique[same].applyLinks, job.applyLinks);
    merged.isDirectFromCompany = unique[same].isDirectFromCompany || job.isDirectFromCompany;
    unique[same] = merged;
  }

  const companies = await upsertCompanies(
    userId,
    unique.map((j) => ({ name: j.companyName, key: j.companyKey, isStaffing: j.isStaffing })),
  );
  const candidates = await findDedupeCandidates(userId, {
    externalKeys: unique.map((j) => ({ provider: j.provider, externalId: j.externalId })),
    companyIds: [
      ...new Set(unique.map((j) => companies.get(j.companyKey)?.id).filter((id): id is string => Boolean(id))),
    ],
    hashes: unique.map((j) => j.descriptionHash),
  });

  const rows: NewJobRow[] = [];
  const merges = [];
  for (const job of unique) {
    const existing = candidates.find((c) =>
      isSameJob(
        {
          provider: c.provider,
          externalId: c.externalId,
          companyKey: c.company?.normalizedName ?? "",
          city: c.locationCity,
          title: c.title,
          descriptionHash: c.descriptionHash,
          postedAt: c.postedAt,
        },
        keyOf(job),
      ),
    );
    if (existing) {
      const sameListing = existing.provider === job.provider && existing.externalId === job.externalId;
      if (!sameListing) duplicates++;
      const links = mergeApplyLinks(linksOf(existing.applyLinks), job.applyLinks);
      const roles = [...new Set([...existing.targetRoleIds, ...roleIds])];
      const fuller =
        preferDescription(
          { description: existing.descriptionRaw, truncated: existing.descriptionTruncated },
          { description: job.description, truncated: job.descriptionTruncated },
        ) === "b";
      // Re-seeing the same listing changes nothing unless it adds links, roles or a fuller description.
      if (
        links.length !== linksOf(existing.applyLinks).length ||
        roles.length !== existing.targetRoleIds.length ||
        fuller
      ) {
        merges.push(
          mergeIntoJob(userId, existing.id, {
            applyLinks: links,
            targetRoleIds: roles,
            isDirectFromCompany: job.isDirectFromCompany,
            ...(fuller && {
              description: {
                descriptionRaw: job.description,
                descriptionHash: job.descriptionHash,
                descriptionTruncated: job.descriptionTruncated,
              },
            }),
          }),
        );
      }
      continue;
    }
    rows.push({
      companyId: companies.get(job.companyKey)?.id ?? null,
      companyName: job.companyName,
      title: job.title,
      targetRoleIds: roleIds,
      seniority: job.seniority,
      location: job.location,
      locationCity: job.city,
      workMode: job.workMode,
      employmentType: job.employmentType,
      salaryMinAnnual: job.salaryMinAnnual,
      salaryMaxAnnual: job.salaryMaxAnnual,
      salaryCurrency: job.salaryCurrency,
      salaryText: job.salaryText,
      salaryDisclosed: job.salaryDisclosed,
      expMinYears: job.expMinYears,
      expMaxYears: job.expMaxYears,
      descriptionRaw: job.description,
      descriptionHash: job.descriptionHash,
      descriptionTruncated: job.descriptionTruncated,
      origin: "search",
      provider: job.provider,
      externalId: job.externalId,
      postedVia: job.postedVia,
      isDirectFromCompany: job.isDirectFromCompany,
      applyLinks: job.applyLinks,
      postedAt: job.postedAt,
      searchRunId: runId,
      conditions: job.conditions,
      isStale: job.isStale,
    });
  }
  const created = await createJobs(userId, rows);
  await runBatch(merges);
  return { found: jobs.length, newJobs: created, duplicates };
}

// ---------------------------------------------------------------------------------------------------------------
// Ranking context: the profile as relevance ranking sees it.

const dealbreakersSchema = z
  .object({
    bond: z.boolean().catch(false),
    nightShift: z.boolean().catch(false),
    contractToHire: z.boolean().catch(false),
    maxWfoDaysPerWeek: z.number().nullable().catch(null),
  })
  .catch({ bond: false, nightShift: false, contractToHire: false, maxWfoDaysPerWeek: null });

const NO_CONDITIONS: Conditions = {
  noticePeriodMaxDays: null,
  immediateJoiner: false,
  bond: false,
  shift: null,
  contractToHire: false,
  wfoDaysPerWeek: null,
};

async function rankingContext(userId: string): Promise<{ profile: RankingProfile; catalogue: string[] }> {
  const [career, userSkills, catalogue, implications, roles] = await Promise.all([
    getCareerProfile(userId),
    listUserSkills(userId),
    listSkillCatalogue(userId),
    listSkillImplicationIds(userId),
    listTargetRoles(userId),
  ]);
  // A skill counts as held when the user holds one that implies it (Next.js → React), at that level.
  const levels = new Map(userSkills.map((s) => [s.skillId, s.proficiency]));
  for (const [toId, fromIds] of implications) {
    const best = Math.max(0, ...fromIds.map((id) => levels.get(id) ?? 0));
    if (best > (levels.get(toId) ?? 0)) levels.set(toId, best);
  }
  const names = new Map(catalogue.map((s) => [s.id, s.name]));
  const selected = roles.filter((r) => r.selected);
  const workModes = career?.workModes ?? [];
  const locations = [
    ...new Set((career?.preferredLocations ?? []).map(canonicalCity).filter((c): c is string => Boolean(c))),
  ];
  return {
    catalogue: catalogue.map((s) => s.name),
    profile: {
      years: career?.yearsExperience ?? null,
      skills: [...levels].flatMap(([id, proficiency]) =>
        names.has(id) ? [{ name: names.get(id)!, proficiency }] : [],
      ),
      titleVariants: (selected.length ? selected : roles).flatMap((r) => r.titleVariants),
      locations: workModes.includes("remote") ? [...locations, "Remote-India"] : locations,
      workModes,
      openToRelocate: career?.openToRelocate ?? false,
      expectedSalaryMin: career?.expectedCtcMin ?? null,
      noticePeriodDays: career?.noticePeriodDays ?? null,
      dealbreakers: dealbreakersSchema.parse(career?.dealbreakers ?? {}),
    },
  };
}

/** The text the profile vector is made from: headline, summary, experience bullets and skills (no personal details). */
async function profileText(userId: string): Promise<string> {
  const [career, entries, skills] = await Promise.all([
    getCareerProfile(userId),
    getProfileEntries(userId),
    listUserSkills(userId),
  ]);
  const bullets = entries.experience.flatMap((e) =>
    z
      .array(z.object({ text: z.string() }))
      .catch([])
      .parse(e.bullets)
      .map((b) => b.text),
  );
  return [
    career?.headline,
    career?.summary,
    ...entries.experience.map((e) => e.title),
    ...bullets,
    skills.map((s) => s.skill.name).join(", "),
  ]
    .filter(Boolean)
    .join("\n");
}

// ---------------------------------------------------------------------------------------------------------------

/** Does up to STEP_BUDGET_MS of work on a run and saves where it stopped. */
export async function advanceSearchRun(userId: string, runId: string): Promise<RunProgress> {
  const run = await getSearchRun(userId, runId);
  if (!run) throw new AppError("NOT_FOUND");
  if (run.status !== "running") return progressOf(run);

  const started = Date.now();
  const now = new Date();
  const state = stateSchema.parse(run.state);
  const queries: PlannedQuery[] = planSchema.parse(run.plan).queries;
  const requests = z.record(z.string(), z.number()).catch({}).parse(run.requestsByProvider);
  const errors = z
    .array(z.object({ at: z.string(), message: z.string() }))
    .catch([])
    .parse(run.errors);
  const counters = {
    found: run.resultCount,
    newJobs: run.newCount,
    duplicates: run.duplicateCount,
    pages: run.pagesFetched,
  };
  const timeLeft = () => Date.now() - started < STEP_BUDGET_MS;
  const note = (message: string) => errors.push({ at: new Date().toISOString(), message });
  let ranking: Awaited<ReturnType<typeof rankingContext>> | null = null;

  try {
    while (timeLeft() && state.stage !== "done") {
      if (state.stage === "search") {
        const query = queries[state.queryIndex];
        if (!query) {
          state.stage = "embed";
          continue;
        }
        const params: JobSearchParams = {
          query: query.query,
          location: query.location,
          country: COUNTRY(),
          datePosted: "month",
        };
        let served: string | null = null;
        try {
          const result = await jobSearch.search(params);
          served = result.provider;
          requests[result.provider] = (requests[result.provider] ?? 0) + result.requestsUsed;
          counters.pages++;
          const saved = await saveResults(userId, runId, result.jobs, query.roleIds, now);
          counters.found += saved.found;
          counters.newJobs += saved.newJobs;
          counters.duplicates += saved.duplicates;
        } catch (error) {
          if (isAppError(error) && (error.code === "SEARCH_QUOTA_EXCEEDED" || error.code === "SEARCH_NOT_CONFIGURED")) {
            note(error.message);
          } else {
            note(`“${query.query}” in ${query.location} failed; the run continued.`);
            if (!isAppError(error)) console.error("search query failed", error);
          }
        }
        // Priority queries also go to SerpApi (LinkedIn, Naukri and company sites), unless it already answered.
        if (query.priority && served !== "serpapi") {
          try {
            const extra = await jobSearch.searchPriority(params);
            if (extra) {
              requests.serpapi = (requests.serpapi ?? 0) + extra.requestsUsed;
              counters.pages++;
              const saved = await saveResults(userId, runId, extra.jobs, query.roleIds, now);
              counters.found += saved.found;
              counters.newJobs += saved.newJobs;
              counters.duplicates += saved.duplicates;
            }
          } catch {
            note("SerpApi didn't answer a priority query; the run continued.");
          }
        }
        state.queryIndex++;
        continue;
      }

      if (state.stage === "embed") {
        const { providers } = await loadEmbeddingProviders();
        const model = providers[0]?.model;
        if (!model) {
          state.embeddingsDeferred = true;
          state.stage = "rank";
          continue;
        }
        const text = await profileText(userId);
        const hash = createHash("sha256").update(text).digest("hex").slice(0, 32);
        const info = await getProfileEmbeddingInfo(userId);
        if (!info?.hasVector || info.model !== model || info.sourceHash !== hash) {
          const result = text ? await embeddings.embed([text]) : null;
          if (!result) {
            state.embeddingsDeferred = true;
            state.stage = "rank";
            continue;
          }
          await setProfileEmbedding(userId, result.model, result.vectors[0], hash);
        }
        const pending = await jobsNeedingEmbedding(userId, model, EMBED_PAGE);
        if (!pending.length) {
          state.stage = "rank";
          continue;
        }
        const result = await embeddings.embed(pending.map((j) => `${j.title}\n${j.descriptionRaw}`));
        if (!result) {
          state.embeddingsDeferred = true;
          state.stage = "rank";
          continue;
        }
        await setJobEmbeddings(
          userId,
          result.model,
          pending.map((j, i) => ({ jobId: j.id, vector: result.vectors[i] })),
        );
        state.embedded += pending.length;
        continue;
      }

      if (state.stage === "rank") {
        ranking ??= await rankingContext(userId);
        if (!state.rankTotal) state.rankTotal = await countJobs(userId);
        const page = await listJobsForRanking(userId, state.rankAfter, RANK_PAGE);
        if (!page.length) {
          state.stage = "done";
          continue;
        }
        const similarity = await jobSimilarities(
          userId,
          page.map((j) => j.id),
        );
        const scores = page.map((job) => {
          const relevance = scoreJob(
            {
              title: job.title,
              description: job.descriptionRaw,
              city: job.locationCity,
              workMode: job.workMode,
              salaryMinAnnual: job.salaryMinAnnual,
              salaryMaxAnnual: job.salaryMaxAnnual,
              salaryDisclosed: job.salaryDisclosed,
              salaryCurrency: job.salaryCurrency,
              expMinYears: job.expMinYears,
              expMaxYears: job.expMaxYears,
              seniority: job.seniority,
              conditions: { ...NO_CONDITIONS, ...((job.conditions as Partial<Conditions> | null) ?? {}) },
              semantic: similarity.get(job.id) ?? null,
            },
            ranking!.profile,
            ranking!.catalogue,
          );
          return {
            id: job.id,
            score: relevance.score,
            parts: { parts: relevance.parts, missingSkills: relevance.missingSkills, jobSkills: relevance.jobSkills },
            notFitReasons: relevance.notFit,
          };
        });
        await saveScores(userId, scores);
        state.rankAfter = page.at(-1)!.id;
        state.ranked += page.length;
        continue;
      }
    }
  } catch (error) {
    note("Something went wrong; the run stopped. Jobs found so far are saved.");
    console.error("search run failed", error);
    await saveSearchRun(userId, runId, {
      state,
      requestsByProvider: requests,
      pagesFetched: counters.pages,
      resultCount: counters.found,
      newCount: counters.newJobs,
      duplicateCount: counters.duplicates,
      errors,
      status: "failed",
    });
    return progressOf((await getSearchRun(userId, runId))!);
  }

  await saveSearchRun(userId, runId, {
    state,
    requestsByProvider: requests,
    pagesFetched: counters.pages,
    resultCount: counters.found,
    newCount: counters.newJobs,
    duplicateCount: counters.duplicates,
    errors,
    status: state.stage === "done" ? "done" : "running",
  });
  return progressOf((await getSearchRun(userId, runId))!);
}

/** For the Target roles page: a run to resume, and the best matches of the latest finished run. */
export async function getSearchOverview(userId: string) {
  const [active, latest] = await Promise.all([getActiveSearchRun(userId), getLatestFinishedRun(userId)]);
  const top = latest ? await topJobsOfRun(userId, latest.id, 10) : [];
  const partsSchema = z.object({ parts: z.array(z.any()) }).catch({ parts: [] });
  return {
    activeRunId: active?.id ?? null,
    runFinishedAt: latest?.finishedAt?.toISOString() ?? null,
    matches: top.map((job) => {
      const links = linksOf(job.applyLinks);
      return {
        id: job.id,
        title: job.title,
        companyName: job.companyName,
        city: job.locationCity,
        workMode: job.workMode,
        score: job.quickScore,
        parts: partsSchema.parse(job.scoreParts).parts,
        salary: job.salaryDisclosed ? formatSalaryRange(job.salaryMinAnnual, job.salaryMaxAnnual) : null,
        provider: job.provider,
        postedVia: job.postedVia,
        postedAt: job.postedAt?.toISOString() ?? null,
        direct: job.isDirectFromCompany,
        staffing: job.company?.isStaffingAgency ?? false,
        applyUrl: links[0]?.url ?? null,
        applySite: links[0]?.site ?? null,
      };
    }),
  };
}
