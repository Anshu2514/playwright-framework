/**
 * fixtures/browserFixtures.ts
 *
 * Test-scoped fixtures controlling the browser surface every test receives.
 *
 * ── Architecture note ────────────────────────────────────────────────────────
 *  The "auto" fixtures (autoConsoleGuard, autoPerfMetrics) are added in a
 *  SECOND .extend() call.  This is required because Playwright's type system
 *  rejects `auto: true` for fixtures declared in the same call as a shadowed
 *  built-in fixture (`page` / `context`).  Splitting into two extends keeps
 *  the type checker happy without changing runtime behaviour.
 */

import { type BrowserContext } from "@playwright/test";
import { workerFixtures }  from "./workerFixtures";
import type { TestFixtures } from "./types";
import { getEnvConfig, getEnv } from "../config/env.config";

// ─────────────────────────────────────────────────────────────────────────────
// Step 1 — fixtures that shadow Playwright built-ins (page, context)
// ─────────────────────────────────────────────────────────────────────────────

const browserBaseFixtures = workerFixtures.extend<
  Pick<TestFixtures, "browserContext" | "page" | "createContext">
>({

  // ── browserContext ────────────────────────────────────────────────────────
  // Brand-new, fully-configured BrowserContext per test.  Closing it on
  // teardown clears all cookies, localStorage, and cached responses.

  browserContext: async ({ workerBrowser }, use, testInfo) => {
    const envConfig = getEnvConfig();
    const isMobile  = testInfo.project.name.toLowerCase().includes("mobile");

    const context = await workerBrowser.newContext({
      baseURL:           envConfig.baseURL,
      locale:            "en-US",
      timezoneId:        "America/Chicago",
      colorScheme:       "light",
      viewport: isMobile
        ? { width: 390,  height: 844 }
        : { width: 1280, height: 720 },
      deviceScaleFactor: isMobile ? 3 : 1,
      permissions:       ["geolocation", "clipboard-read", "clipboard-write"],
      geolocation:       { latitude: 41.8781, longitude: -87.6298 },
      ignoreHTTPSErrors: getEnv() !== "prod",
      extraHTTPHeaders: {
        "Accept-Language": "en-US,en;q=0.9",
        "X-Test-Run-Id":   testInfo.testId,
        "X-Test-File":     testInfo.file,
        "X-Test-Worker":   String(testInfo.workerIndex),
        "X-Test-Retry":    String(testInfo.retry),
      },
    });

    // ── Network observers (visible in the test output) ────────────────────
    context.on("requestfailed", (req) => {
      const reason = req.failure()?.errorText ?? "unknown failure";
      console.warn(`  ✗ [network] ${req.method()} ${req.url()} — ${reason}`);
    });

    context.on("response", (res) => {
      if (res.status() >= 400) {
        console.warn(
          `  ✗ [network] HTTP ${res.status()} ${res.request().method()} ${res.url()}`,
        );
      }
    });

    // ── Tracing — saved on failure / retry, discarded on green runs ───────
    await context.tracing.start({
      screenshots: true,
      snapshots:   true,
      sources:     true,
      title:       testInfo.title,
    });

    await use(context);

    const testFailed = testInfo.status !== testInfo.expectedStatus;
    const needsTrace = testFailed || testInfo.retry > 0;

    if (needsTrace) {
      const tracePath = testInfo.outputPath("trace.zip");
      await context.tracing.stop({ path: tracePath });
      await testInfo.attach("trace", {
        path:        tracePath,
        contentType: "application/zip",
      });
    } else {
      await context.tracing.stop();
    }

    if (testFailed) {
      try {
        const pages = context.pages();
        if (pages.length > 0) {
          const screenshotPath = testInfo.outputPath("failure.png");
          await pages[0].screenshot({ path: screenshotPath, fullPage: true });
          await testInfo.attach("failure screenshot", {
            path:        screenshotPath,
            contentType: "image/png",
          });
        }
      } catch {
        // Non-critical
      }
    }

    await context.close();
  },

  // ── page ──────────────────────────────────────────────────────────────────
  // Opened from browserContext so it inherits every setting above.
  // Shadows Playwright's built-in `page` fixture.

  page: async ({ browserContext }, use) => {
    const pg = await browserContext.newPage();

    pg.on("dialog", async (dialog) => {
      console.warn(
        `  ! [dialog] Auto-dismissing ${dialog.type()}: "${dialog.message()}"`,
      );
      await dialog.dismiss();
    });

    await use(pg);
  },

  // ── createContext (factory) ───────────────────────────────────────────────
  // Returns a factory for additional isolated contexts within a test.
  // All factory-created contexts are closed in reverse-creation order.

  createContext: async ({ workerBrowser }, use) => {
    const created: BrowserContext[] = [];
    const envConfig = getEnvConfig();

    const factory = async (
      options: Parameters<typeof workerBrowser.newContext>[0] = {},
    ): Promise<BrowserContext> => {
      const ctx = await workerBrowser.newContext({
        baseURL:           envConfig.baseURL,
        locale:            "en-US",
        ignoreHTTPSErrors: getEnv() !== "prod",
        ...options,
      });
      created.push(ctx);
      return ctx;
    };

    await use(factory);

    for (const ctx of [...created].reverse()) {
      try {
        await ctx.close();
      } catch {
        // Already closed by the test — safe to ignore
      }
    }
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// Step 2 — auto-active fixtures (must be in a separate extend() call)
// ─────────────────────────────────────────────────────────────────────────────

export const browserFixtures = browserBaseFixtures.extend<
  Pick<TestFixtures, "autoConsoleGuard" | "autoPerfMetrics">
>({

  // ── autoConsoleGuard ──────────────────────────────────────────────────────
  // Captures console.error and pageerror events.  Attaches them to the
  // test report.  Optionally fails the test when TEST_STRICT_CONSOLE=true.

  autoConsoleGuard: [
    async ({ page }, use, testInfo) => {
      const IGNORED: (string | RegExp)[] = [
        /\[HMR\]/,
        /React DevTools/,
        "[Deprecation]",
      ];

      const errors: string[] = [];
      const isIgnored = (text: string) =>
        IGNORED.some((p) => (typeof p === "string" ? text.includes(p) : p.test(text)));

      page.on("console", (msg) => {
        if (msg.type() === "error" && !isIgnored(msg.text())) {
          errors.push(`[console.error] ${msg.text()}`);
        }
      });

      page.on("pageerror", (err) => {
        if (!isIgnored(err.message)) {
          errors.push(`[pageerror] ${err.name}: ${err.message}`);
        }
      });

      await use();

      if (errors.length > 0) {
        const report = [
          `Test: ${testInfo.title}`,
          `File: ${testInfo.file}`,
          "─".repeat(60),
          ...errors,
        ].join("\n");

        await testInfo.attach("browser-console-errors.txt", {
          contentType: "text/plain",
          body:        Buffer.from(report),
        });

        if (process.env["TEST_STRICT_CONSOLE"] === "true") {
          throw new Error(
            `Test produced ${errors.length} browser error(s):\n\n${report}`,
          );
        }
      }
    },
    { auto: true },
  ],

  // ── autoPerfMetrics ───────────────────────────────────────────────────────
  // Collects Web Vitals after each test and attaches a JSON report.

  autoPerfMetrics: [
    async ({ page }, use, testInfo) => {
      await use();

      const url = page.url();
      if (!url || url === "about:blank") return;

      try {
        const metrics = await page.evaluate(() => {
          const nav = performance.getEntriesByType(
            "navigation",
          )[0] as PerformanceNavigationTiming | undefined;

          const paint = performance.getEntriesByType("paint");
          const fp  = paint.find((e) => e.name === "first-paint");
          const fcp = paint.find((e) => e.name === "first-contentful-paint");

          return {
            domContentLoaded: nav
              ? Math.round(nav.domContentLoadedEventEnd - nav.startTime)
              : null,
            load: nav
              ? Math.round(nav.loadEventEnd - nav.startTime)
              : null,
            firstPaint:           fp  ? Math.round(fp.startTime)  : null,
            firstContentfulPaint: fcp ? Math.round(fcp.startTime) : null,
          };
        });

        const report = JSON.stringify({ url, ...metrics }, null, 2);
        await testInfo.attach("performance-metrics.json", {
          contentType: "application/json",
          body:        Buffer.from(report),
        });
      } catch {
        // Perf metrics not always available — non-critical
      }
    },
    { auto: true },
  ],
});
