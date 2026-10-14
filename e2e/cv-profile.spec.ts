// CV upload → review → confirm → profile, with the mock AI (SPEC §9, Phase 2 acceptance).
import { expect, test } from "@playwright/test";
import { CV_FIXTURES } from "../fixtures/cv/personas";
import { E2E_EMAIL_DOMAIN, expectNoSeriousA11yViolations, screenshot } from "./helpers";

const user = { name: "Rohan Test", email: `cv-${Date.now()}${E2E_EMAIL_DOMAIN}`, password: "e2e-password-1234" };
const AUTH_FILE = "test-results/.auth/cv-user.json";

test.describe.configure({ mode: "serial" });

test("set up a signed-in user", async ({ page }) => {
  await page.goto("/sign-up");
  await page.getByLabel("Name").fill(user.name);
  await page.getByLabel("Email").fill(user.email);
  await page.getByLabel("Password", { exact: true }).fill(user.password);
  await page.getByLabel("Confirm password").fill(user.password);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/overview$/);
  await page.context().storageState({ path: AUTH_FILE });
});

test.describe("signed in", () => {
  test.use({ storageState: AUTH_FILE });

  // The acceptance flow must run without browser console errors (CLAUDE.md, end of phase).
  let consoleErrors: string[] = [];
  test.beforeEach(({ page }) => {
    consoleErrors = [];
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });
    page.on("pageerror", (error) => consoleErrors.push(error.message));
  });
  test.afterEach(() => {
    // The upload test with a non-PDF file expects a failed request; the browser logs those as errors.
    const unexpected = consoleErrors.filter((e) => !/Failed to load resource/.test(e));
    expect(unexpected, "browser console errors").toEqual([]);
  });

  test("an empty profile starts with the CV upload", async ({ page }) => {
    await page.goto("/overview");
    await page.getByRole("link", { name: "Career profile" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Career profile" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Upload your CV" })).toBeVisible();
    await expectNoSeriousA11yViolations(page);
    await screenshot(page, "profile-empty");
  });

  test("the profile sections ask for a CV first, and the upload rejects other files", async ({ page }) => {
    await page.goto("/profile/experience");
    await expect(page.getByRole("heading", { name: "Start with your CV" })).toBeVisible();

    await page.goto("/profile/upload");
    await page.getByLabel("CV file").setInputFiles({
      name: "notes.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("this is not a pdf"),
    });
    await expect(page.getByRole("alert").filter({ hasText: "isn't supported" })).toBeVisible();
  });

  for (const cv of CV_FIXTURES) {
    test(`uploads and reviews ${cv.id}`, async ({ page }) => {
      await page.goto("/profile/upload");
      await page.getByLabel("CV file").setInputFiles(`fixtures/cv/${cv.id}.${cv.format}`);
      await expect(page).toHaveURL(/\/profile\/cv\/[\w-]+$/, { timeout: 60_000 });
      await expect(page.getByRole("heading", { level: 1, name: "Review your CV" })).toBeVisible();
      // Rule 3: answers from the mock provider are labelled as such.
      await expect(page.getByText("Mock AI", { exact: true }).first()).toBeVisible();
      await expect(page.getByLabel("Full name")).toHaveValue(cv.personal.fullName);
      await expect(page.getByLabel("Email")).toHaveValue(cv.personal.email);
      await expect(page.getByLabel("Company").first()).toHaveValue(cv.experience[0].company);
      await expect(page.getByLabel("Job title").first()).toHaveValue(cv.experience[0].title);
      if (cv.format === "pdf") {
        // The original is drawn with pdf.js next to the form.
        await expect(page.getByRole("img", { name: "Page 1 of your CV" })).toBeVisible({ timeout: 30_000 });
      }
      await screenshot(page, `review-${cv.id}`);
    });
  }

  test("selecting a field highlights its source, and confirming builds the profile", async ({ page }) => {
    await page.goto("/profile");
    const review = page.getByRole("link", { name: "Review" }).first();
    await expect(review).toBeVisible();
    // Versions are listed newest first; open the two-column CV (Rohan).
    const row = page.getByRole("listitem").filter({ hasText: "rohan-two-column" });
    await row.getByRole("link", { name: "Review" }).click();
    await expect(page.getByLabel("Full name")).toHaveValue("Rohan Mehta");

    await page.getByLabel("Job title").first().focus();
    await expect(page.getByText("Highlighted: where the selected field comes from")).toBeVisible();
    await page.getByRole("tab", { name: "Text read" }).click();
    await expect(page.locator("p.bg-brand\\/15").first()).toContainText("Senior Software Engineer");
    await expectNoSeriousA11yViolations(page);

    await page.getByRole("button", { name: "Confirm and save to profile" }).click();
    await expect(page).toHaveURL(/\/profile$/);
    await expect(page.getByRole("heading", { name: "Rohan Mehta" })).toBeVisible();
    await expect(page.getByText("2 roles")).toBeVisible();
    await expect(page.getByText("In use")).toBeVisible();
    await expectNoSeriousA11yViolations(page);
    await screenshot(page, "profile-overview");
  });

  test("experience can be edited and keeps its changes", async ({ page }) => {
    await page.goto("/profile/experience");
    const firstBullet = page.getByLabel("Bullets 1", { exact: true }).first();
    await expect(firstBullet).toHaveValue(/Led a team of 3 engineers/);
    await firstBullet.fill(
      "Led a team of 3 engineers to build a B2B ordering platform in Next.js and Node.js (edited).",
    );
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByText("Experience saved.")).toBeVisible();
    await page.reload();
    await expect(page.getByLabel("Bullets 1", { exact: true }).first()).toHaveValue(/\(edited\)\.$/);
    await expectNoSeriousA11yViolations(page);
    await screenshot(page, "profile-experience");
  });

  test("skills show suggested levels that can be changed and confirmed", async ({ page }) => {
    await page.goto("/profile/skills");
    await expect(page.getByRole("cell", { name: /React/ }).first()).toBeVisible();
    await expect(page.getByText("Suggested").first()).toBeVisible();
    await page.getByLabel("Proficiency in PostgreSQL").selectOption("4");
    await page.getByRole("button", { name: /Confirm \d+ suggested/ }).click();
    await expect(page.getByText("Suggested levels confirmed.")).toBeVisible();
    await page.reload();
    await expect(page.getByLabel("Proficiency in PostgreSQL")).toHaveValue("4");
    await expect(page.getByText("Suggested", { exact: true })).toHaveCount(0);
    await expectNoSeriousA11yViolations(page);
    await screenshot(page, "profile-skills");
  });

  test("preferences are saved", async ({ page }) => {
    await page.goto("/profile/preferences");
    await page.getByLabel("Preferred locations").fill("Pune");
    await page.getByLabel("Preferred locations").press("Enter");
    await page.getByLabel("Remote").check();
    await page.getByLabel("Current CTC (LPA)").fill("18");
    await page.getByLabel("Notice period (days)").fill("30");
    await page.getByLabel("Night or rotational shifts").check();
    await page.getByRole("button", { name: "Save preferences" }).click();
    await expect(page.getByText("Preferences saved.")).toBeVisible();
    await page.reload();
    await expect(page.getByText("Pune", { exact: true })).toBeVisible();
    await expect(page.getByLabel("Remote")).toBeChecked();
    await expect(page.getByLabel("Current CTC (LPA)")).toHaveValue("18");
    await expectNoSeriousA11yViolations(page);
    await screenshot(page, "profile-preferences");
  });

  test("memory facts can be added and archived", async ({ page }) => {
    await page.goto("/profile/memory");
    await expect(page.getByRole("heading", { name: "No facts yet" })).toBeVisible();
    await page.getByLabel("Fact").fill("I prefer product companies over services.");
    await page.getByRole("button", { name: "Add fact" }).click();
    await expect(page.getByText("I prefer product companies over services.")).toBeVisible();
    await page.getByRole("button", { name: "Archive fact" }).click();
    await expect(page.getByText("Archived", { exact: true })).toBeVisible();
    await expectNoSeriousA11yViolations(page);
    await screenshot(page, "profile-memory");
  });

  test("details and education pages load the confirmed data", async ({ page }) => {
    await page.goto("/profile/details");
    await expect(page.getByLabel("Full name")).toHaveValue("Rohan Mehta");
    await expect(page.getByLabel("Heading").first()).toHaveValue("AWARDS");
    await expectNoSeriousA11yViolations(page);
    await page.goto("/profile/education");
    await expect(page.getByLabel("Institution")).toHaveValue("College of Engineering, Pune");
    await expect(page.getByLabel("Name").first()).toHaveValue("AWS Certified Developer – Associate");
    await expectNoSeriousA11yViolations(page);
    await screenshot(page, "profile-education");
  });

  test("target roles are suggested from the CV, selected and edited", async ({ page }) => {
    await page.goto("/overview");
    await page.getByRole("link", { name: "Target roles" }).click();
    await expect(page.getByRole("heading", { name: "No target roles yet" })).toBeVisible();
    await page.getByRole("button", { name: "Suggest roles" }).click();
    await expect(page.getByText(/roles suggested \(mock AI\)/)).toBeVisible();
    await expect(page.getByRole("heading", { level: 2, name: /^Core/ })).toBeVisible();
    const fullStack = page.getByRole("checkbox", { name: "Use Full Stack Developer in job search" });
    await expect(fullStack).toBeVisible();
    await expect(page.getByText(/\d+ of \d+ roles selected for job search/)).toBeVisible();

    await page.getByLabel("Job title to add").fill("Platform Engineer");
    await page.getByRole("button", { name: "Add role" }).click();
    await expect(page.getByRole("heading", { level: 3, name: "Platform Engineer" })).toBeVisible();
    await expect(page.getByRole("checkbox", { name: "Use Platform Engineer in job search" })).toBeChecked();

    await page.getByRole("button", { name: "Remove role Platform Engineer" }).click();
    await expect(page.getByRole("heading", { level: 3, name: "Platform Engineer" })).toHaveCount(0);
    await page.getByRole("button", { name: "Undo" }).click();
    await expect(page.getByRole("heading", { level: 3, name: "Platform Engineer" })).toBeVisible();
    await expectNoSeriousA11yViolations(page);
    await screenshot(page, "target-roles");
  });

  test("find jobs runs a search with progress and shows ranked matches with reasons", async ({ page }) => {
    // A run makes many round trips to the remote test database.
    test.setTimeout(180_000);
    await page.goto("/jobs/roles");
    await page.getByRole("button", { name: "Find jobs" }).click();
    await expect(page.getByText("Search job sites")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Best matches from your last search" })).toBeVisible({
      timeout: 120_000,
    });
    const firstMatch = page
      .getByRole("heading", { name: "Best matches from your last search" })
      .locator("xpath=../..")
      .getByRole("listitem")
      .first();
    await expect(firstMatch).toBeVisible();
    await firstMatch.getByText("Relevance").click();
    await expect(firstMatch.getByText("How the score adds up")).toBeVisible();
    await expect(firstMatch.getByText("Skills", { exact: true })).toBeVisible();
    await expectNoSeriousA11yViolations(page);
    await screenshot(page, "find-jobs");
  });

  test("the For you feed ranks jobs, hides the rest with counts and learns from dismissals", async ({ page }) => {
    // Dismissing for a reason that tunes ranking re-scores every job against the remote test database.
    test.setTimeout(180_000);
    await page.goto("/jobs/roles");
    await expect(page.getByText(/openings? found in 30 days/).first()).toBeVisible();

    await page.goto("/jobs");
    await expect(page.getByRole("heading", { level: 1, name: "For you" })).toBeVisible();
    const groups = page.getByRole("navigation", { name: "Job groups" });
    await expect(groups.getByRole("link", { name: /^For you \d+$/ })).toHaveAttribute("aria-current", "page");
    await expect(groups.getByRole("link", { name: "Dismissed 0" })).toBeVisible();

    const selectBoxes = page.getByRole("checkbox", { name: /^Select .+ at / });
    await expect(selectBoxes.first()).toBeVisible();
    const firstName = ((await selectBoxes.first().getAttribute("aria-label")) ?? "").replace(/^Select /, "");
    await page.getByRole("button", { name: `Dismiss ${firstName}` }).click();
    await page.getByRole("menuitem", { name: "Too senior" }).click();
    await expect(page.getByText("Dismissed 1 job (too senior).")).toBeVisible({ timeout: 60_000 });
    await expect(page.getByRole("checkbox", { name: `Select ${firstName}` })).toHaveCount(0);
    await expect(groups.getByRole("link", { name: "Dismissed 1" })).toBeVisible();
    await page.getByRole("button", { name: "Undo" }).click();
    await expect(page.getByRole("checkbox", { name: `Select ${firstName}` })).toBeVisible({ timeout: 60_000 });
    await expect(groups.getByRole("link", { name: "Dismissed 0" })).toBeVisible();

    // Bulk save.
    await selectBoxes.nth(0).check();
    await selectBoxes.nth(1).check();
    await expect(page.getByText("2 selected")).toBeVisible();
    await page.getByRole("button", { name: "Save selected" }).click();
    await expect(page.getByText("Saved 2 jobs.")).toBeVisible();
    await expect(groups.getByRole("link", { name: "Saved 2" })).toBeVisible();

    // Filters live in the URL.
    await page.getByLabel("Work mode").selectOption("remote");
    await expect(page).toHaveURL(/[?&]mode=remote/);
    await page.getByRole("button", { name: "Clear filters" }).click();
    await expect(page).toHaveURL(/\/jobs$/);

    // A hidden group opens with its own count.
    await groups.getByRole("link", { name: /^Not a fit \d+$/ }).click();
    await expect(page).toHaveURL(/group=not_fit/);
    await expect(groups.getByRole("link", { name: /^Not a fit \d+$/ })).toHaveAttribute("aria-current", "page");
    await expectNoSeriousA11yViolations(page);
    await screenshot(page, "for-you-not-fit");

    await page.goto("/jobs");
    await expect(selectBoxes.first()).toBeVisible();
    await expectNoSeriousA11yViolations(page);
    await screenshot(page, "for-you");

    // With a CV, preferences, roles, a search and the feed seen, onboarding is complete.
    await page.goto("/overview");
    await expect(page.getByText("You're set up.", { exact: false })).toBeVisible();
  });
  test("scoring settings are validated, saved as a version and can be reset", async ({ page }) => {
    await page.goto("/settings");
    await page.getByRole("link", { name: "Scoring settings" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Scoring" })).toBeVisible();
    await expect(page.getByText("Using the default settings.")).toBeVisible();

    await page.getByLabel("Skills", { exact: true }).fill("40");
    await expect(page.getByText("Total: 95 of 100")).toBeVisible();
    await page.getByRole("button", { name: "Save settings" }).click();
    await expect(page.getByText("The parts must add up to 100.")).toBeVisible();

    await page.getByLabel("Experience", { exact: true }).fill("25");
    await expect(page.getByText("Total: 100 of 100")).toBeVisible();
    await page.getByRole("button", { name: "Save settings" }).click();
    await expect(page.getByText("Scoring settings saved (version 1). New analyses use them.")).toBeVisible();
    await expect(page.getByText(/Using your settings, version 1\./)).toBeVisible();
    await expectNoSeriousA11yViolations(page);
    await screenshot(page, "settings-scoring");

    await page.getByRole("button", { name: "Reset to defaults" }).click();
    await expect(page.getByText("Using the default settings.")).toBeVisible();
    await expect(page.getByLabel("Skills", { exact: true })).toHaveValue("45");
  });
  test("a job added by paste gets a Fit Report with every section, and the feed shows Fit scores", async ({
    page,
    context,
  }) => {
    test.setTimeout(180_000);
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    // The search earlier wrote automatic reports for its top matches.
    await page.goto("/jobs");
    await expect(page.getByRole("link", { name: /^Fit \d+/ }).first()).toBeVisible();

    await page.getByRole("link", { name: "Add job", exact: true }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Add job" })).toBeVisible();
    await page.getByLabel("Job page link").fill("https://www.linkedin.com/jobs/view/1");
    await page.getByRole("button", { name: "Read job" }).click();
    await expect(page.getByText(/doesn't read LinkedIn or Naukri/)).toBeVisible();

    await page.getByLabel("Job title", { exact: true }).fill("Frontend Platform Engineer");
    await page.getByLabel("Company", { exact: true }).fill("Lumen Ledger");
    await page.getByLabel("Location", { exact: true }).fill("Bengaluru");
    await page
      .getByLabel("Job description", { exact: true })
      .fill(
        [
          "What you'll do:",
          "- Build the merchant dashboard in React and Next.js",
          "- Own performance and accessibility of the checkout flow",
          "Requirements:",
          "- 3+ years of frontend experience",
          "- Strong TypeScript and React",
          "- Experience with REST APIs and GraphQL",
          "- Bachelor's degree in Computer Science or equivalent",
          "Good to have:",
          "- Playwright",
        ].join("\n"),
      );
    await page.getByRole("button", { name: "Save job" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Frontend Platform Engineer" })).toBeVisible();

    await page.getByRole("button", { name: "Analyse fit" }).click();
    await expect(page.getByRole("heading", { name: /^Verdict/ })).toBeVisible({ timeout: 120_000 });
    for (const section of [
      /^Role decoded/,
      /^Requirement by requirement/,
      /^Experience relevance/,
      /^Score breakdown and gains/,
      /^Conditions and logistics/,
      /^Recruiter's 30-second view/,
      /^ATS keyword check/,
      /^Risks and how to address them/,
      /^Application strategy/,
    ]) {
      await expect(page.getByRole("heading", { level: 2, name: section })).toBeVisible();
    }
    await expect(page.getByText("/ 100 Fit score")).toBeVisible();
    await page.getByRole("button", { name: "Copy report" }).click();
    await expect(page.getByText("Report copied.")).toBeVisible();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toContain(
      "Fit Report: Frontend Platform Engineer",
    );
    await expectNoSeriousA11yViolations(page);
    await screenshot(page, "fit-report");
  });
  test("company sites are discovered by web search and kept with a watchlist", async ({ page }) => {
    // Up to 20 searches, each recording provider usage in the remote test database.
    test.setTimeout(120_000);
    await page.goto("/jobs/company-sites");
    await expect(page.getByRole("heading", { level: 1, name: "Company sites" })).toBeVisible();
    await expect(page.getByText("No company sites yet")).toBeVisible();

    await page.getByLabel("Company name or careers page link").fill("https://www.linkedin.com/company/x");
    await page.getByRole("button", { name: "Add to watchlist" }).click();
    await expect(page.getByText(/doesn't read LinkedIn or Naukri/)).toBeVisible();
    await page.getByLabel("Company name or careers page link").fill("Tamarind Commerce");
    await page.getByRole("button", { name: "Add to watchlist" }).click();
    await expect(page.getByText("Looking for it")).toBeVisible();

    await page.getByRole("button", { name: "Discover company sites" }).click();
    await expect(page.getByText(/new sites? from \d+ web searches?/)).toBeVisible({ timeout: 100_000 });
    await expect(page.getByRole("cell", { name: /Kestrelpay|Kestrel/ }).first()).toBeVisible();
    await expect(page.getByText("Greenhouse").first()).toBeVisible();
    await expect(page.getByText("Looking for it")).toHaveCount(0);
    await expectNoSeriousA11yViolations(page);
    await screenshot(page, "company-sites");
  });
});
