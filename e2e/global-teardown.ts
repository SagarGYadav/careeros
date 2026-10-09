// Removes the throwaway accounts created by the e2e tests from the test database.
import "dotenv/config";
import pg from "pg";
import { withStrictSsl } from "../src/server/db-url";
import { E2E_EMAIL_DOMAIN } from "./helpers";

export default async function globalTeardown() {
  const url = process.env.DATABASE_URL_TEST;
  if (!url) return;
  const client = new pg.Client({ connectionString: withStrictSsl(url) });
  await client.connect();
  try {
    await client.query(`DELETE FROM users WHERE email LIKE $1`, [`%${E2E_EMAIL_DOMAIN}`]);
  } finally {
    await client.end();
  }
}
