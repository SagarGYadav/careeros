# CareerOS — how to build it

Your guide for the build sessions. It contains no secrets, so it can live in the repo.

---

## 0. How we build

- **Main:** Claude Code on your **Pro plan**, locally, in the project folder (Claude desktop app → Code tab → Local,
  or `claude` in a terminal). Pro has a 5-hour limit and a weekly limit, shared with your normal Claude chats.
- **Optional:** cloud sessions on the same GitHub repo. Your **$100 cloud credit** is used first by cloud sessions and
  **expires 5 Nov 2026, 1:29 PM IST**. Best use: when Pro's limit stops you, continue the same step in a cloud session
  instead of waiting. After the credit is gone, cloud sessions use your Pro limits too.
- Local and cloud work on the same repo, so **always commit and push at the end of a step**.

---

## 1. One-time local setup (Windows)

Already installed: Node 22, npm, Git.

1. **Project folder** outside OneDrive, e.g. `C:\Users\sagar\Projects\careeros`.
2. **GitHub:** public repo `careeros`. Optional GitHub CLI: `winget install GitHub.cli`, then `gh auth login`.
3. **Database — Neon free (recommended, nothing to install):** create a project `careeros` (Postgres 16 or newer;
   pgvector is enabled by the first migration), then a branch named `test`. Put both connection strings in `.env`:
   `DATABASE_URL` (main branch) and `DATABASE_URL_TEST` (test branch).
   Alternative: install Docker Desktop and use `docker compose up -d` (Claude adds the compose file in step 1a).
4. **`.env`:** copy `.env.example` (created in step 1a). Keep providers on `mock` until you add keys.
5. **Free API keys, only when needed (no credit card for any of them):**

| Before step | Sign up for |
|---|---|
| 2a | Google AI Studio (Gemini), Groq, OpenRouter |
| 3b | Adzuna, Jooble, SerpApi, Cloudflare (Workers AI) |
| 5a | Tavily, Exa, Firecrawl |

Keys go only in `.env` (git-ignored), never in chat messages or commits.

---

## 2. Working within Pro limits

- **One step per session** (ROADMAP: 1a, 1b, …). Start each step in a **new session**; a fresh context uses far less
  of your allowance than a long conversation.
- **Model:** Sonnet by default. If your plan offers Opus in the model picker, use it only for the hardest steps
  (2c, 4b, 5b); it uses the allowance faster.
- **Plan first:** begin the first step of each phase in plan mode (Shift+Tab) and approve the plan before code is written.
- **When a limit warning appears:** say *"Stop here: finish the current file, run typecheck, write a 'Where I stopped'
  note in ROADMAP.md, commit and push."* Then wait for the reset, or continue in a cloud session (§5).
- Keep planning and discussion chats short and separate from build sessions.
- Check your usage bar on claude.ai (Settings → Usage).

---

## 3. First step (1a)

```
Read CLAUDE.md, then the Phase 1 section of docs/ROADMAP.md and the SPEC sections it lists.
The repo contains only the docs. The product name is CareerOS. I'm on Windows: keep npm scripts cross-platform.

Do step 1a only. First show a plan of at most 10 bullets (packages with versions, folder layout, any deviation from
SPEC with the reason) and wait for my OK. Then build it, run typecheck and lint, apply the first migration to
DATABASE_URL from .env, tick 1a in ROADMAP.md, commit, push, give the short step report, and stop.
```

---

## 4. Every other step (replace N and x)

```
Read CLAUDE.md and the Phase N section of docs/ROADMAP.md (including any "Where I stopped" note), plus the SPEC
sections it lists. Read existing code only where this step touches it.

Do step Nx only. Start with a plan of at most 8 bullets (schema changes, new dependencies), then build.
Verify with typecheck, lint and the relevant tests. If this step includes an eval with real providers, run it with
the keys in .env and report the numbers against the SPEC targets.
Tick the step in ROADMAP.md, commit, push, give the short step report, and stop.
```

For the **last step of a phase**, add:
```
This is the last step of Phase N: also run the full test suite and the acceptance flow, update What works /
Known gaps / Decisions in ROADMAP.md, give the end-of-phase report, and open a PR to main.
```

---

## 5. Continuing in a cloud session (optional)

**One-time setup** at claude.ai/code:
- Install the Claude GitHub App on the `careeros` repo.
- Cloud environment → Network access: **Trusted**.
- Setup script:
  ```bash
  #!/bin/bash
  set -e
  apt-get update -qq
  apt-get install -y -qq postgresql-16-pgvector
  ```
- Environment variables (dev-only values; cloud sessions use their own local Postgres and mock providers, so no real
  keys or Neon URLs go there):
  ```
  DATABASE_URL=postgresql://careeros:careeros@localhost:5432/careeros
  DATABASE_URL_TEST=postgresql://careeros:careeros@localhost:5432/careeros_test
  BETTER_AUTH_SECRET=dev-only-not-a-secret-0000000000000000
  BETTER_AUTH_URL=http://localhost:3000
  AI_PROVIDERS=mock
  JOB_SEARCH_PROVIDERS=mock
  WEB_SEARCH_PROVIDERS=mock
  EMBEDDING_PROVIDERS=mock
  DEEP_SEARCH_ENABLED=false
  STORAGE_PROVIDER=database
  ```

**Prompt to continue a step in the cloud:**
```
Run `bash scripts/cloud-db.sh` first. Then follow this: Read CLAUDE.md and the Phase N section of docs/ROADMAP.md,
including the "Where I stopped" note, and continue step Nx. Use mock providers; skip real-provider evals and list
them as pending. Tick, commit, push, report, and stop.
```
Real-provider evals (2e, 4d, 5c) are run locally afterwards.

---

## 6. Follow-up prompts

**Bug:**
```
<paste the exact error, or describe what happened and what you expected>
Find the root cause, fix it, add a test that would have caught it, run the relevant tests, and report.
```

**Review before merging a phase:**
```
Review the diff of this branch against main for correctness, user scoping (every query by userId), Zod validation at
boundaries, and any UI that looks functional but isn't. List findings; don't change code yet.
```

**Explain for learning (use sparingly):**
```
Explain how <feature> flows from the UI through the server action, service, repository and AI workflow.
Reference files and line numbers. Keep it under 300 words.
```

---

## 7. Progress log

| Step | Local / cloud | Sessions | Notes |
|---|---|---|---|
| 1a | | | |
| 1b | | | |
| 1c | | | |
| 1d | | | |
