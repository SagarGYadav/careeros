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
});
