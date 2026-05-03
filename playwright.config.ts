/**
 * playwright.config.ts
 *
 * ── Enhancements summary ─────────────────────────────────────────────────────
 *
 *  Retries           Configurable per-project (e.g. API tests get more retries
 *                    because the public demo is throttled) and via env var
 *                    PW_RETRIES for ad-hoc overrides.
 *
 *  Parallelism       fullyParallel + 4 workers on CI / unlimited locally.
 *                    Override with PW_WORKERS env var when needed.
 *
 *  Environments      Reads dev / staging / prod from config/env.config.ts via
 *                    TEST_ENV.  baseURL inherited per environment.
 *
 *  Reporters         list (console) + html (browseable) + json (machine-readable)
 *                    + junit (CI tools like Jenkins / GitLab) + github (inline
 *                    annotations on PRs when running in GitHub Actions).
 */

import { defineConfig, devices } from "@playwright/test";
import { getEnvConfig, getEnv } from "./config/env.config";

const env = getEnvConfig();

// ── Tunable knobs via environment variables ───────────────────────────────────
//
// PW_RETRIES   override default retry count       (default: 2 on CI, 0 locally)
// PW_WORKERS   override default worker count      (default: 4 on CI, undefined locally)
// PW_HEADED    set to "true" to run with browser  (default: headless)

const retries =
  process.env["PW_RETRIES"] !== undefined
    ? parseInt(process.env["PW_RETRIES"], 10)
    : process.env["CI"]
      ? 2
      : 0;

const workers =
  process.env["PW_WORKERS"] !== undefined
    ? parseInt(process.env["PW_WORKERS"], 10)
    : process.env["CI"]
      ? 4
      : undefined;

const isCI       = !!process.env["CI"];
const isGhAction = !!process.env["GITHUB_ACTIONS"];

export default defineConfig({
  testDir: "./tests",

  // ── Parallel execution ──────────────────────────────────────────────────────
  // fullyParallel: every test in every file runs in its own browser context,
  // ignoring file boundaries.  Tests that need to run sequentially mark
  // themselves with test.describe.configure({ mode: "serial" }).
  fullyParallel: true,

  // forbidOnly: prevent accidentally-merged `test.only(...)` from passing CI.
  forbidOnly: isCI,

  // Global retry default (overridden per-project below where needed)
  retries,
  workers,

  // ── Reporters ───────────────────────────────────────────────────────────────
  //
  //  list    Always-on console reporter — concise per-test ✓/✗.
  //  html    Browseable report at ./playwright-report/index.html.
  //  json    Machine-readable JSON dump for custom tooling.
  //  junit   Junit XML for CI integrations (Jenkins, GitLab, Azure DevOps).
  //  github  Inline ::error:: annotations on PR diff (GitHub Actions only).
  //
  reporter: [
    ["list"],
    ["html",  { outputFolder: "playwright-report", open: "never" }],
    ["json",  { outputFile:   "test-results/results.json" }],
    ["junit", { outputFile:   "test-results/junit.xml" }],
    // Add the GitHub annotations reporter only when actually running on GHA
    ...(isGhAction ? [["github"] as const] : []),
  ],

  // ── Global timeouts ─────────────────────────────────────────────────────────
  timeout: 30_000,
  expect:  { timeout: 8_000 },

  // ── Default test options ────────────────────────────────────────────────────
  use: {
    baseURL:    env.baseURL,
    headless:   process.env["PW_HEADED"] !== "true",
    screenshot: "only-on-failure",
    video:      "retain-on-failure",
    // `on-first-retry` only writes a trace when a test is being retried —
    // gives full debugging detail on flaky tests without bloating green runs.
    trace:      "on-first-retry",

    actionTimeout:     12_000,
    navigationTimeout: 20_000,
  },

  // ── Projects ────────────────────────────────────────────────────────────────
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
    // ── API project — automationexercise.com ──────────────────────────────
    //
    //  Quirks:
    //   • POST endpoints accept application/x-www-form-urlencoded only.
    //   • Every response returns HTTP 200; real outcome is in body.responseCode.
    //   • Public demo throttles aggressively — gets 1 extra retry over the
    //     project default to absorb sporadic 502 / connection-reset errors.
    {
      name:    "api",
      testDir: "./tests/api",
      retries: retries + 1,             // ← extra retry for unreliable public API
      use: {
        baseURL: "https://automationexercise.com/api",
        extraHTTPHeaders: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        actionTimeout:     20_000,
        navigationTimeout: 25_000,
      },
    },
  ],

  outputDir: "test-results",

  // Print run metadata at the start of every test run for traceability.
  // Visible in the list reporter, the HTML report, and the JUnit XML.
  metadata: {
    environment: getEnv(),
    baseURL:     env.baseURL,
    apiBaseURL:  env.apiBaseURL,
    ci:          isCI,
  },
});
