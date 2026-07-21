import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }, testInfo) => {
  if (testInfo.project.name === "mobile-dark") {
    await page.addInitScript(() => window.localStorage.setItem("tab-site-theme", "dark"));
  }

  await page.goto("/");
  await page.evaluate(() => document.fonts.ready);
  // Let one-shot entrance motion fully settle: assertions and axe judge the
  // page's final state in every project.
  await page.waitForTimeout(2_100);
});

test("explains both payer paths without presenting illustration as money evidence", async ({
  page,
}) => {
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Invisible payments");
  await expect(page.getByText("Product illustration · no financial data").first()).toBeVisible();
  await expect(
    page.getByRole("heading", { level: 2, name: "One rail. Two payers." }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { level: 2, name: /Your agent hits a paywall/ }),
  ).toBeVisible();
  await expect(page.getByText("Test funds — not real money").first()).toBeVisible();
  await expect(page.getByRole("link", { name: "Start building" }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: "Set up an agent" }).first()).toBeVisible();
});

test("has no automatic WCAG A or AA violations", async ({ page }) => {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();

  expect(results.violations).toEqual([]);
});

test("keeps the critical product story visible without JavaScript", async ({
  browser,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-light", "One no-JavaScript pass is sufficient.");

  const context = await browser.newContext({
    javaScriptEnabled: false,
    viewport: { height: 900, width: 1160 },
  });
  const page = await context.newPage();
  await page.goto("/");

  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByRole("link", { name: "Start building" }).first()).toBeVisible();
  await expect(
    page.getByRole("heading", { level: 2, name: "One rail. Two payers." }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { level: 2, name: /Your agent hits a paywall/ }),
  ).toBeVisible();

  await context.close();
});
