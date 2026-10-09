// Read-only connection check: confirms the database is reachable and pgvector is enabled.
// Prints no connection details. Run with `npm run db:check` (or `npm run db:check:test`).
import "dotenv/config";
import { db } from "../src/server/db";

async function main() {
  const [{ server_version }] = await db.$queryRaw<{ server_version: string }[]>`SHOW server_version`;
  const vector = await db.$queryRaw<{ extversion: string }[]>`
    SELECT extversion FROM pg_extension WHERE extname = 'vector'`;

  console.log(`Connected. PostgreSQL ${server_version}.`);
  console.log(
    vector.length ? `pgvector ${vector[0].extversion} enabled.` : "pgvector NOT enabled - run the migrations.",
  );
  if (!vector.length) process.exitCode = 1;
}

main()
  .catch((error: unknown) => {
    console.error("Database check failed:", error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
