// Runs once before the integration tests: applies all migrations to the test database.
import "dotenv/config";
import { execSync } from "node:child_process";

export default function setup() {
  const testUrl = process.env.DATABASE_URL_TEST;
  if (!testUrl) throw new Error("DATABASE_URL_TEST is not set.");
  execSync("npx prisma migrate deploy", {
    stdio: "ignore",
    env: { ...process.env, DATABASE_URL: testUrl },
  });
}
