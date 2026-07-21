import { defineConfig, devices } from "@playwright/test";

const port = 3001;
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
  expect: {
    toHaveScreenshot: {
      animations: "disabled",
      maxDiffPixelRatio: 0.015,
    },
  },
  forbidOnly: Boolean(process.env.CI),
  fullyParallel: true,
  outputDir: "test-results",
  projects: [
    {
      name: "desktop-light",
      use: {
        ...devices["Desktop Chrome"],
        colorScheme: "light",
        reducedMotion: "no-preference",
        viewport: { height: 960, width: 1440 },
      },
    },
    {
      name: "mobile-dark",
      use: {
        ...devices["Pixel 5"],
        colorScheme: "dark",
        reducedMotion: "no-preference",
      },
    },
    {
      name: "reduced-motion",
      use: {
        ...devices["Desktop Chrome"],
        colorScheme: "light",
        reducedMotion: "reduce",
        viewport: { height: 900, width: 1280 },
      },
    },
  ],
  reporter: process.env.CI
    ? [["github"], ["html", { open: "never" }]]
    : [["line"], ["html", { open: "never" }]],
  retries: process.env.CI ? 2 : 1,
  snapshotPathTemplate: "{testDir}/__screenshots__/{testFilePath}/{projectName}/{arg}{ext}",
  testDir: "tests/e2e",
  use: {
    baseURL,
    locale: "en-US",
    screenshot: "only-on-failure",
    timezoneId: "UTC",
    trace: "retain-on-failure",
    video: "retain-on-failure",
  },
  webServer: {
    command: process.env.CI ? "pnpm --filter @tab/site start" : "pnpm --filter @tab/site dev",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    url: baseURL,
  },
  workers: process.env.CI ? 1 : undefined,
});
