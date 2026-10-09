import AxeBuilder from "@axe-core/playwright";
import { expect, type Page } from "@playwright/test";

/** Every e2e account uses this domain so global-teardown can delete them. */
export const E2E_EMAIL_DOMAIN = "@e2e.careeros.test";

/** Fails on serious or critical WCAG 2.2 A/AA violations (SPEC §21 accessibility). */
export async function expectNoSeriousA11yViolations(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  expect(
    serious.map((v) => `${v.id}: ${v.help} (${v.nodes.length} element(s))`),
    "accessibility violations",
  ).toEqual([]);
}

/** Saves a screenshot under test-results/screens (git-ignored) for visual review. */
export async function screenshot(page: Page, name: string) {
  await page.screenshot({ path: `test-results/screens/${name}.png`, fullPage: true });
}
