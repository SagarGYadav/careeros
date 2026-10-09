# CareerOS

Personal career intelligence: upload your CV, get suggested roles, discover openings on job sites and company career
pages, read a recruiter-grade fit report for each job, track applications and learn from your outcomes.

> Work in progress. The full README (architecture, screenshots, deployment) arrives in Phase 14.
> Plan: [docs/SPEC.md](docs/SPEC.md) · Progress: [docs/ROADMAP.md](docs/ROADMAP.md)

## Local setup

Requirements: Node.js 22+, a PostgreSQL 16+ database with pgvector (a free [Neon](https://neon.tech) project with a
`test` branch, or `docker compose up -d`).

```bash
npm install                 # also generates the Prisma client
cp .env.example .env        # then fill in DATABASE_URL, DATABASE_URL_TEST and BETTER_AUTH_SECRET
npm run db:deploy           # apply migrations to the dev database
npm run db:test:deploy      # apply migrations to the test database
npm run db:check            # read-only connection check
npm run dev                 # http://localhost:3000
```

Checks: `npm run typecheck` · `npm run lint` · `npm run format:check`
