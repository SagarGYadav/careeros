import "dotenv/config";
import { defineConfig, devices } from "@playwright/test";

// End-to-end tests run a production build on port 3100 against the TEST database, so they never touch dev data.
const PORT = 3100;
const baseURL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./e2e",
  // One worker: tests share the test database and the auth rate limits.
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : [["list"]],
  // Sign-up hashes the password and round-trips to a remote (Neon) database, so allow more than the 5s default.
  expect: { timeout: 15_000 },
  use: { baseURL, trace: "retain-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  globalTeardown: "./e2e/global-teardown.ts",
  webServer: {
    command: `npm run build && npm run start -- -p ${PORT}`,
    url: `${baseURL}/sign-in`,
    reuseExistingServer: !process.env.CI,
    timeout: 300_000,
    env: {
      DATABASE_URL: process.env.DATABASE_URL_TEST ?? "",
      BETTER_AUTH_URL: baseURL,
    },
  },
});
