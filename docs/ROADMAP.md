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
- [x] Neon free account: project `careeros` (tests use a separate `careeros_test` database)
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

- [x] 2a Provider chains and AI layer: `lib/providers` (quotas incl. provider-reported remaining, switch at 90%,
      cooldowns, circuit breaker, ProviderUsage), `lib/ai` (Gemini with PDF input → Groq → OpenRouter free models, mock,
      no-AI mode, `runStructured`, `wrapUntrusted`, injection pre-scan, AiRequestLog), Settings → Services, backup banner
- [x] 2b Data model, seed, fixtures: PersonalDetails, CareerProfile, RoleFamily, Skill, SkillRelation, UserSkill,
      UserSkillHistory, CV entry tables, OtherCvSection, CareerFact, ResumeVersion, StoredFile; role catalog, ~150 skills,
      relations; `scripts/make-fixtures.ts` (six fictional CVs)
- [x] 2c CV pipeline: storage, text with pages, link annotations, regex extractors, section detection, ResumeParser
      (few-shot, PDF + text), verification (grounding, completeness with targeted second pass, deterministic overrides,
      date maths), evidence catalog
- [x] 2d Review and profile: side-by-side review (pdf.js), flags and source quotes, confirm → profile + Resume v1;
      profile pages, preferences (locations, work modes, CTC, notice period, dealbreakers), Memory
- [x] 2e Evals: `npm run eval:resume` on all six fixtures with real Gemini; fix until the §9.4 targets are met
- **Accept:** e2e with mock AI on every fixture; §9.4 targets met with real Gemini (numbers in Decisions).

### Phase 3 — Suggested roles, job search and relevance ranking · L · SPEC §7.2, §10
- [x] 3a RoleSuggester + Target roles page (Core / Adjacent / Stretch by code, title variants, keywords)
- [x] 3b Job-search chain (Adzuna → Jooble → SerpApi Google Jobs + priority queries, account-endpoint quota, mock) and
      embedding chain (local `bge-small-en-v1.5` → same model on Cloudflare, mock); Job embedding column + HNSW index
- [x] 3c Resumable search runs: normalisation, `parseSalary`, conditions regex, fuzzy dedupe with merged apply links,
      deferred embeddings, relevance ranking (§10.5), "Not a fit" bucket
- [x] 3d "For you" feed (filters, hidden groups with counts, dismiss reasons that tune ranking, badges, bulk dismiss),
      market stats per role, onboarding checklist, usage in Settings
- **Accept:** mock run returns deduplicated, ranked jobs with explained relevance; unit tests for dedupe, normalisation,
  quotas, ranking and failover; one live run with real keys including a forced failover, recorded in Decisions.

### Phase 4 — Professional job analysis: the Fit Report · L · SPEC §8.4, §12
- [x] 4a JobExtractor (few-shot, responsibilities, requirements with ids, conditions) and `lib/scoring` (Fit score,
      blockers, recommendation, score gains, salary context) + ScoringConfig settings
- [x] 4b FitAnalyst (strong tier, streamed) + validator (§8.4 + §12.5 rules) + repair
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

**Phase 2 (CV upload and precise extraction)**
- AI layer: provider chain Gemini → Groq → OpenRouter (free models) with quotas, switch at 90%, cooldowns, circuit breaker, immediate failover on overload/timeouts, usage and request logs without content; mock provider and no-AI mode; Settings → Services shows the chain, lets you reorder, disable and test providers; banner and badge when a backup or the mock answers.
- CV upload (PDF/DOCX ≤ 5 MB, type checked from the bytes) with step-by-step progress; leaving the page doesn't stop it.
- Extraction: page text with table cells kept apart, PDF link annotations ("LinkedIn" → URL), regex e-mail/phone/links, section detection, ResumeParser (Gemini reads the PDF plus the text; prompt v2 with a worked example), deterministic parser as mock and no-AI fallback.
- Verification in code: grounding of every string (fuzzy ≥ 0.9), e-mail/phone/links from the file win over the AI, bullet-coverage completeness with one targeted re-read, dates normalised and durations/total experience/gaps/overlaps computed; CV evidence catalog (E-ids).
- Review screen: original PDF (pdf.js) or text side by side with every extracted field, flags, source highlighting on focus; confirm builds the profile and makes the CV the default version.
- Career profile: overview, details (incl. other CV sections), experience, projects, education and certifications, skills (suggested levels with reasons, confirm or change, add/remove), preferences (locations, work modes, CTC, notice, dealbreakers), memory (career facts).
- `npm run eval:resume` measures extraction on the six fictional CVs with a real provider (`--provider=`, `--only=`).

**Phase 3 (suggested roles, job search and relevance ranking)**
- Target roles: RoleSuggester proposes 5–10 roles from the CV with evidence-checked reasons; Core / Adjacent / Stretch and seniority computed in code; add, edit (title variants, keywords), select, remove with undo. Each role card shows market stats from the latest search: openings in 30 days, average relevance, the skill most often asked for that the user lacks.
- Job search: chain Adzuna → Jooble → SerpApi Google Jobs (+ priority queries) with quotas and failover; embeddings chain local bge-small-en-v1.5 → Cloudflare (same model) → mock. Settings → Services shows all three chains, SerpApi's own remaining count, and the user's searches this month.
- Resumable search runs (search → embed → rank, ≤ 15 s per call) with progress steps; cleaning (companies, cities, salary, experience, conditions), fuzzy dedupe with merged apply links, relevance (§10.5) explained part by part, "Not a fit" reasons.
- "For you" feed (`/jobs`): ranked cards with relevance, top 3 reasons, top gap and badges (New since last visit, Direct from company site, staffing agency, saved); filters in the URL (role, location, work mode, posted, source, direct, salary); hidden groups with counts (Not a fit, older than 30 days, staffing agencies, blocked companies, dismissed); save, dismiss with an optional reason (with undo), bulk save/dismiss, block company, restore. "Too senior"/"too junior" dismissals tighten the seniority filter and "company" dismissals rank that company 15 points lower, re-scored at once.
- Overview: onboarding checklist that ticks itself from the data (CV, preferences, roles, first search, feed reviewed).
- `npm run search:live` runs one full search with the real chains on a fictional CV (Adzuna forced to fail unless `--no-fail`).

## Known gaps

- Phase 1: no email verification or password reset (single-user app; add before opening sign-ups to others).
- Phase 1: Better Auth skips rate limiting when it cannot determine a client IP (direct handler calls in tests); real HTTP requests are limited.
- Phase 1/3: Overview has the welcome card and onboarding checklist; today's actions, new matches and the pipeline summary (SPEC §2) come with later phases.
- Phase 2: re-uploading a CV replaces the profile on confirm; the added/changed/removed merge diff (SPEC §9.1 step 6) is not built yet.
- Phase 2: proficiency is the code rule only; the optional AI ±1 adjustment (SPEC §9.3) is not built. Skill years refresh on CV confirm, not on later experience edits.
- Phase 2: scanned PDFs (no text layer) are rejected with a clear message; there is no OCR.
- Phase 2: the eval set is six fictional CVs written for this project; real CVs vary more. The first real CV read correctly after the coverage fix.
- Phase 2: provider day counters reset at midnight UTC, but Google resets Gemini quotas at midnight Pacific (07:00/08:00 UTC). After a heavy day CareerOS may skip Gemini for a few hours after Google has reset; nothing breaks (backups answer). Per-provider reset time zones are still not built: Phase 3 kept UTC periods for every provider and relies on the margins under each limit (e.g. Adzuna 225 of 250 a day).
- Phase 2: OpenRouter's free model is slow (~40–80 s per CV); it is the last backup. Free model lists change, so `OPENROUTER_FREE_MODELS` may need updating.
- Phase 3: the feed sorts by relevance and has no "analysed" filter yet; Fit scores and that filter come with the Fit Report (Phase 4). Role market stats show average relevance for the same reason.
- Phase 3: "New" badges mark jobs found since the feed was last opened; the visit is marked as seen when the page opens, so the badges stay only until you leave the page.
- Phase 3: a dismissal that tunes ranking re-scores every job (up to 2,000) inside the request; fine at personal scale, would need a background step for much larger job lists.

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
- 2026-10-09 — `@types/node` 22 (Vitest 5 peer requirement; runtime is Node 22). `CardTitle` gained an `as` prop so auth pages have an `<h1>` and cards under a page header use `<h2>`.
- 2026-10-09 — CV text: `unpdf` (pdf.js serverless build) for PDF text and link annotations, `mammoth` for DOCX text and hyperlinks. Both run locally and free. PDF text is rebuilt from positioned text items in the file's reading order (keeps two-column layouts in order) and wide gaps become tabs, so table rows keep their cells apart. Files under 200 characters of text (scans) are rejected with a clear message; no OCR.
- 2026-10-09 — Uploaded CVs are stored in Postgres (`StoredFile.bytes`, ≤ 5 MB, deduplicated per user by SHA-256); no object store needed yet. The file type comes from magic bytes (`%PDF-`, ZIP with `word/document.xml`), never the name.
- 2026-10-09 — A deterministic CV parser (`lib/cv/heuristic-parser.ts`) is the mock AI's answer, the no-AI fallback and the text-based reference for completeness checks. On the six fixtures it scores 100% on every §9.4 metric; the real targets are measured with Gemini in 2e.
- 2026-10-09 — ParsedCv: entries (roles, projects, degrees, certifications) carry a `sourceQuote`; verbatim fields (names, bullets, skills) are their own quote and are located in the CV by the grounding check. Keeps AI output tokens down while every field can still show its source. The AI schema uses nullable instead of optional fields for structured-output compatibility across providers.
- 2026-10-09 — Verification: grounding = normalised edit-distance window ≥ 0.9 (skills by skill key, so “NodeJS” = “Node.js”); regex/annotation e-mail, phone and links override the AI; completeness compares counts with the deterministic parse and retries only the short section (once, only when an AI answered), keeping the retry only if it has more grounded items.
- 2026-10-09 — Integration tests set `AI_PROVIDERS=mock` in their setup, so a real key in `.env` can never be used by an automated test. Fixture `*.expected.json` now include bullet texts (for the bullet-capture metric).
- 2026-10-13 — Review screen draws the original PDF in the browser with pdf.js from `unpdf` (already a dependency, loaded only on that page), with the selected field's source highlighted; DOCX files show the text that was read. No extra PDF viewer package.
- 2026-10-13 — Confirm recomputes everything code owns (durations, totals, metric flags, evidence catalog) on the server and writes the profile, skills and default resume in one batch transaction. Profile edits keep bullet evidence ids stable; new bullets get the next free id, so later citations stay valid.
- 2026-10-13 — Suggested skill level = rule in code: years used (overlaps merged), recency, breadth; work with a skill that implies another counts for it (Next.js → React, from SkillRelation); a skill only listed starts at 2. User changes are recorded in UserSkillHistory.
- 2026-10-13 — CV upload is a route handler that streams NDJSON progress events (step-by-step progress UI); at most 20 uploads per user per hour to protect the free AI quota. Uploaded files are served back only to their owner, with `nosniff` and a sandbox CSP.
- 2026-10-13 — Links styled as buttons are real links (`LinkButton`), not Base UI buttons rendered as anchors (those are announced as buttons). The sidebar's active state streams behind `<Suspense>` so pages with dynamic segments prerender under `cacheComponents`.
- 2026-10-13 — AI model defaults updated after live checks with the user's free keys: Groq fast `openai/gpt-oss-20b` (`llama-3.1-8b-instant` retired); OpenRouter free `nvidia/nemotron-3-super-120b-a12b:free` then `google/gemma-4-31b-it:free` (`gpt-oss-120b` is no longer free). All three providers return valid structured output.
- 2026-10-13 — The Neon `test` branch no longer exists; tests now use a separate `careeros_test` database on the same branch (data fully separate, one compute instead of two, so fewer free compute hours). Playwright's server and integration tests force `AI_PROVIDERS=mock`.
- 2026-10-13 — `npm audit` (runtime): 4 high in Prisma's tooling (`mysql2`, `deepmerge-ts`, as before) and 3 moderate from `mammoth`'s command-line helper (`argparse` → `sprintf-js`), which the app never calls. No critical findings.
- 2026-10-13 — First real upload (Gemini) took minutes: Gemini answered 503 "high demand", the chain retried it and waited out a 120 s timeout, then Groq's gpt-oss stopped mid-JSON (default output limit). Fixes: 503 and timeouts fail over at once (503 also rests the provider for 60 s); ResumeParser asks for up to 16k output tokens with low reasoning effort on gpt-oss/OpenRouter; first read 90 s, re-read 45 s.
- 2026-10-13 — Completeness now measures coverage, not counts: the re-read runs only when under 80% of the CV's substantive bullet lines (8+ words) appear in the AI's answer; smaller gaps become a review note. All incomplete sections are re-read in one request, and a failed re-read keeps the first answer. On the first real CV the old count rule asked for a needless re-read (short sub-heading lines counted as bullets).
- 2026-10-13 — Leaving the upload page no longer fails the upload: the stream is cancelled, processing finishes, and the CV waits in Career profile for review.
- 2026-10-13 — §9.4 measured with `npm run eval:resume` (six fictional CVs, real providers, no cache, prompt v2 unless noted). Gemini Flash (`gemini-flash-latest` = gemini-3.8-flash): 6/6 CVs at 100% on every metric with prompt v1 and with v2 (the sixth v2 run waited for the quota reset). Gemini Flash-Lite: 6/6, 100%, ~6 s per CV. Groq `gpt-oss-120b`: 6/6, 100% (v1 scored bullets 92.1%, education 94.4%: it merged short project bullets into the description and kept the subject in the degree; prompt v2 rules 12–13 fixed both). Contact 36/36, roles 11/11, role fields 44/44, bullets 38/38, invented 0, skills recall and precision 63/63, education 18/18, certifications 4/4.
- 2026-10-13 — Google's free quotas are per model and the newest Flash allows about 20 requests a day. Gemini is now two providers on one key: `gemini` (Flash, limit 18/day) and `gemini-lite` (Flash-Lite, own quota), so using up Flash no longer takes Google out of the chain. Default chain: gemini → gemini-lite → groq → openrouter. The eval waits for the chosen provider instead of scoring the deterministic fallback.
- 2026-10-13 — ResumeParser prompt v2 adds two rules (project description vs bullets; degree vs field). Bumping the version keeps cached v1 answers from being reused.
- 2026-10-13 — `npm audit` findings above accepted by the project owner: high advisories only in Prisma's tooling (`mysql2`, `deepmerge-ts`) and dev-only tools; moderate ones only in `mammoth`'s command-line helper. None is reachable from the running app; CI keeps failing on critical findings. Revisit when Prisma ships fixed versions.
- 2026-10-13 — Target roles: the RoleSuggester (balanced tier, prompt v1) proposes roles with reasons citing CV evidence ids, title variants and keywords; code maps unknown slugs to catalog families by title (similarity ≥ 0.85), drops duplicates, caps at 10 and keeps roles the user added or selected when suggesting again. Category (Core ≥ 70%, Adjacent 40–69%, Stretch < 40% of core skills at level 3+, implied skills counted) and seniority (from computed years) are derived when the page loads, so they follow skill edits; they are not stored. Up to three Core roles are pre-selected for search the first time.
- 2026-10-13 — Evidence validator (`lib/evidence/validate.ts`, SPEC §8.4): a reason is verified only when it cites existing evidence ids and every number in it appears in the cited evidence or a computed fact (rounding down allowed, "5+ years" for 5.4). Unverified reasons are shown with an "Unverified" badge. Live check (fictional Ananya CV): Gemini Flash and Groq each suggested 6 catalog roles, all reasons verified.
- 2026-10-13 — Job search: Adzuna (main; published free limits 25/min, 250/day, 2,500/month, we stop at 20/225/2,250; descriptions cut to ~500 chars; listings need a "Jobs by Adzuna" label in the UI) → Jooble (free key; India works by country only, so the city goes into the keywords; ~119 React jobs India-wide) → SerpApi Google Jobs (free plan 250 searches/month, limit 225; full descriptions, "via" and every apply link; the remaining count comes from SerpApi's free account endpoint and is stored as the provider-reported allowance). Live check: Adzuna 50 Bengaluru React jobs, Jooble 30, SerpApi 10 with up to 8 apply links, forced Adzuna 429 → Jooble answered.
- 2026-10-13 — Embeddings: bge-small-en-v1.5 locally with `@huggingface/transformers` (approved by the owner; full-precision ONNX, ~130 MB downloaded once to `.cache/transformers`) → the same model on Cloudflare Workers AI (`pooling: "cls"`). Measured cosine local vs Cloudflare: 1.0000 (0.9996 through the chain); the q8 model would be 0.997 and was not used, to keep vectors from both identical. Every vector stores its model; vectors are only compared within one model. All pgvector SQL is in `server/repositories/vectors.ts`; the HNSW index is created in migration SQL.
- 2026-10-13 — Settings → Services lists all three chains (AI, job search, embeddings) with reorder, on/off and a Test button; SerpApi's test uses its account endpoint so it costs no search. Integration tests and the Playwright server force mock AI, job search and embeddings.
- 2026-10-13 — Search runs (SPEC §10.4, §11.5): plan = selected roles' first three title variants × preferred cities (+ "Remote" when remote is a work mode; the country when no location is set), interleaved and capped at `JOB_SEARCH_MAX_QUERIES_PER_RUN` (8); the first `SERPAPI_PRIORITY_QUERIES_PER_RUN` (2) also go to SerpApi. Each `advance` call works for ≤ 15 s (search → embed → rank) and saves its state; one run per user at a time; the browser drives it and resumes it when the page reopens. A city of residence from the CV is never used as a search location (personal details stay private).
- 2026-10-13 — Postings are cleaned in code: legal suffixes removed, canonical cities, `parseSalary` (LPA, lakhs, monthly, ranges, USD), experience ranges, seniority, conditions (notice, bond, night shifts, contract-to-hire, office days). Adzuna's estimated salaries are not shown as disclosed. Duplicates (same listing, same description, or same company + city with titles ≥ 90% alike within 30 days) merge: the fuller description wins and every apply link is kept; re-seeing a listing writes nothing unless it adds something.
- 2026-10-13 — Relevance (SPEC §10.5) as specified: skills 30 (job's catalogue skills held at level 3+, implied skills counted), semantic 20 (cosine 0.55→0, 0.85→1; when not embedded its weight is spread over the rest), title 20, experience 15, location/work mode 10, salary 5; unknown inputs are neutral (0.5) and labelled. "Not a fit" reasons (far above/below the user's years, outside locations, dealbreakers, notice period) hide a job without changing its score.
- 2026-10-13 — "For you" feed (SPEC §10.6): "For you" = not dismissed, no "Not a fit" reason, not older than 30 days, not a staffing agency, not a blocked company; the hidden groups may overlap and their counts ignore the filters. Filters live in the URL (salary in LPA matches jobs whose disclosed range reaches it). Sorted by relevance, then posting date; the "analysed" filter and Fit-score sorting wait for Phase 4. Dismiss reasons are stored on the job: 2+ "too senior" lower the margin above the user's years from 4 to 2 (4+: 1), 2+ "too junior" lower the margin below from 5 to 3, and "company" takes 15 points off that company's other jobs with the reason shown in the score breakdown. Such a dismissal (and any restore) re-scores every job at once. "New" uses `CareerProfile.feedSeenAt`, set when the feed opens; nothing is "new" before the first visit.
- 2026-10-13 — Role market stats are computed after each run and stored in `TargetRole.marketStats`: openings found by that role and posted (or, undated, found) in the last 30 days and not stale, their average relevance, and the skill most often missing (shown only when 2+ postings ask for it). The Overview checklist (CV, preferences, roles, first search, feed reviewed) is derived from data, never ticked by hand. Settings → Services adds SerpApi's own remaining count and "Your searches this month".
- 2026-10-13 — Server components that read the clock call `connection()` first: `getCurrentUser` is `"use cache: private"` and awaiting `searchParams` isn't enough either, so neither makes a render dynamic, and Next.js otherwise logs "unstable value `Date.now()` while prerendering" (seen on `/jobs`, `/jobs/roles` and `/settings/services` in the e2e server log; fixed).
- 2026-10-13 — Phase 3 live acceptance, `npm run search:live` (real job-search and embedding chains, fictional Ananya CV, one role "React Developer", Bengaluru + remote, mock AI so no AI quota): Adzuna forced to answer 429 → rested 60 s, Jooble answered all 6 queries; SerpApi answered 1 of 2 priority queries. Done in 90 s over 5 advance calls: 180 postings, 70 new jobs, 32 duplicates merged, 70 embedded locally (bge-small-en-v1.5) and ranked; feed 50 For you, 3 Not a fit, 16 older than 30 days, 1 staffing agency; best match 91. The second SerpApi call failed transiently and was skipped without a note; a failed priority query now throws and the run records "SerpApi didn't answer a priority query". A direct priority query afterwards returned 10 Bengaluru jobs.
- 2026-10-13 — JobExtractor (fast tier, prompt v1 with one worked example) returns responsibilities and requirements with kind, importance, years and the posting's own words. Code then checks every requirement: its quote (or text) must appear in the posting (fuzzy ≥ 0.85) or it is dropped and listed; skill names map to the catalogue through aliases; "3+ years of React" becomes a React requirement with 3 years; catalogue skills the posting names that no requirement covers are added as "implied" (source "keyword"); duplicates merge (higher importance wins); ids R1…Rn go to must-haves first. Short or common-word skill names ("Go", "Express") count only when written as the skill. Conditions (notice, bond, shifts, contract-to-hire, office days) stay with the Phase 3 regex: the AI is not asked, so it cannot invent a bond. A job is extracted again only when its description or the prompt version changes. Years and seniority read by regex at search time are kept; the extraction fills only what they left empty.
- 2026-10-13 — Fit score (SPEC §12.2) in `lib/scoring`, as specified, with these readings: a related skill counts half when held at level 3+; "fewer years than stated" applies only when the user's years with that skill are known; a skill the catalogue doesn't know counts as missing (FitAnalyst may accept a semantic match in 4b, worth at most half); non-skill requirements other than years (education, domain, soft skills) are left to FitAnalyst, which must cite CV evidence; above the asked range by up to 3 years counts as in range. Recommendation: APPLY at ≥ 72 with no blockers; CONSIDER at 55–71 with no blockers or ≥ 72 with one blocker; otherwise LOW_PRIORITY (a blocker costs one level, so a middle score with a blocker is low priority). Score gains re-score only the skills part with the skill at level 3. Salary context uses each job's mid-point, n ≥ 5, last 90 days, same role family and city.
- 2026-10-13 — Settings → Scoring edits the five component maxima (must sum to 100) and the two thresholds; each save is a new `ScoringConfig` version, reset returns to the built-in defaults (version 0). `JobAnalysis` stores score, breakdown, blockers, gains and salary context per input hash (requirements, job, profile, settings, CV version, scoring code version), so unchanged inputs reuse the stored analysis; the report text is added in 4b.
- 2026-10-14 — FitAnalyst (strong tier, prompt v1) writes only the judgement parts of the report (§12.4 sections 1–4, 7, 9, 10); the score breakdown, conditions, ATS keyword check, salary context and report confidence are computed in code. Every AI sentence is a claim with E (CV evidence), R (requirement) and S (computed stat) ids. Stats S1…Sn are built from the score, components, profile facts, conditions, gains and blockers, and list every number the report may use.
- 2026-10-14 — The code validator checks (§8.4 + §12.5): ids exist; every number comes from a cited stat, CV line, requirement or verified quote (quotes of 3+ words must appear in the CV or posting; shorter quotes can't hide numbers); every required requirement is assessed; statuses equal the code's, except a skill the code found missing may be "partial" as a semantic match citing CV evidence; "unscored" requirements (education, domain, soft) need evidence for strong/partial or are "unclear" (a status added so the AI isn't forced to guess); statements about the user cite E, about the job cite R; strategy within the actions allowed for the recommendation (APPLY: apply now or tailor first; CONSIDER: tailor first or referral; LOW_PRIORITY: referral or skip); 20 banned generic phrases; word and item limits. Problems go back to the model once; the answer with fewer problems is kept and remaining issues are stored as "Unverified".
- 2026-10-14 — Accepted semantic matches change the score as SPEC §12.2 says (half credit, labelled AI inference); the code-only total is kept in the validation record. They are stored with the analysis, not in its input hash, so re-analysing keeps them and never calls the AI again for the same inputs.
- 2026-10-14 — "Streamed" is implemented as streamed progress stages (requirements → evidence → writing → saving), like the CV upload, rather than partial JSON: a half-written report can't be validated, and the UI only shows validated text. The page arrives in 4c.
- 2026-10-14 — Experience relevance: each duty is matched to the closest CV work line by meaning (bge-small embeddings, cosine ≥ 0.6; skipped when no embedding service answers). Risk effort for "learn" comes from the skill taxonomy, never from the AI. The mock and no-AI report is written from code data and passes the validator.
