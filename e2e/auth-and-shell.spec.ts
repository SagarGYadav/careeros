import { expect, test } from "@playwright/test";
import { E2E_EMAIL_DOMAIN, expectNoSeriousA11yViolations, screenshot } from "./helpers";

// One throwaway account for this run, created through the sign-up form and deleted by global-teardown.
const user = {
  name: "Priya Test",
  email: `user-${Date.now()}${E2E_EMAIL_DOMAIN}`,
  password: "e2e-password-1234",
};

test.describe.configure({ mode: "serial" });

test("signed-out visitors are sent to sign-in", async ({ page }) => {
  await page.goto("/overview");
  await expect(page).toHaveURL(/\/sign-in\?next=%2Foverview$/);
  await expect(page.getByRole("heading", { level: 1, name: "Sign in" })).toBeVisible();
  await expectNoSeriousA11yViolations(page);
  await screenshot(page, "sign-in");
});

test("sign-in form validates before calling the server", async ({ page }) => {
  await page.goto("/sign-in");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText("Enter a valid email address")).toBeVisible();
  await expect(page.getByText("Enter your password")).toBeVisible();
});

test("a new user can sign up and lands on the overview", async ({ page }) => {
  await page.goto("/sign-up");
  await expectNoSeriousA11yViolations(page);
  await page.getByLabel("Name").fill(user.name);
  await page.getByLabel("Email").fill(user.email);
  await page.getByLabel("Password", { exact: true }).fill(user.password);
  await page.getByLabel("Confirm password").fill(user.password);
  await page.getByRole("button", { name: "Create account" }).click();

  await expect(page).toHaveURL(/\/overview$/);
  await expect(page.getByRole("heading", { name: "Welcome, Priya" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Settings" })).toBeVisible();
  await expectNoSeriousA11yViolations(page);
  await screenshot(page, "overview");
});

// Signed-in tests reuse one saved session instead of signing in for each test: the app rate-limits sign-ins
// (10 per minute), and repeated runs would otherwise trip it.
const AUTH_FILE = "test-results/.auth/e2e-user.json";

test("an existing user can sign in", async ({ page }) => {
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(user.email);
  await page.getByLabel("Password").fill(user.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/overview$/);
  await page.context().storageState({ path: AUTH_FILE });
});

test.describe("signed in", () => {
  test.use({ storageState: AUTH_FILE });

  test.beforeEach(async ({ page }) => {
    await page.goto("/overview");
    await expect(page.getByRole("heading", { level: 1, name: "Overview" })).toBeVisible();
  });

  test("the command palette navigates with the keyboard", async ({ page }) => {
    await page.keyboard.press("Control+k");
    await page.getByPlaceholder("Type a command or search…").fill("settings");
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/settings$/);
    await expect(page.getByText(user.email).first()).toBeVisible();
  });

  test("settings switches the theme and passes accessibility checks in both themes", async ({ page }) => {
    await page.goto("/settings");
    await page.getByRole("radio", { name: "Light" }).click();
    await expect(page.locator("html")).toHaveClass(/light/);
    await expectNoSeriousA11yViolations(page);
    await screenshot(page, "settings-light");

    await page.getByRole("radio", { name: "Dark" }).click();
    await expect(page.locator("html")).toHaveClass(/dark/);
    await expectNoSeriousA11yViolations(page);
    await screenshot(page, "settings-dark");
  });

  test("unknown pages show the not-found page", async ({ page }) => {
    const response = await page.goto("/this-page-does-not-exist");
    expect(response?.status()).toBe(404);
    await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
  });

  test("settings shows the AI provider chain and the mock AI badge", async ({ page }) => {
    // The e2e server runs with AI_PROVIDERS=mock, so the UI must say answers are samples (CLAUDE.md rule 3).
    await expect(page.getByRole("link", { name: /Mock AI/ })).toBeVisible();
    await page.goto("/settings");
    await page.getByRole("button", { name: "Manage services" }).click();
    await expect(page).toHaveURL(/\/settings\/services$/);
    await expect(page.getByRole("heading", { level: 1, name: "Services" })).toBeVisible();
    await expect(page.getByText("Mock AI (sample answers)", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Test" }).first().click();
    await expect(page.getByText(/Connected/)).toBeVisible();
    await expectNoSeriousA11yViolations(page);
    await screenshot(page, "services");
  });

  test("signing out ends the session", async ({ page }) => {
    await page.goto("/settings");
    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/sign-in$/);
    await page.goto("/overview");
    await expect(page).toHaveURL(/\/sign-in\?next=%2Foverview$/);
  });
});

test("a wrong password shows a clear error", async ({ page }) => {
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(user.email);
  await page.getByLabel("Password").fill("not-the-password-1");
  await page.getByRole("button", { name: "Sign in" }).click();
  // Filter by text: Next.js also renders an empty role="alert" route announcer.
  await expect(page.getByRole("alert").filter({ hasText: "don't match an account" })).toBeVisible();
});
