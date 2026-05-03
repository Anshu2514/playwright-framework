import { defineConfig, devices } from "@playwright/test";
import { getEnvConfig } from "./config/env.config";

const env = getEnvConfig();

export default defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  forbidOnly: !!process.env["CI"],
  retries:  process.env["CI"] ? 2 : 0,
  workers:  process.env["CI"] ? 4 : undefined,

  reporter: [
    ["list"],
    ["html", { outputFolder: "playwright-report", open: "never" }],
    ["json", { outputFile: "test-results/results.json" }],
  ],

  timeout: 30_000,
  expect:  { timeout: 8_000 },

  use: {
    baseURL:    env.baseURL,
    headless:   true,
    screenshot: "only-on-failure",
    video:      "retain-on-failure",
    trace:      "on-first-retry",

    // Keep action / navigation timeouts generous for public demo sites
    // that can be slower than a local app.
    actionTimeout:     12_000,
    navigationTimeout: 20_000,
  },

  projects: [
    {
      name: "chromium",
      use:  { ...devices["Desktop Chrome"] },
    },
    {
      name: "firefox",
      use:  { ...devices["Desktop Firefox"] },
    },
    {
      name: "webkit",
      use:  { ...devices["Desktop Safari"] },
    },
    {
      name: "mobile-chrome",
      use:  { ...devices["Pixel 5"] },
    },
    // ── API-only project — automationexercise.com ──────────────────────────
    //
    //  AutomationExercise quirks:
    //   • POST endpoints accept application/x-www-form-urlencoded only (NOT JSON).
    //   • Every response returns HTTP 200; real outcome is in body.responseCode.
    //   • Public demo can be slow / occasionally throttled — generous timeouts.
    {
      name:    "api",
      testDir: "./tests/api",
      use: {
        baseURL: "https://automationexercise.com/api",
        extraHTTPHeaders: {
          // x-www-form-urlencoded is what the AE API requires by default.
          // Tests using getRaw() override this implicitly via the form: option.
          "Content-Type": "application/x-www-form-urlencoded",
        },
        actionTimeout:     20_000,
        navigationTimeout: 25_000,
      },
    },
  ],

  outputDir: "test-results",
});
