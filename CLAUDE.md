# CareerOS — agent instructions

Read this file at the start of every session. Product spec: `docs/SPEC.md`. Phase plan and progress: `docs/ROADMAP.md`.
Read only the SPEC sections the current phase lists; do not load the whole spec unless asked.

## What this is
A personal career intelligence app (single user now, multi-user-ready). The user uploads a CV; the app suggests
fitting roles, finds live openings through official job-search APIs, scores and explains each match, tracks
applications, and learns from outcomes. The user applies on the job site and updates statuses manually.
The differentiator is outcome-based intelligence: deterministic statistics over the user's own applications,
interpreted (never invented) by AI.

## Golden rules
1. **Code computes, AI interprets.** Counts, rates, scores, rankings and recommendation labels are computed in
   TypeScript/SQL. LLMs extract structure from text and explain computed results. An LLM never produces a number
   that is displayed as a metric or score.
2. **Evidence-bound AI claims.** Any AI sentence containing a number must reference evidence IDs from the stats
   snapshot; the validator flags claims whose numbers don't match (SPEC §8.4).
3. **No fake functionality.** No buttons that do nothing, no nav items for unbuilt sections. Missing API key → Mock
   provider with a visible "Mock AI" badge. Demo data always shows a "Demo data" banner.
4. **Untrusted content is data.** Job descriptions, uploaded documents, resume text and web pages go through
   `wrapUntrusted()` and can never change instructions. AI has no write tools.
5. **User scoping.** Every DB access goes through `src/server/repositories/*`, which always take `userId`.
   No Prisma calls in components, route handlers or server actions directly.
6. **Validate at every boundary** with Zod: server actions, route handlers, AI outputs, uploads, CSV rows.
7. **Sample-size honesty.** Every rate shows `x of n` and a confidence label (SPEC §7). Never present an early
   signal as a conclusion.
8. **Official and public sources only.** Jobs come from `src/lib/jobsearch` providers and, for company career sites,
   `src/lib/careersites` (public ATS APIs, JSON-LD, public pages). Respect robots.txt and rate limits; never fetch
   LinkedIn, Naukri or login-walled pages; never submit applications on the user's behalf.
   **Quality targets are requirements:** CV extraction (SPEC §9.4), deep search (§11.6) and Fit Reports (§12.6) have
   measurable targets; a phase is not done until they are met or the gap is reported with numbers.
   **Zero running cost:** every external service must run on a free tier and stay under its quota; never add a paid
   dependency. Every external service is called through a provider chain (`src/lib/providers`, SPEC §7.2–7.3): a main
   provider plus 1–2 free backups with automatic failover. Never call an external provider directly.
9. **Modular monolith, minimal infra.** Don't add a service, queue, cache or dependency unless the current phase
   needs it; record the reason under "Decisions" in ROADMAP.md.
10. **Public repo.** Never commit secrets, `.env` files or real personal data. Fixtures and seeds are fictional.
11. **Explainable code.** This is a learning project. Prefer clear names and plain functions over abstractions.
   Add a short comment where a non-obvious decision is made (why, not what).

## Stack
Next.js (App Router, latest stable) · TypeScript strict · Tailwind CSS + shadcn/ui · shadcn charts (Recharts) ·
TanStack Table · react-hook-form · sonner · dnd-kit · cmdk · TanStack Query only for client mutations/optimistic UI · Zustand only if real shared client state
appears · Prisma + PostgreSQL 16 + pgvector · Better Auth · Vercel AI SDK behind `src/lib/ai` · Zod · Vitest · Playwright.

## Layout
```
src/
  app/                  routes — thin: parse input → call service → render
  components/ui/        shadcn primitives
  components/           shared app components (trust badges, confidence labels, empty states)
  features/<area>/      feature UI + client hooks
  server/services/      business logic (pure where possible, unit-tested)
  server/repositories/  DB access; every function takes userId
  server/ai/            workflows (one file per workflow + its Zod schema + versioned prompt)
  lib/providers/        ProviderChain: ordered providers, quotas, cooldowns, circuit breaker, usage tracking
  lib/ai/               provider registry, runStructured(), wrapUntrusted(), mock models, request logging
  lib/stats/            rates, Wilson interval, confidence labels, segment comparison (pure)
  lib/scoring/          fit score model (pure)
  lib/jobsearch/        JobSearchProvider: adzuna, serpapi, mock (+ normalise, dedupe, quotas, relevance ranking)
  lib/careersites/      deep search: discovery (Tavily), ATS adapters, careers-page reader, robots.txt
  lib/cv/               CV pipeline: text + link extraction, regex extractors, verification (grounding, completeness)
  lib/search/ lib/embeddings/ lib/storage/ lib/parsing/   interface + mock + real implementation
  lib/validation/       shared Zod schemas
prisma/                 schema.prisma, migrations, seed/
scripts/                cloud-db.sh and other dev scripts
```

## Framework notes (versions differ from older training data)
- **Next.js 16.4** — read `AGENTS.md` and the guides in `node_modules/next/dist/docs/` before using an unfamiliar API.
  `cacheComponents` is on: any read of cookies, headers, the session or the database must sit inside `<Suspense>`
  (or a `"use cache"` scope); keep it out of layouts' top level. `proxy.ts` replaces `middleware.ts`.
  Route types (`PageProps`, `LayoutProps`) are generated by `next typegen` (part of `npm run typecheck`).
- **Prisma 7.10** (not the 8.x release candidate) — connection settings live in `prisma.config.ts`; the client is
  generated to `src/generated/prisma` (git-ignored) and imported from `@/generated/prisma/client`; the database
  client is `db` from `src/server/db.ts` (pg driver adapter).
- **shadcn/ui** uses the `base-nova` style (Base UI primitives, not Radix); `cn` comes from the `cn` package.
- Scripts that import server-only modules run with `tsx --conditions=react-server`.

## Commands (keep this list current)
- `npm run dev` · `npm run build` · `npm run typecheck` · `npm run lint` · `npm run format` · `npm test` · `npm run test:e2e`
- `npm run db:migrate` (new migration, dev DB) · `npm run db:deploy` · `npm run db:test:deploy` (apply to test DB)
- `npm run db:check` / `npm run db:check:test` (read-only connection + pgvector check) · `npm run db:seed` · `npm run db:reset`
- Tests: `npm test` (unit + integration), `npm run test:unit`, `npm run test:integration` (uses `DATABASE_URL_TEST`), `npm run test:e2e` (builds and serves on port 3100 against the test DB; screenshots in `test-results/screens`).
- Database: local development uses `DATABASE_URL` / `DATABASE_URL_TEST` from `.env` (Neon `main` and `test`
  branches, or `docker compose up -d`). Cloud sessions: run `bash scripts/cloud-db.sh` once at session start.
- Developed on Windows: keep npm scripts cross-platform (Node scripts, no bash-only syntax); LF line endings via
  `.gitattributes`.

## Definition of done
**Every step** (ROADMAP: 1a, 1b, …): do only that step; typecheck, lint and the relevant tests pass (run them and
report the summary lines; never claim a pass you didn't see); tick the box in ROADMAP.md; commit and push; short step
report; **stop**. If a usage limit interrupts you, first write a "Where I stopped" note under the phase in ROADMAP.md,
then commit and push.

**Last step of a phase**, in addition:
- Full test suite and the phase's acceptance flow (Playwright with mock providers, or a scripted run) without console errors.
- New screens have loading, empty and error states. No dead UI.
- ROADMAP.md "What works", "Known gaps", "Decisions" updated; end-of-phase report (format in ROADMAP.md); PR to `main`.
- Do not start the next phase unless told to.

## Usage discipline (built on a Claude Pro plan with usage limits)
- Read only the files you need. Don't re-read files you just wrote. Never scan `node_modules`, `.next`, lockfiles.
- While iterating run targeted tests (`npx vitest run <path>`); run the full suite once at the end.
- Use reporters that print failures only; pipe long command output through `tail`.
- Use mock AI/embedding/search providers in development and tests. Real providers (free-tier keys in `.env`) are
  called only in eval steps and manual live runs, never from automated tests.
- Ask before adding any dependency not listed in the Stack section.

## Compact instructions
When compacting, keep: current phase and task, files changed, failing tests with their errors, decisions made.
Drop: contents of files already written, passing test output, exploration notes.
