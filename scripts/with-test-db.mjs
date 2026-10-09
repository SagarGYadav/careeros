// Runs a command against the test database: DATABASE_URL is replaced by DATABASE_URL_TEST.
// Usage: node scripts/with-test-db.mjs <command> [args...]
// Cross-platform replacement for `DATABASE_URL=$DATABASE_URL_TEST <command>`.
import "dotenv/config";
import { spawn } from "node:child_process";

const testUrl = process.env.DATABASE_URL_TEST;
if (!testUrl) {
  console.error("DATABASE_URL_TEST is not set in .env");
  process.exit(1);
}

const [command, ...args] = process.argv.slice(2);
if (!command) {
  console.error("Usage: node scripts/with-test-db.mjs <command> [args...]");
  process.exit(1);
}

const child = spawn(command, args, {
  stdio: "inherit",
  shell: true,
  env: { ...process.env, DATABASE_URL: testUrl },
});
child.on("exit", (code) => process.exit(code ?? 1));
