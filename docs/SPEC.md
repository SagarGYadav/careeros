# CareerOS — Product & Technical Spec (v5)

CareerOS is the product name (the original brief called it "AI Career Intelligence OS").
Authoritative spec. It replaces the original 64-section brief; §0 lists what changed and why.

---

## 0. Decisions

| Decision | Why |
|---|---|
| **The app starts from the user's CV.** Upload CV → precise extraction → suggested roles → find openings on job sites **and** company career websites → professional fit report per job → user applies → track outcomes. | This is the product the user wants. |
| **Four non-negotiable quality requirements** (user): (1) precise, detailed CV extraction (§9); (2) the extracted data drives relevant job discovery (§10); (3) deep search that also finds jobs listed only on company websites (§11); (4) professional-grade job analysis, not shallow summaries (§12). Each has measurable acceptance targets. | Stated by the user as basic requirements. |
| **Jobs come only from official/public sources:** Adzuna, Jooble, SerpApi Google Jobs, public ATS job-board APIs (Greenhouse, Lever, Ashby, SmartRecruiters, Recruitee), schema.org `JobPosting` data and public career pages (respecting robots.txt), found via web search (Tavily, Exa, Firecrawl). **No scraping** of LinkedIn/Naukri; no login-walled pages. | LinkedIn/Naukri forbid scraping; company sites publish openings publicly. |
| **The user applies on the job site and updates statuses manually.** No auto-apply, no email reading in v1. | Reliability, site rules, budget. |
| **Zero running cost with automatic failover.** Every external service has a free main provider and 1–2 free backups (§7.2). The app switches automatically when a limit is near or hit, and degrades gracefully when all are used up (e.g. no-AI mode). | User requirement. Scores are computed by code, so AI is an enhancement, not a dependency. |
| **Scores and recommendation labels are computed by code.** LLMs extract structure and write analysis bound to evidence IDs (§8.4). | Trustworthy, explainable results. |
| **Long searches run as resumable batches** driven by the browser (no queue). | Works on free hosting time limits and locally. |
| **Removed the AI interview agent.** Interview logging and a one-shot question generator remain. | Not needed now. |
| **Public repository** with fictional fixtures only; **demo data in a separate demo user**. | Portfolio piece; demo never mixes with real data. |
| **Vercel AI SDK** is the LLM abstraction behind `lib/ai`. | Avoids reinventing provider code. |

---

## 1. Product

**One-liner:** upload your CV; CareerOS extracts it precisely, works out which roles fit you, searches job sites and
company career websites for openings, writes a recruiter-grade fit report for each job, tracks your applications and
learns from your results.

| Capability | Phase |
|---|---|
| Resume intelligence — CV upload, precise extraction, profile | 2 |
| Job discovery — suggested roles, job sites and Google Jobs, CV-driven relevance ranking | 3 |
| Job-description analysis + AI matching — professional Fit Report, per-job skill gaps | 4 |
| Deep web search — company career websites and ATS boards | 5 |
| Job application tracking | 6 |
| Skill-gap analysis across the market | 7 |
| Resume versions, health check, tailoring | 8 |
| Outcome analytics + career pattern detection | 9 |
| AI-assisted career decisions | 10 |
| Interview preparation | 11 |
| Personal career knowledge base (RAG) | 12 |
| Web research + assistant | 13 |

**User:** one developer (initially a frontend developer in India). Everything else — roles, skills, salary, locations,
currency — comes from the CV, profile and settings. Nothing is hard-coded.

**Out of scope:** AI interview agent, auto-apply, reading email, scraping LinkedIn/Naukri or login-walled pages,
browser extension, generating resume PDF/DOCX, OCR for scanned PDFs, teams, email/push notifications.

## 2. Information architecture

```
Overview                      onboarding checklist, today's actions, new matches, pipeline summary
Jobs
  ├─ For you                  all discovered jobs ranked by relevance and fit
  ├─ Target roles             suggested roles from the CV, search settings, market stats per role
  ├─ Company sites            company career-site registry: discovered + your watchlist (Phase 5)
  ├─ All jobs                 every job, any source, with filters
  └─ Add job                  paste · URL · manual
Applications                  Pipeline (Kanban ⇄ table) · Analytics (Phase 9)
Career Intelligence           Skill gaps (7) · Insights (9) · Strategy (10)
Resume Lab                    versions, health check, tailoring, performance (2, 8)
Interviews                    log (6), prep (11)
Knowledge Base                documents, Q&A with citations (12)
Ask                           assistant panel ⌘J (13)
Career Profile                personal details, experience, projects, education, certifications, skills, preferences, memory
Settings                      scoring, statistics thresholds, search limits and usage, AI usage, data export/delete
```
Nav items appear only when their phase is built (a `features` config drives the sidebar). ⌘K lists only working commands.

## 3. Core journey

1. Sign up → **upload CV** → side-by-side review (original CV next to extracted data) → confirm → profile + Resume v1.
2. Preferences: locations (+ remote), work modes, expected salary, current CTC, notice period, dealbreakers.
3. **Suggested roles** (Core / Adjacent / Stretch) → select and edit.
4. **Find jobs** → job sites and Google Jobs (Phase 3) and **deep search** of company career websites (Phase 5) →
   deduplicate → relevance ranking → automatic Fit Reports for the top matches → **For you** feed.
5. Open a job → **Fit Report** → Open on site to apply → **Mark as applied**.
6. Track through the pipeline; log interview rounds; record outcomes.
7. Over time: market skill gaps, analytics, patterns, Analyze My Career.

## 4. Domain model

Every user-owned table has `userId`, `createdAt`, `updatedAt`. Auth tables are owned by Better Auth.

| Entity | Key fields | Notes |
|---|---|---|
| PersonalDetails | fullName, email, phone, city, state, country, links { linkedin, github, portfolio, other[] }, otherDetails (JSON: date of birth, languages known, etc. — only if present in CV) | 1:1. Sensitive: never used for matching, never sent to search providers, never logged |
| CareerProfile | headline, summary, yearsExperience (computed), currentCtc, expectedCtcMin/Max, currency (INR), noticePeriodDays, preferredLocations[], workModes[], openToRelocate, dealbreakers (bond, nightShift, contractToHire, maxWfoDaysPerWeek), domains[] (from experience) | 1:1 |
| RoleFamily | name, slug, adjacentSlugs[], coreSkillIds[], titleVariants[], seniorityBands | Seeded role catalog, user-editable |
| TargetRole | title, roleFamilyId, seniority, category (core, adjacent, stretch), reason, evidenceQuotes[], titleVariants[], keywords[], marketStats, source (ai, user), selected | Drives search |
| Skill | name, slug (unique), category, aliases[], defaultLearningEffort 1–3, resources[{ title, url }] | Global taxonomy + user-added |
| SkillRelation | fromSkillId, toSkillId, type (implies, related) | e.g. Next.js implies React |
| UserSkill | skillId, proficiency 1–5, proficiencySource (user, ai_suggested), years, lastUsedYear, evidenceIds[], source (cv_section, cv_inferred, self, import) | unique (userId, skillId) |
| UserSkillHistory | skillId, proficiency, changedAt | Growth over time |
| ExperienceEntry | company, title, employmentType, location, workMode, startDate, endDate, isCurrent, durationMonths (computed), domain, teamSize?, summary, bullets[{ id, text, kind (responsibility, achievement), hasMetric }], technologies[] | Bullet ids are CV evidence ids |
| ProjectEntry | name, role, description, technologies[], links[], startDate, endDate, bullets[{ id, text }] | |
| EducationEntry | institution, degree, field, startDate, endDate, grade (CGPA / %), location | |
| CertificationEntry | name, issuer, issueDate, expiryDate, credentialId, url | |
| OtherCvSection | type (award, publication, volunteering, language, interest, other), items (JSON) | Nothing in the CV is dropped |
| CareerFact | text, category, source (user, ai_suggested, import), status (active, pending, archived) | Career memory |
| Company | name, normalizedName (unique per user), aliases[], website, careersUrl, type, sizeBucket, industry, isStaffingAgency, isBlocked | |
| CareerSite | companyId?, url, kind (greenhouse, lever, ashby, smartrecruiters, recruitee, jsonld, html), boardToken?, source (discovered, user), status (active, no_relevant_jobs, blocked_by_robots, failed), lastFetchedAt, lastJobCount, relevantJobCount, failures | Registry that grows with every deep search |
| Job | companyId, title, roleFamilyId, seniority, location, locationCity, workMode, employmentType, salaryMinAnnual, salaryMaxAnnual, salaryCurrency, salaryText, salaryDisclosed, expMinYears, expMaxYears, descriptionRaw, descriptionHash, descriptionTruncated, origin (search, deep_search, paste, url, manual, csv), provider (adzuna, serpapi, greenhouse, lever, ashby, smartrecruiters, recruitee, jsonld, html, mock), externalId, postedVia, isDirectFromCompany, applyLinks[{ site, url }], postedAt, discoveredAt, feedStatus (new, saved, dismissed), dismissReason, quickScore, scoreParts, searchRunId, conditions (noticePeriodMaxDays, immediateJoiner, bond, shift, contractToHire, wfoDaysPerWeek), isStale, extractionStatus, embedding vector(384) | A posting; may exist without an application |
| JobRequirement | id, jobId, skillId?, text, kind (skill, experience, education, domain, responsibility, soft, other), importance (required, preferred, nice_to_have, implied), yearsRequired?, quote, source (ai, user, keyword) | Requirement ids are cited in reports |
| JobSearchRun | kind (standard, deep), targetRoleIds[], plan (JSON: queries, sites), state (JSON: stage, cursor), progress, requestsByProvider, pagesFetched, resultCount, newCount, errors, status | Resumable batches + quota tracking |
| ScoringConfig | version, weights, thresholds, active | |
| JobAnalysis (Fit Report) | jobId, resumeVersionId, scoringConfigVersion, scoreTotal, breakdown, recommendation, blockers, gains, salaryContext, report (JSON, §12.4), validation, model, promptVersion, inputHash | Cached by inputHash |
| Application | jobId (unique), status, stageReached, appliedAt, closedAt, resumeVersionId, source, isReferral, referrerName, direction, followUpAt, offerDecision, rejectionReason, rejectedAtStage, jobSnapshot, lastActivityAt, notes, importBatchId | |
| ApplicationEvent | applicationId, type, fromStatus, toStatus, occurredAt, title, note, createdBy | Timeline |
| InterviewRound | applicationId, roundType, scheduledAt, result, selfRating, topicSkillIds[], questionsAsked[], notes | |
| ResumeVersion | name, targetRoleFamilyId, parentId, isDefault, fileId, fileName, mimeType, sizeBytes, extractedText, linkAnnotations[], parsed (JSON with evidence ids), fieldConfidence, verification (JSON), parseStatus, healthReport | |
| StoredFile | bytes, mimeType, sizeBytes, sha256 | `database` storage provider |
| ResumeSuggestion, Document, DocumentChunk, CompanyResearch, CareerAnalysisRun, ChatThread, ChatMessage, ImportBatch, Contact, SavedView | as in their sections | Later phases |
| AiRequestLog | feature, provider, model, promptVersion, inputTokens, outputTokens, latencyMs, status, errorCode, fallbackFrom, fallbackReason, inputHash | No raw content |
| ProviderUsage | service (ai, job_search, web_search, embeddings), provider, periodKind (day, month), periodStart, count, limit, reportedRemaining, resetsAt, cooldownUntil, consecutiveFailures, circuitOpenUntil | Drives failover (§7.3) |
| RateLimitBucket | key, windowStart, count | Postgres-backed limiter |

**Indexes:** Job(userId, feedStatus, quickScore), unique Job(userId, provider, externalId), Job(userId, descriptionHash),
Job HNSW(embedding vector_cosine_ops), CareerSite(userId, status, lastFetchedAt), Application(userId, status),
Application(userId, appliedAt), JobRequirement(jobId), JobRequirement(skillId), ApplicationEvent(applicationId, occurredAt),
AiRequestLog(userId, createdAt).

**pgvector with Prisma:** `embedding Unsupported("vector(384)")?`; all vector SQL in one repository file (`$queryRaw`).

**Salary:** annual numbers + currency; INR shown as LPA. `parseSalary()` handles "8-12 LPA", "₹80k/month",
"₹6,00,000 - ₹9,00,000 a year", "$90,000", "Not disclosed".

## 5. Status model and metric definitions

**Statuses:** SAVED, APPLIED, RECRUITER_CONTACT, ASSESSMENT, INTERVIEW, FINAL_ROUND, OFFER, REJECTED, WITHDRAWN, GHOSTED.
**Stages:** APPLIED(1) < RECRUITER_CONTACT(2) < ASSESSMENT(3) < INTERVIEW(4) < FINAL_ROUND(5) < OFFER(6).
**`stageReached`** = highest stage ever recorded, updated in the same transaction as any status change; funnel metrics
use it, never the current status.

| Term | Definition |
|---|---|
| Submitted | `appliedAt` set |
| Mature | submitted AND (appliedAt ≤ today − `maturityDays` [21] OR stageReached ≥ 2 OR status ∈ {REJECTED, GHOSTED}) |
| Denominator | mature, submitted, outbound, excluding withdrawn-before-response; excluded counts shown |
| Response / Callback / Interview / Offer rate | any employer response / stageReached ≥ 2 / ≥ 4 / = 6, over the denominator |
| Interview → offer | offers / apps with stageReached ≥ 4 |
| Time to first response | median days (p75 too) |
| Ghosted suggestion | no employer event after `ghostDays` (30) |
| Inbound | recruiter-initiated; excluded from outbound rates by default |

## 6. Statistics engine (`lib/stats`) — Phase 9
Wilson 95% intervals; confidence labels by n (< 5 insufficient, 5–14 early signal, 15–39 moderate, ≥ 40 strong);
segment-vs-rest labels (insufficient, no_clear_difference, possible, notable); at most 5 patterns per side with the number
of segments tested; confounding caveats for resume-version and referral comparisons.

## 7. Data flow and external services

### 7.1 Data flow
```
CV ─► extraction + verification (§9) ─► profile + CV evidence catalog (E-ids)
profile ─► suggested target roles (§10.1)
target roles ─► search runs: job sites + Google Jobs (§10) and company career sites (§11)
jobs ─► normalise → dedupe → embed → relevance ranking (§10.5) ─► top N ─► Fit Report (§12)
Fit Report ─► user applies on the site ─► tracking (§13) ─► outcomes ─► analytics (§16) ─► career decisions (§17)
```

### 7.2 Every service has a main provider and free backups
All providers are free with no card required (verify each free tier when implementing). A provider without a key is
skipped. Mock providers exist for tests and cloud dev sessions; they are not counted as backups.

| Service | Main | Backup 1 | Backup 2 | When all are used up |
|---|---|---|---|---|
| AI (LLM) | Google Gemini free tier | Groq free tier | OpenRouter free models (list of `:free` models, tried in order) | no-AI mode until the daily reset (keyword extraction + code scoring) |
| Job-site search | Adzuna | Jooble | SerpApi Google Jobs | cached results stay; company career sites are still checked |
| Web search (finding company career sites, research) | Tavily | Exa | Firecrawl search | discovery pauses; known sites in the registry are still re-checked via keyless ATS APIs |
| Embeddings (semantic match) | Local `bge-small-en-v1.5` (transformers.js) | Same model on Cloudflare Workers AI | — | rank without the semantic part; embed the job later |
| Company job boards | Public ATS API (keyless) | `JobPosting` JSON-LD on the careers page | Careers-page reader | site marked failed, retried with backoff |
| Database, hosting, files | Neon free, Vercel Hobby, files in Postgres | Manual only: local Docker Postgres with `npm run db:export` / `db:import`; run locally | — | not automatic; one user stays far below these limits |

- SerpApi is also used every run for a few top-priority queries (it includes postings from LinkedIn, Naukri and company
  sites), as long as its quota allows. Different sources report its free plan as 100 or 250 searches a month, so the
  app reads the real remaining count from SerpApi's account endpoint.
- Embedding backups must run the **same model**: vectors from different models cannot be compared.

### 7.3 Failover mechanics (`lib/providers`)
- One `ProviderChain<T>` is used by every service: an ordered list of providers; each call goes to the first
  **available** one. Available = configured + within quota + not cooling down + circuit closed.
- **Quotas:** daily and/or monthly limits per provider, counted locally in ProviderUsage. When a provider reports its own
  remaining allowance (rate-limit headers, SerpApi account endpoint, OpenRouter key endpoint), the reported number wins.
  The chain switches **proactively at 90%** of a limit, so the main provider is never pushed to a hard failure.
- **Errors:** 429 → cooldown until `retry-after` (else 60 s, doubling); quota-exhausted errors → unavailable until the
  reset time; 5xx/timeout → one retry, then the next provider; 3 consecutive failures → circuit open for 10 minutes.
- **Different capabilities:** backups that can't read PDFs receive extracted text. Every result records which provider
  and model produced it; AI results made by a backup show that model's name and can be regenerated with the main
  provider later.
- **UI:** a quiet banner while a service runs on a backup ("Using Groq — Gemini's daily limit reached, resets in 3 h");
  Settings → Services lists each chain with status (OK, near limit, exhausted, cooling down, not configured), usage vs
  limit, reset time, reorder/disable controls and "Test connection".
- **Logging:** provider, `fallbackFrom` and the reason are recorded for every switch.

## 8. AI architecture

### 8.1 Provider layer (`lib/ai`)
- Vercel AI SDK. `AI_PROVIDERS` ordered chain (§7.2); default `gemini,groq,openrouter`; `ollama` optional; `openai`/`anthropic`
  supported but paid and never used unless listed; `mock`. Workflows declare a tier (fast, balanced, strong); each
  provider maps tiers to its models via env; free providers map strong → their best free model.
- Failover follows §7.3; when every AI provider is exhausted → **no-AI mode** until the daily reset:
  keyword extraction against the taxonomy (importance from headings like "Must have", "Nice to have"; conditions by regex),
  scores still compute, AI panels say "AI unavailable — free daily quota used up".
- `runStructured({ workflow, tier, system, instructions, untrusted[], schema })`: versioned prompt → native structured
  output → Zod validation → one repair attempt → `AppError('AI_INVALID_OUTPUT')`. Timeout 60 s, ≤ 2 retries with
  jittered backoff, AiRequestLog row, cache by `inputHash`.
- Extraction workflows: temperature 0 where supported, few-shot examples covering Indian CV and JD styles.
- Privacy note in Settings: Gemini's free tier may use submitted content to improve Google's products.

### 8.2 Workflows

| Workflow | Input | Output | Tier | Phase |
|---|---|---|---|---|
| ResumeParser | CV PDF (Gemini) + extracted text + link annotations | ParsedCv (§9.2) | strong | 2 |
| RoleSuggester | profile, evidence catalog, role catalog | roles[{ title, roleFamily, seniority, fitReason, evidenceIds[], titleVariants[], keywords[] }] | balanced | 3 |
| JobExtractor | JD text (untrusted) | title, company, location, workMode, employmentType, salary, experience, roleFamily, seniority, responsibilities[], requirements[{ text, skillName?, kind, importance, yearsRequired?, quote }], conditions, injectionSuspected | fast | 4 |
| FitAnalyst | requirements with ids, CV evidence catalog with ids, score breakdown, conditions, salary context, facts | FitReport (§12.4) | strong | 4 |
| CareerPageExtractor | career page text (untrusted) | jobs[{ title, location, url, snippet }] | fast | 5 |
| ResumeTailor | parsed CV, requirements, facts, KB | suggestions[] | balanced | 8 |
| CareerAnalyst | stats snapshot with ids | CareerReport | strong | 10 |
| InterviewPrep | requirements, CV, past questions | questions[] | balanced | 11 |
| KnowledgeAnswerer | question + chunks | answer, citations[] | balanced | 12 |
| CompanyResearcher | web results (untrusted) | claims with sourceIds | balanced | 13 |
| Assistant | conversation + read-only tools | streamed text + tool calls | balanced | 13 |

### 8.3 Prompt-injection defence
`wrapUntrusted()` around CVs, JDs, career pages, documents and web pages; system prompt treats them as data; regex
pre-scan flags "Suspicious content"; models have no write tools; output rendered as plain text or sanitised Markdown.

### 8.4 Evidence binding
- **CV evidence catalog:** every experience bullet, project bullet, certification and skill-evidence item gets a stable
  id (E1…En) with its exact text and location in the CV.
- **Requirement ids:** R1…Rn per job. **Stats ids:** S1…Sn for computed numbers (scores, salary context, rates).
- Every AI claim carries `evidenceIds[]` / `requirementIds[]`. The validator checks: ids exist; quoted CV text matches
  the catalog verbatim; every number in AI text matches a referenced stat; claims relying only on `insufficient` stats
  become data-quality notes. Failures are repaired once, then marked "Unverified".
- The UI renders evidence chips from stored data, never from AI text.

### 8.5 Cost, limits, observability
Deterministic first; top-N auto analysis only; explanations cached by hash; per-provider daily/monthly quotas checked
before each call; demo user always on mock; Settings → Usage shows AI requests per provider vs free limits and search
quotas per provider; progress steps streamed for long operations.

### 8.6 AI quality evaluation
Golden sets in `evals/<workflow>/` (fictional but realistic). `npm run eval:<workflow>` runs against the configured real
provider locally (never in CI) and prints metrics; results saved in `evals/results/` per prompt version. CI runs the sets
against the mock provider for schema conformance. Targets are listed in §9.4 and §12.6.

## 9. Requirement 1 — Precise CV extraction (Phase 2)

### 9.1 Pipeline
1. Upload PDF/DOCX ≤ 5 MB → magic-byte check → store original (`StoredFile`).
2. **Deterministic layer:** text with page numbers (`unpdf`) or DOCX text (`mammoth`); **PDF link annotations**
   (so "LinkedIn" text linked to a URL is captured); regex extractors for emails, Indian and international phone numbers,
   URLs, dates; section-heading detection (Experience, Projects, Education, Certifications, Skills, Awards, …).
3. **AI layer:** ResumeParser (strong tier). Gemini receives the PDF itself **and** the extracted text (layout + exact
   strings); other providers receive text. Output = ParsedCv (§9.2) with a source quote for every field.
4. **Verification layer (code):**
   - Grounding: every extracted string (company, title, institution, bullet, skill) must be found in the CV text
     (normalised fuzzy match ≥ 0.9); otherwise it is flagged "not found in CV" — never saved silently.
   - Deterministic fields win: email, phone and URLs from regex/annotations override or confirm the AI.
   - Completeness: every detected section must have extracted content; bullet counts per role are compared with the
     text; a missing or short section triggers a targeted second pass for that section only.
   - Dates normalised to YYYY-MM; durations, total experience, overlaps and gaps (> 3 months) computed in code.
5. **Review screen:** original CV preview (pdf.js) side by side with the extracted data; flagged and low-confidence
   fields highlighted; clicking a field shows its source quote; every field editable; "Confirm" writes the profile.
6. Re-upload later → same pipeline → merge diff (added / changed / removed) for approval.

### 9.2 ParsedCv (what is extracted)
- **Personal:** full name, email, phone, city/state/country, LinkedIn, GitHub, portfolio, other links; other personal
  details only if present (date of birth, languages known, etc.), marked sensitive and never used for matching.
- **Headline and summary.**
- **Experience (each role):** company, title, employment type, location, work mode, start, end, current, domain/industry,
  team size if stated, responsibilities and achievements as separate bullets (achievements with metrics flagged),
  technologies used in that role.
- **Projects:** name, role, description, technologies, links, dates, highlights.
- **Education:** institution, degree, field, dates, grade (CGPA / %), location.
- **Certifications:** name, issuer, issue and expiry dates, credential id / URL.
- **Skills:** explicit (from the skills section, with categories) and inferred (from experience/projects, each with
  evidence ids); soft skills separate.
- **Other sections:** awards, publications, volunteering, spoken languages, interests — nothing is dropped.
- **Job-search details if written in the CV:** notice period, current and expected CTC, preferred locations.

### 9.3 From extraction to profile
Skills map to the taxonomy (slug/alias); unknown names become "unreviewed" user skills. Proficiency suggestion =
transparent rule (years used + recency + number of roles/projects), AI may adjust ±1 with a reason, shown as
`ai_suggested` until confirmed. Years of experience are computed from dates (overlaps merged).

### 9.4 Acceptance targets (golden set, real Gemini, recorded in ROADMAP Decisions)
Fixtures generated by `scripts/make-fixtures.ts` (fictional): single-column PDF, two-column PDF, DOCX, table-heavy
PDF, Indian-format CV (DOB, CTC, notice period), CV with linked-text URLs.
- Contact fields and links: 100% exact.
- Experience entries: 100% found; company/title/dates ≥ 95% exact.
- Bullets: ≥ 95% captured, 0 invented (grounding check passes).
- Skills: recall ≥ 90%, precision ≥ 95%.
- Education and certifications: ≥ 95% field accuracy.

## 10. Requirement 2 — CV-driven job discovery (Phase 3)

### 10.1 Suggested roles
RoleSuggester proposes 5–10 roles from the role catalog plus custom ones, each with reasons citing CV evidence ids,
3–5 title variants and keywords. Category by code (share of the role family's core skills held at proficiency ≥ 3:
Core ≥ 70%, Adjacent 40–69%, Stretch < 40%). Seniority checked against computed years. After each search, every role
card shows market stats: openings found (30 days), average fit, most common missing skill.

### 10.2 How the CV drives the search
| From the CV/profile | Used for |
|---|---|
| Selected roles' title variants | Search queries |
| Top skills (proficiency × recency) | Keyword parameters where supported (e.g. Adzuna), relevance ranking |
| Computed years + seniority | Excluding roles far above/below the user's level (shown under "Not a fit" with the reason) |
| Preferred locations, remote, work modes | Location parameters, filters |
| Expected salary | Salary floor where supported; salary fit |
| Domains from experience | Relevance boost |
| Notice period, dealbreakers | Condition checks |
Personal details are never sent to any search provider.

### 10.3 Providers (`lib/jobsearch`)
```ts
interface JobSearchProvider {
  name: 'adzuna' | 'jooble' | 'serpapi' | 'mock';
  search(params: { query: string; keywords?: string[]; location: string; country: string;
                   datePosted?: 'day' | '3days' | 'week' | 'month'; salaryMin?: number; page?: string })
    : Promise<{ jobs: NormalizedJob[]; nextPage?: string; requestsUsed: number }>;
}
```
- **Adzuna** (main; free key, India; volume): descriptions often shortened → `descriptionTruncated`.
- **Jooble** (backup 1; free key): snippets only → `descriptionTruncated`; confirm India coverage and the request
  format against its API page when implementing.
- **SerpApi Google Jobs** (free plan; quality): includes postings from LinkedIn, Naukri, Indeed **and company career
  sites that publish `JobPosting` structured data**, with "posted via" and apply links.
- **Mock:** ~60 realistic fictional Indian postings.
Order and failover per §7.2–7.3: Adzuna → Jooble → SerpApi; SerpApi (backup 2) also takes a few top-priority queries
every run while its quota allows.

### 10.4 Search run
Queries = selected roles' title variants × locations (+ remote), capped per run. Every query goes through the job-search chain
(§7.2); the highest-priority ones also go to SerpApi while its quota allows. Results → normalise (company suffixes removed; cities canonical: Bengaluru,
Gurugram, Mumbai, Remote-India) → `parseSalary` → conditions by regex → dedupe (provider + externalId; or same company +
city with title similarity ≥ 0.9 within 30 days; or same descriptionHash; duplicates merge apply links) → embed (local)
→ quick match → save → Fit Reports for the top `JOB_DEEP_ANALYSIS_TOP_N` (from Phase 4). Runs as resumable batches
(§11.5) with streamed progress.

### 10.5 Relevance ranking — quick match (code, every job, free)
| Part | Weight | Computation |
|---|---|---|
| Skill coverage | 30 | profile skills (with aliases and skill relations) found in title + description, weighted by proficiency |
| Semantic similarity | 20 | cosine similarity between the CV profile embedding (summary + experience bullets + skills) and the JD embedding (embedding chain §7.2; if unavailable, its weight is spread over the other parts and the job is embedded later) |
| Title match | 20 | similarity to selected roles' title variants |
| Experience fit | 15 | "x–y years" patterns vs computed years (unknown → neutral, flagged) |
| Location / work mode | 10 | preference match |
| Salary | 5 | when disclosed |
Shown as "Relevance" with its parts; replaced by the full Fit score once a Fit Report exists.

### 10.6 "For you" feed
Sorted by Fit score when available, else relevance. Filters: role, location, work mode, posted date, source,
direct-from-company, salary, analysed. Card: title, company, location, source + date, score type and value, top 3
reasons, top gap, "Direct from company site" badge. Hidden by default with counts: stale (> 30 days), staffing-agency
reposts, blocked companies, "Not a fit" (seniority/location/dealbreaker). Dismiss asks an optional reason (not relevant,
too senior, too junior, location, company, salary); reasons tune ranking (e.g. repeated "too senior" tightens the
seniority filter; dismissed companies rank lower). New-since-last-visit badges; bulk dismiss.

## 11. Requirement 3 — Deep web search: company career websites (Phase 5)

Goal: also find openings that exist only on a company's own careers page, not on LinkedIn or Naukri.

### 11.1 Where they come from
1. **Google Jobs** (Phase 3) already includes many company-site postings that publish `JobPosting` structured data.
2. **ATS job boards:** most company career pages are hosted on an applicant-tracking system with a public, keyless JSON
   feed: Greenhouse `boards-api.greenhouse.io/v1/boards/{token}/jobs?content=true`, Lever
   `api.lever.co/v0/postings/{site}?mode=json`, Ashby `api.ashbyhq.com/posting-api/job-board/{name}`, SmartRecruiters
   `api.smartrecruiters.com/v1/companies/{id}/postings`, Recruitee `{company}.recruitee.com/api/offers/`.
   Verify each endpoint against official docs when implementing; Workable is excluded until a working public endpoint
   is confirmed.
3. **Company careers pages** with `JobPosting` JSON-LD, or plain HTML job lists (Indian ATSs such as Keka, Zoho
   Recruit, Darwinbox and Freshteam are handled through this generic path unless a public JSON feed is confirmed).

### 11.2 Discovery (how CareerOS finds the companies)
- **Web search (chain: Tavily → Exa → Firecrawl, §7.2):** per run, a small set of queries built from target roles × locations, e.g.
  `site:boards.greenhouse.io frontend Bengaluru`, `site:jobs.lever.co react India`, `site:jobs.ashbyhq.com`,
  `site:jobs.smartrecruiters.com`, `site:recruitee.com`, `site:keka.com careers frontend`,
  `"careers" "frontend developer" Bengaluru -linkedin -naukri -indeed`. Result URLs → ATS host patterns → board tokens.
- **Companies already seen** in Phase 3 results → find their careers page (website → `/careers`, `/jobs`, ATS links).
- **User watchlist:** add a company name or careers URL; CareerOS detects the type.
- Every discovered site is saved in the **CareerSite registry**, so coverage grows with each run and later runs mostly
  re-check known sites for free.
- If every web-search provider is used up, discovery pauses, but known sites in the registry are still re-checked
  through their keyless ATS APIs.

### 11.3 Reading a site
1. ATS host → its JSON API (keyless, complete descriptions).
2. Otherwise fetch the careers page (SSRF guard, **robots.txt respected**, `CareerOS/1.0 (personal job search)` user
   agent, 10 s timeout, 2 MB cap) → detect embedded ATS (iframe/script/links to ATS hosts) → JSON API.
3. Otherwise `JobPosting` JSON-LD on the page or on linked job pages.
4. Otherwise CareerPageExtractor (AI, fast tier) on the page text to list job titles and links, then fetch only the job
   pages whose titles match target roles.
Postings are filtered locally by title variants, location (India / chosen cities / remote) and freshness, then go
through the same normalise → dedupe → embed → relevance pipeline. Duplicates of job-site postings merge, and the
company's own page becomes the primary apply link ("Direct from company site").

### 11.4 Limits and etiquette (free and polite)
Web searches ≤ `DEEP_SEARCH_MAX_WEB_SEARCHES_PER_RUN` (20) per run, within each provider's quota; ≤ `DEEP_SEARCH_MAX_PAGES_PER_RUN` (60)
page fetches; concurrency 4; ≥ 1 s between requests to the same host; each CareerSite re-fetched at most daily; sites
with no relevant jobs over 3 runs are checked weekly; failures back off. No login-walled pages, no CAPTCHAs, no LinkedIn
or Naukri pages.

### 11.5 Resumable runs
`POST /api/search-runs` creates a run with a plan; the browser calls `POST /api/search-runs/{id}/advance` repeatedly;
each call does ≤ 20 s of work (a batch of requests or pages), saves `state`, and returns progress
(stage, done/total, new jobs). Closing the tab pauses the run; reopening resumes it. Works on free hosting and locally.

### 11.6 Acceptance targets
On a recorded fixture set (saved HTML/JSON responses for ~15 sites: 5 ATS boards, 4 JSON-LD pages, 3 plain HTML pages,
3 robots-disallowed/failing): ATS and JSON-LD jobs 100% extracted; HTML pages ≥ 80% of job titles found; robots-disallowed
sites never fetched; duplicates with Phase 3 results merged. One live run with real web-search keys recorded in Decisions
(sites discovered, jobs found, direct-only jobs found).

## 12. Requirement 4 — Professional job analysis: the Fit Report (Phase 4)

### 12.1 Inputs
Discovered jobs and manually added ones (paste; URL with SSRF guard and JSON-LD; manual form). Jobs with
`descriptionTruncated` get a "partial description" warning and a "Paste full description" action.

### 12.2 Fit score (`lib/scoring`, code)
| Component | Default max | Computation |
|---|---|---|
| Skills | 45 | Σ(weight × match) / Σ weight × 45. Weights: required 3, preferred 1.5, implied 1, nice-to-have 0.5. Match: proficiency ≥ 3 → 1, 2 → 0.5, else 0. *Implied by* a user skill (SkillRelation) counts at that proficiency; *related* gives 0.5; fewer years than stated drops one level; an AI semantic match accepted by code is worth ≤ 0.5 (labelled AI inference). |
| Experience | 20 | In range → 20; below by ≤ 1 yr → 12; ≤ 2 → 6; more → 0; above max by > 3 → 14; unknown → 14 (flagged) |
| Role alignment | 15 | Target role/family → 15; adjacent → 8; else 0 |
| Location / work mode | 10 | Match → 10; partial → 5; mismatch → 0; unknown → 6 (flagged) |
| Salary | 10 | Overlaps expectation → 10; below by ≤ 15% → 5; further → 0; undisclosed → 6 (flagged) |
**Conditions** (notice-period limit, immediate joiner, bond, shift, contract-to-hire, WFO days) are checked by code.
**Blockers:** experience > user years + 2; ≥ 2 required skills missing; notice period longer than allowed; any
user dealbreaker. **Recommendation:** APPLY ≥ 72 with no blockers · CONSIDER 55–71 or ≥ 72 with one blocker ·
LOW_PRIORITY otherwise. **Score gains:** each missing skill re-scored at proficiency 3 ("+6 with TypeScript").
**Salary context (CALC):** disclosed salaries of collected jobs with the same role family and city in the last 90 days
→ min / median / max with n; shown only when n ≥ 5.

### 12.3 What makes it professional
The report reads like a senior technical recruiter and career coach reviewing the CV against this specific role:
specific, evidence-based, honest about gaps, actionable. Every statement about the user cites CV evidence; every
statement about the job cites requirement ids or JD quotes; no generic advice ("improve your skills", "tailor your
resume") without saying exactly what and where; no invented numbers.

### 12.4 Fit Report sections
1. **Verdict** — recommendation and score (code), executive summary ≤ 80 words (AI), report confidence (description
   completeness, extraction confidence).
2. **Role decoded** — core responsibilities, product/domain, what the day-to-day likely involves, real seniority vs the
   title ("titled SDE-1 but responsibilities read mid-level"), depth expected per technology.
3. **Requirement-by-requirement assessment** — table: requirement (importance), your status (strong/partial/missing, from
   code), evidence from your CV (quoted bullet/project with its location), note. Every required requirement appears.
4. **Experience relevance** — how each past role maps to this role's responsibilities (responsibility ↔ bullet matches
   with similarity), domain and scale fit.
5. **Score breakdown and score gains** (CALC).
6. **Conditions and logistics** (CALC) — notice period, location, WFO, bond, shift, salary vs expectation, salary context.
7. **Recruiter's 30-second view** (AI inference) — what stands out, red flags with severity (missing must-haves, short
   tenures, gaps, title mismatch, over-qualification), each with evidence.
8. **ATS keyword check** (CALC) — JD keywords present / missing in the CV, including aliases.
9. **Risks and how to address them** — each gap → truthful mitigation: surface existing evidence in the CV, mention in a
   cover note, prepare for the interview, or learn (effort small/medium/large from the taxonomy).
10. **Application strategy** — apply now / tailor first / seek referral / skip (must be consistent with the code
    recommendation), what to emphasise, questions to ask the recruiter (e.g. notice buyout, WFO policy).
11. Later: historical evidence (Phase 9), company snapshot (Phase 13).
Layout: trust badges on every section (FACT, CALC, AI, EXTERNAL); print-friendly view and "Copy report".

### 12.5 How it is produced
JobExtractor (fast) → code scoring and conditions → FitAnalyst (strong tier, streamed) with requirement ids, CV evidence
catalog, score breakdown, conditions and salary context → validator (§8.4 plus: every required requirement covered;
statuses consistent with code unless a semantic match is accepted; strategy consistent with recommendation; banned
generic phrases absent; section length limits) → one repair → save. Auto-run for the top N new jobs per search; on demand
for others; cached by input hash.

### 12.6 Acceptance targets (golden set: 10 fictional CV + JD pairs with expert checklists)
Required-requirement coverage 100%; citation validity 100%; checklist hit rate ≥ 80% (items an expert reviewer would
expect, e.g. "flags the 5-year requirement against 2.5 years"); banned generic phrases 0; JobExtractor requirement recall
≥ 90% and importance accuracy ≥ 85%.

## 13. Application tracking (Phase 6)
"Mark as applied" → Application (APPLIED, appliedAt now) with resume version, source (prefilled), referral; frozen job
snapshot and Fit Report. Status transitions write events + stageReached in one transaction. REJECTED asks reason and
stage; interview stages offer to add a round. Kanban (dnd-kit, keyboard accessible, optimistic) ⇄ table; activity ageing
(idle 14+ days highlighted); detail page with timeline, rounds, follow-ups, notes. Overview: today's actions, new matches.
Later polish: contacts, follow-up templates, .ics export, weekly goal, saved views.

## 14. Market skill-gap analysis (Phase 7)
Demand per skill = weighted share of analysed jobs for target roles in the last 90 days (required 1.0, preferred 0.5,
nice-to-have 0.25) with n and an evidence sentence; gap = demand × (1 − proficiency / 5); grouped by category with
core-skill markers; learning priorities (demand × gap ÷ effort; outcome lift from Phase 10) labelled "Estimate"; curated
learning links; skills the market rarely asks for; growth chart from UserSkillHistory.

## 15. Resume versions, health check and tailoring (Phase 8)
Versions with lineage and diff; deterministic CV health check (pages, ATS-readable text, contacts, sections, bullets with
numbers, action verbs, overlong bullets, date consistency, filler words); ResumeTailor suggestions shown Current →
Suggested with accept/edit/reject → new version; never invents numbers (placeholders like `[x%]`); never adds skills the
user lacks; keyword coverage before → after; performance per version (Phase 9 data); export as Markdown/plain text.

## 16. Outcome analytics and pattern detection (Phase 9)
KPIs, funnel, rates by dimension with confidence badges, insights (what's working / not), score calibration (interview
rate by Fit score band), applications per interview, weekly cohorts, rejection reasons by stage, historical signal on
Fit Reports, CSV import with undo, demo user (§22).

## 17. AI-assisted career decisions (Phase 10)
Stats snapshot with ids → CareerAnalyst → evidence validator → Facts / Calculations / AI interpretation /
Recommendations; 30/60/90-day plan; run history with "what changed"; weekly targets; under 10 mature applications the
report focuses on CV-vs-market fit from discovered jobs and skill gaps.

## 18. Interviews
Round logging (Phase 6). Prep (Phase 11): question bank from generated and logged questions, spaced repetition,
STAR notes for behavioural questions; interview analytics (pass rate by round type, weak topics, interview → offer).

## 19. Knowledge base and RAG (Phase 12)
Documents → chunks (~600 tokens) → local embeddings (384-d) + tsvector → hybrid retrieval (RRF) → KnowledgeAnswerer with
validated citations; auto-indexes CV versions, analysed JDs, interview notes and career notes; recall@6 fixture.

## 20. Web research and assistant (Phase 13)
Company research via the web-search chain (shared quotas) with sources, cached 14 days, company snapshot on job pages. Assistant (⌘J)
with read-only tools (`get_profile`, `search_jobs`, `get_job`, `get_fit_report`, `get_application_history`,
`compute_rates`, `get_skill_gaps`, `search_knowledge_base`, `get_interview_history`, `get_company_research`), visible
tool calls, numbers only from tool results.

## 21. UI, UX and design system
**Feel:** Linear / Vercel / Raycast — calm, dense, fast; no gradients, glassmorphism, sparkles or hero sections.
**Brand:** CareerOS wordmark, SVG logo mark, favicon, Open Graph image.
**Tokens:** neutral grey scale + one accent; semantic success/warning/danger/info; radius 8 px; 4 px spacing grid; type
scale 12/13/14/16/20/24/30 (Geist or Inter); tabular numbers; 150 ms transitions honouring `prefers-reduced-motion`.
**Patterns:** page header (title, description, one primary action); breadcrumbs on detail pages; data tables (TanStack
Table); forms (react-hook-form + Zod); toasts with Undo (sonner); confirm dialogs only for destructive actions; skeletons
matching layout; empty states with one action; error states with Retry; onboarding checklist; ⌘K.
**Formatting:** Indian numbers and LPA; relative dates with exact date on hover; one colour and icon per status.
**Trust:** FACT · CALC · AI (model + time) · EXTERNAL (sources) badges; score type always labelled; n and confidence on
every rate.
**Long operations:** step-by-step progress (e.g. "Searching Adzuna ✓ · Google Jobs ✓ · Reading 14 company sites… ·
Writing Fit Reports 3/15").
**Backup services:** a quiet banner while any service runs on a backup provider, with its reset time; details in
Settings → Services (§7.3).
**Charts:** labelled axes, n in tooltips, accessible colours.
**Performance:** server components by default; paginate lists over 50 rows; LCP < 2.5 s on Overview.
**Accessibility:** WCAG 2.2 AA, keyboard drag and drop, visible focus, colour never the only signal, axe checks in
Playwright. **Responsive** to 375 px.

## 22. Demo data (Phase 9)
Separate demo user ("Explore demo"), banner, mock providers; deterministic seed with a demo CV, roles, ~150 discovered
jobs (including direct-from-company ones), ~120 applications over 6 months, 4 resume versions, ~25 rounds, 3 offers and
detectable patterns asserted by an integration test.

## 23. Security and privacy
Better Auth (httpOnly cookies); `ALLOW_SIGNUP=false` after the first account when deployed; session checks in middleware
and server actions; repository-level user scoping with cross-user tests; Zod at all boundaries; upload limits and type
sniffing; SSRF guard and robots.txt on every server fetch; secrets server-only; CSP and security headers; rate limits on
auth, AI, search and import; `npm audit` in CI; typed `AppError` with recovery actions; logs never contain CV content or
personal details; personal details never sent to search providers. Public repo: secret scanning with push protection,
`.env*` ignored, fictional fixtures only. Data export (JSON) and account deletion (Phase 14).

## 24. Error handling
AppError codes: AI_NOT_CONFIGURED, AI_TIMEOUT, AI_RATE_LIMITED, AI_INVALID_OUTPUT, SEARCH_NOT_CONFIGURED,
SEARCH_QUOTA_EXCEEDED, SEARCH_FAILED, FETCH_BLOCKED_BY_ROBOTS, URL_FETCH_BLOCKED, URL_FETCH_FAILED, PARSE_FAILED,
UNSUPPORTED_FILE, FILE_TOO_LARGE, RATE_LIMITED, VALIDATION, NOT_FOUND, FORBIDDEN, DB_ERROR — each with a recovery action.

## 25. Testing
- **Unit:** stats, scoring (relevance + Fit), conditions, stageReached/maturity, parseSalary, normalisation, dedupe,
  quotas, CV grounding/completeness checks, date maths, regex extractors, ATS URL detection, robots.txt handling,
  evidence validator, wrapUntrusted, SSRF guard, provider chains (quota exhaustion, proactive switch at 90%, 429
  cooldown, circuit breaker, all-exhausted degraded modes).
- **Integration (Postgres test DB):** user scoping, CV pipeline with mock AI on every fixture, search run with mock
  providers (dedupe, quotas, resumable batches), deep search against recorded fixtures, Fit Report validation with
  malformed outputs, status transitions.
- **E2E (Playwright, mock providers):** sign up → upload CV → review side by side → confirm → choose roles → find jobs →
  open Fit Report → mark applied → drag to Interview → log a round; axe checks on main pages.
- **Evals (local, real providers):** ResumeParser, JobExtractor, FitAnalyst, deep-search fixtures — targets in §9.4,
  §11.6, §12.6.
- **CI:** typecheck, lint, unit + integration (`pgvector/pgvector:pg16`), e2e on main, evals against mock.

## 26. Environment variables (`.env.example`)
```
# Local: Neon connection strings (main and test branches), or local Docker Postgres as below
DATABASE_URL=postgresql://careeros:careeros@localhost:5432/careeros
DATABASE_URL_TEST=postgresql://careeros:careeros@localhost:5432/careeros_test
BETTER_AUTH_SECRET=
BETTER_AUTH_URL=http://localhost:3000
ALLOW_SIGNUP=true
ENABLE_DEMO_LOGIN=true

# Each *_PROVIDERS list is an ordered chain: main first, then backups (§7.2). Providers without keys are skipped.
# Quotas are safety limits set a little below each free tier; verify current free limits when configuring.

AI_PROVIDERS=mock                   # real use: gemini,groq,openrouter   (optional: ollama | openai | anthropic)
GEMINI_API_KEY=
GEMINI_MODEL_FAST=
GEMINI_MODEL_BALANCED=
GEMINI_MODEL_STRONG=
GROQ_API_KEY=
GROQ_MODEL_FAST=
GROQ_MODEL_BALANCED=
OPENROUTER_API_KEY=
OPENROUTER_FREE_MODELS=             # comma-separated ":free" model ids, tried in order
OLLAMA_BASE_URL=
OLLAMA_MODEL=

JOB_SEARCH_PROVIDERS=mock           # real use: adzuna,jooble,serpapi
JOB_SEARCH_COUNTRY=in
ADZUNA_APP_ID=
ADZUNA_APP_KEY=
ADZUNA_MONTHLY_QUOTA=900
JOOBLE_API_KEY=
JOOBLE_DAILY_QUOTA=100
SERPAPI_API_KEY=
SERPAPI_MONTHLY_QUOTA=90            # the real remaining count is also read from SerpApi's account endpoint
SERPAPI_PRIORITY_QUERIES_PER_RUN=2
JOB_SEARCH_MAX_QUERIES_PER_RUN=8
JOB_DEEP_ANALYSIS_TOP_N=15

WEB_SEARCH_PROVIDERS=mock           # real use: tavily,exa,firecrawl   (Phase 5)
TAVILY_API_KEY=
TAVILY_MONTHLY_QUOTA=900
EXA_API_KEY=
EXA_MONTHLY_QUOTA=500
FIRECRAWL_API_KEY=
FIRECRAWL_MONTHLY_QUOTA=500
DEEP_SEARCH_ENABLED=false
DEEP_SEARCH_MAX_WEB_SEARCHES_PER_RUN=20
DEEP_SEARCH_MAX_PAGES_PER_RUN=60
CRAWLER_USER_AGENT=CareerOS/1.0 (personal job search)

EMBEDDING_PROVIDERS=mock            # real use: local,cloudflare   (same model in both)
EMBEDDING_MODEL=bge-small-en-v1.5
EMBEDDING_DIMENSIONS=384
CLOUDFLARE_ACCOUNT_ID=
CLOUDFLARE_API_TOKEN=
CLOUDFLARE_DAILY_NEURONS=9000

STORAGE_PROVIDER=database           # database | local | s3
```

## 27. Deployment
Free stack: Vercel Hobby + Neon free Postgres (pgvector) + files in Postgres; or run locally with Docker Postgres (also
enables Ollama). Public landing page at `/` with "Try the demo" (Phase 14).

## 28. Future
AI interview agent · Gmail parsing for status updates · scheduled daily search with digest · more ATS adapters (Workable,
Keka, Zoho Recruit) once public feeds are confirmed · browser extension · resume export · multi-user.
