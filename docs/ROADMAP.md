# CareerOS — roadmap and progress

**How we work:** each phase is split into steps (1a, 1b, …). One step = one fresh Claude Code session, using the step
prompt in PROMPTS.md. End of a step: relevant checks pass, box ticked, commit and push, short step report, stop.
End of the last step of a phase: full test suite + acceptance flow, sections below updated, end-of-phase report,
PR to `main`.

If a usage limit interrupts a step, write a **"Where I stopped"** note under that phase before stopping, so the next
session (local or cloud) can continue.

**Size:** M ≈ 2–4 sessions · L ≈ 4–5 sessions (roughly one per step).

**End-of-phase report format**
1. Implemented — bullet list
2. Tested — exact commands and their summary lines
3. Verified working — what was exercised end to end
4. Acceptance targets — each target with its measured result (evals included)
5. Remains / known gaps
6. Decisions — anything that deviates from SPEC, with the reason
7. Risks for the next phase

---

## Part 1 — core product (the four basic requirements)

### Phase 0 — Local setup (you + Claude, no app code)
- [x] Project folder outside OneDrive; git repo with `CLAUDE.md`, `docs/`, `.gitattributes` (LF line endings)
- [x] GitHub: public repo `careeros` created and pushed (check: secret scanning + push protection on)
- [x] Neon free account: project `careeros` with a `test` branch
- [ ] Both Neon connection strings pasted into `.env` (never committed)
- [ ] Optional, for cloud sessions later: Claude GitHub App on the repo + cloud environment (PROMPTS.md §5)

### Phase 1 — Foundation and design system · M · SPEC §2, §4 (auth), §21, §23, §25, §26
- [x] 1a Scaffold: Next.js + TypeScript strict + Tailwind + shadcn/ui, ESLint + Prettier, `@/` alias, Prisma with the
      `vector` extension migration, `db:*` scripts, `.env.example`; optional `docker-compose.yml`; `scripts/cloud-db.sh`
      for cloud sessions
- [x] 1b Auth and app shell: Better Auth (email + password), sign-in/up, `ALLOW_SIGNUP`, protected `(app)` layout,
      sidebar from a `features` config, header, theme toggle, ⌘K (navigation only)
- [x] 1c Design system: CareerOS brand, tokens (light/dark), page header, data table, form, toasts with undo,
      skeleton/empty/error states, progress-steps component, Indian number/LPA and date formatters, `AppError`,
      error boundary, JSON logger, `server-only` guards
- [x] 1d Quality gates: Vitest (unit + integration on `DATABASE_URL_TEST`), Playwright smoke test with axe, GitHub Actions CI
- **Accept:** fresh clone → install → migrate → dev works; sign up/in/out; both themes look finished; CI green.

### Phase 2 — CV upload and precise extraction · L · SPEC §4, §7.2–7.3, §8.1–8.4, §8.6, §9
- [ ] 2a Provider chains and AI layer: `lib/providers` (quotas incl. provider-reported remaining, switch at 90%,
      cooldowns, circuit breaker, ProviderUsage), `lib/ai` (Gemini with PDF input → Groq → OpenRouter free models, mock,
      no-AI mode, `runStructured`, `wrapUntrusted`, injection pre-scan, AiRequestLog), Settings → Services, backup banner
- [ ] 2b Data model, seed, fixtures: PersonalDetails, CareerProfile, RoleFamily, Skill, SkillRelation, UserSkill,
      UserSkillHistory, CV entry tables, OtherCvSection, CareerFact, ResumeVersion, StoredFile; role catalog, ~150 skills,
      relations; `scripts/make-fixtures.ts` (six fictional CVs)
- [ ] 2c CV pipeline: storage, text with pages, link annotations, regex extractors, section detection, ResumeParser
      (few-shot, PDF + text), verification (grounding, completeness with targeted second pass, deterministic overrides,
      date maths), evidence catalog
- [ ] 2d Review and profile: side-by-side review (pdf.js), flags and source quotes, confirm → profile + Resume v1;
      profile pages, preferences (locations, work modes, CTC, notice period, dealbreakers), Memory
- [ ] 2e Evals: `npm run eval:resume` on all six fixtures with real Gemini; fix until the §9.4 targets are met
- **Accept:** e2e with mock AI on every fixture; §9.4 targets met with real Gemini (numbers in Decisions).

### Phase 3 — Suggested roles, job search and relevance ranking · L · SPEC §7.2, §10
- [ ] 3a RoleSuggester + Target roles page (Core / Adjacent / Stretch by code, title variants, keywords)
- [ ] 3b Job-search chain (Adzuna → Jooble → SerpApi Google Jobs + priority queries, account-endpoint quota, mock) and
      embedding chain (local `bge-small-en-v1.5` → same model on Cloudflare, mock); Job embedding column + HNSW index
- [ ] 3c Resumable search runs: normalisation, `parseSalary`, conditions regex, fuzzy dedupe with merged apply links,
      deferred embeddings, relevance ranking (§10.5), "Not a fit" bucket
- [ ] 3d "For you" feed (filters, hidden groups with counts, dismiss reasons that tune ranking, badges, bulk dismiss),
      market stats per role, onboarding checklist, usage in Settings
- **Accept:** mock run returns deduplicated, ranked jobs with explained relevance; unit tests for dedupe, normalisation,
  quotas, ranking and failover; one live run with real keys including a forced failover, recorded in Decisions.

### Phase 4 — Professional job analysis: the Fit Report · L · SPEC §8.4, §12
- [ ] 4a JobExtractor (few-shot, responsibilities, requirements with ids, conditions) and `lib/scoring` (Fit score,
      blockers, recommendation, score gains, salary context) + ScoringConfig settings
- [ ] 4b FitAnalyst (strong tier, streamed) + validator (§8.4 + §12.5 rules) + repair
- [ ] 4c Fit Report page (every §12.4 section, trust badges, print view, Copy report), auto reports for the top N jobs
      of each run, "Analyse" for others, Add job (paste, URL with SSRF guard + JSON-LD, manual)
- [ ] 4d Golden set (10 CV + JD pairs with checklists), `npm run eval:jobs` and `npm run eval:fit` with real Gemini;
      fix until the §12.6 targets are met
- **Accept:** §12.6 targets met (numbers in Decisions); feed re-sorts by Fit score.

### Phase 5 — Deep web search: company career websites · L · SPEC §7.2, §11
- [ ] 5a CareerSite registry, "Company sites" page (discovered, watchlist, status), web-search chain
      (Tavily → Exa → Firecrawl), discovery queries, ATS host detection and token extraction
- [ ] 5b ATS adapters (Greenhouse, Lever, Ashby, SmartRecruiters, Recruitee; endpoints verified against official docs)
      and careers-page reader (SSRF guard, robots.txt, embedded-ATS detection, JSON-LD, CareerPageExtractor fallback)
- [ ] 5c Merge into the standard pipeline, "Direct from company site" badge and primary apply link, recorded fixture
      set (~15 sites), live run
- **Accept:** §11.6 targets met; live run recorded in Decisions.

### Phase 6 — Application tracking · M · SPEC §5, §13, §18
- [ ] 6a Models (Application, ApplicationEvent, InterviewRound), "Mark as applied" with frozen snapshot, status service
      (events + stageReached in one transaction, rejection reason and stage, interview round prompt)
- [ ] 6b Kanban ⇄ table, activity ageing, application detail (timeline, rounds, follow-ups, notes), Today's actions
- **Accept:** e2e — find job → mark applied → drag to Interview → log round → reject with reason → timeline correct.

---

## Part 2 — intelligence and extras
- Phase 7 — Market skill-gap analysis · SPEC §14
- Phase 8 — Resume versions, health check and tailoring · SPEC §15
- Phase 9 — Outcome analytics, pattern detection, demo data, CSV import · SPEC §5, §6, §16, §22
- Phase 10 — AI career decisions · SPEC §8.4, §17
- Phase 11 — Interview prep and interview analytics · SPEC §18
- Phase 12 — Knowledge base and RAG · SPEC §19
- Phase 13 — Web research and assistant · SPEC §20
- Phase 14 — Polish, deploy, README · SPEC §21, §23, §27: contacts, follow-up templates, .ics export, weekly goal,
  saved views, keyboard cheatsheet, data export and account deletion, security headers, accessibility and responsive
  pass, public landing page with "Try the demo", README with screenshots and Mermaid diagrams, deploy to Vercel Hobby +
  Neon free
- Extras: more ATS adapters (Workable, Keka, Zoho Recruit) once public feeds are confirmed · Ollama provider ·
  scheduled daily search (Vercel Cron)

Each Part 2 phase is split into steps when it starts.

---

## What works

**Phase 1 (foundation and design system)**
- Sign up, sign in, sign out (Better Auth, email + password); `ALLOW_SIGNUP` switch; safe `?next=` redirects; Postgres-backed auth rate limits.
- Protected app shell: sidebar driven by `src/config/navigation.ts` (only built sections), header, Ctrl/Cmd+K palette, light/dark/system theme.
- Overview (welcome) and Settings (account, appearance, sign out); error, global-error and 404 pages.
- Design system: tokens, brand, page header, data table (sort/filter/columns/pagination), empty/error states, progress steps, trust badges, confidence labels, toasts with undo, Indian number/LPA formatters. Gallery at `/dev/design` (development only).
- Tests: 28 unit, 5 integration (Neon `test` branch: migrations, pgvector, cascade deletes, real auth handler), 8 e2e (Playwright on a production build against the test DB, axe WCAG 2.2 AA checks in both themes). CI workflow in `.github/workflows/ci.yml`.

## Known gaps

- Phase 1: no email verification or password reset (single-user app; add before opening sign-ups to others).
- Phase 1: Better Auth skips rate limiting when it cannot determine a client IP (direct handler calls in tests); real HTTP requests are limited.
- Phase 1: Overview shows only a welcome card until the CV and job phases add real content.

## Decisions
_(date — decision — reason)_

- 2026-10-09 — Prisma 7.10 (stable) instead of the 8.0 release candidate that npm tags `latest` — stability for a learning project; revisit when 8 is GA.
- 2026-10-09 — Keep Next.js 16 `cacheComponents` on — matches the spec's streaming/skeleton UX; session and DB reads go inside `<Suspense>`.
- 2026-10-09 — First migration written by hand (`CREATE EXTENSION vector`) because the schema has no models yet; applied with `migrate deploy` to both Neon branches.
- 2026-10-09 — The pg driver warns that `sslmode=require` will be weakened in pg 9; `src/server/db.ts` upgrades it to `verify-full` (today's behaviour) without editing `.env`.
- 2026-10-09 — shadcn/ui initialised with its new default `base-nova` style (Base UI primitives).
- 2026-10-09 — Neon runs PostgreSQL 18.6 with pgvector 0.8.6 (spec assumed 16+; compatible).
- 2026-10-09 — Prisma 7 no longer regenerates the client after `migrate dev`; `npm run db:migrate` now runs `prisma generate` too (a stale client made Better Auth report missing tables).
- 2026-10-09 — Auth: Better Auth email+password, Postgres-backed rate limits on every environment (sign-in 10/min, sign-up 5/min). `proxy.ts` only does the optimistic cookie check; pages validate with `getCurrentUser()` (`"use cache: private"`, inside `<Suspense>`). Signed-in users are redirected away from sign-in by the page, not the proxy, to avoid a redirect loop with stale cookies.
- 2026-10-09 — shadcn `SidebarMenuSkeleton` used `Math.random()`, which Next 16 rejects while prerendering; changed to a fixed width. `use-mobile` rewritten with `useSyncExternalStore` (lint rule).
- 2026-10-09 — Local test account `E2E_USER_EMAIL`/`E2E_USER_PASSWORD` lives in `.env` (password generated, never printed).
- 2026-10-09 — TanStack Table 9.2 (current stable) adopted instead of v8: features registered explicitly in `dataTableFeatures`; columns built with `dataTableColumns<T>()` at module scope.
- 2026-10-09 — Design tokens: neutral greys + one indigo brand accent (OKLCH), success/warning/info, 8px radius, 13px `text-ui` size, reduced-motion rule. Chart colours deferred to the first chart (dataviz guidance).
- 2026-10-09 — Error boundaries use Next 16's `retry()` prop; server errors only show `digest` as a reference. Logger redacts secret/personal keys.
- 2026-10-09 — `/dev/design` component gallery for visual checks; public in development only, 404 in production.
- 2026-10-09 — Tests: Vitest projects `unit` and `integration` (integration forces `DATABASE_URL = DATABASE_URL_TEST` and runs `migrate deploy` first); Playwright builds and serves on port 3100 against the test DB with a 15s expect timeout (Neon round-trips + password hashing).
- 2026-10-09 — `npm audit`: CI fails on critical. Known high advisories accepted as unreachable: `mysql2` (pulled in by Prisma/Better Auth, never used with Postgres) and `deepmerge-ts` (Prisma config loader, only merges our own config). The `shadcn` CLI moved to devDependencies (its CSS is build-time only).
- 2026-10-09 — `/node` 22 (Vitest 5 peer requirement; runtime is Node 22). `CardTitle` gained an `as` prop so auth pages have an `<h1>` and cards under a page header use `<h2>`.
