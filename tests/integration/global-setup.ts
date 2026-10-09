// Runs once before the integration tests: applies all migrations to the test database and seeds the skill and
// role catalogue when it is empty (a fresh CI database).
import "dotenv/config";
import { execSync } from "node:child_process";
import pg from "pg";
import { withStrictSsl } from "../../src/server/db-url";

export default async function setup() {
  const testUrl = process.env.DATABASE_URL_TEST;
  if (!testUrl) throw new Error("DATABASE_URL_TEST is not set.");
  const env = { ...process.env, DATABASE_URL: testUrl };
  execSync("npx prisma migrate deploy", { stdio: "ignore", env });

  const client = new pg.Client({ connectionString: withStrictSsl(testUrl) });
  await client.connect();
  try {
    const { rows } = await client.query<{ n: number }>("SELECT count(*)::int AS n FROM skills");
    if (rows[0].n === 0) execSync("npx tsx --conditions=react-server prisma/seed/index.ts", { stdio: "ignore", env });
  } finally {
    await client.end();
  }
}
