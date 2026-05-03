/**
 * fixtures/apiFixtures.ts
 *
 * API-layer fixtures for tests that interact with the backend directly —
 * either to set up test data faster than the UI, or to test the API itself.
 *
 * ── Fixture catalogue ─────────────────────────────────────────────────────────
 *
 *  apiClient        ApiClient authenticated as the standard test user.
 *                   Fresh client + fresh session per test.
 *
 *  adminApiClient   ApiClient authenticated as the admin user.
 *                   Keep separate to avoid accidental privilege escalation.
 *
 *  apiTeardown      Register cleanup callbacks that run after the test,
 *                   whether it passes or fails.  LIFO execution order.
 *
 * ── Canonical usage pattern ───────────────────────────────────────────────────
 *
 *  test("creating a product via API is reflected in the UI", async ({
 *    fastAuthHome,
 *    apiClient,
 *    apiTeardown,
 *  }) => {
 *    // Create a product via the API (faster than driving the admin UI)
 *    const product = await apiClient.post<Product>("/api/products", {
 *      name: "Test Widget",
 *      price: 9.99,
 *    });
 *
 *    // Register teardown IMMEDIATELY after creation so even a test failure
 *    // won't leave orphaned data in the environment.
 *    apiTeardown(async () => apiClient.delete(`/api/products/${product.id}`));
 *
 *    // Now assert the product appears in the UI
 *    await fastAuthHome.searchFor("Test Widget");
 *    await fastAuthHome.assertProductVisible("Test Widget");
 *  });
 *
 * ── Composition chain ─────────────────────────────────────────────────────────
 *
 *  workerFixtures → browserFixtures → pageFixtures → apiFixtures ◄── this file
 *                                                         ▼
 *                                                   export { test }  (index.ts)
 */

import { pageFixtures } from "./pageFixtures";
import type { TestFixtures } from "./types";
import { ApiClient }   from "../utils/apiClient";
import { getEnvConfig } from "../config/env.config";

// Local extension type — apiTeardown is not in TestFixtures because it is only
// meaningful when apiClient is also requested; keeping it here avoids widening
// the shared type unnecessarily.
type ApiLayer = Pick<TestFixtures, "apiClient"> & {
  adminApiClient: TestFixtures["adminApiClient"];
  apiTeardown:    TestFixtures["apiTeardown"];
};

export const apiFixtures = pageFixtures.extend<ApiLayer>({

  // ── apiTeardown ──────────────────────────────────────────────────────────────
  //
  // MUST be declared before apiClient so tests can reference both in the same
  // destructured parameter object without ordering issues.
  //
  // How it works:
  //   1.  The fixture yields a `register` function.
  //   2.  Each call to register() pushes a callback onto a queue.
  //   3.  After use() returns (test body is done), the queue is drained in
  //       reverse order (LIFO) regardless of test outcome.
  //   4.  Each callback is run inside its own try/catch so a failing cleanup
  //       does not prevent subsequent cleanups from running.
  //
  // LIFO teardown matches creation order semantics:
  //   create A → create B (depends on A) → delete B first → delete A ✓
  //   (reversing would try to delete A while B still references it)

  apiTeardown: async ({}, use) => {
    const queue: Array<() => Promise<unknown> | unknown> = [];

    // The register function — test calls this to enqueue a cleanup
    const register = (fn: () => Promise<unknown> | unknown): void => {
      queue.push(fn);
    };

    await use(register);

    // ── Post-test teardown ────────────────────────────────────────────────
    const failures: string[] = [];

    for (const fn of [...queue].reverse()) {
      try {
        await fn();
      } catch (err) {
        // Collect failures rather than stopping — every teardown must run
        failures.push(String(err));
      }
    }

    if (failures.length > 0) {
      // Surface teardown failures as a warning; they shouldn't mask the
      // original test result but should be visible in the report.
      console.error(
        `[apiTeardown] ${failures.length} cleanup(s) failed:\n` +
        failures.map((f, i) => `  ${i + 1}. ${f}`).join("\n"),
      );
    }
  },

  // ── apiClient ─────────────────────────────────────────────────────────────────
  //
  // A new ApiClient is created for each test.  It is NOT auto-logged-in,
  // because not all APIs are token-based (automationexercise.com isn't).
  //
  // For form-encoded APIs:    use client.postForm(...)
  // For JSON APIs:            call client.login(...) explicitly in the test
  //                           (or in a beforeEach) before authenticated calls.
  //
  // ── Why we pass apiBaseURL explicitly ───────────────────────────────────
  //  Playwright's APIRequestContext baseURL strips the path component when
  //  the endpoint argument starts with a leading slash:
  //    project baseURL "https://x.com/api"  +  endpoint "/users"
  //    → "https://x.com/users"  ❌ (path "/api" stripped)
  //
  //  By passing the baseURL into ApiClient itself, buildUrl() concatenates
  //  the strings directly and produces absolute URLs that Playwright treats
  //  as-is — bypassing the broken resolution entirely.

  apiClient: async ({ request }, use) => {
    const envConfig = getEnvConfig();
    const client = new ApiClient(request, { baseURL: envConfig.apiBaseURL });
    await use(client);
    // Playwright disposes the APIRequestContext automatically.
  },

  // ── adminApiClient ────────────────────────────────────────────────────────────
  //
  // Separate client instance.  Same no-auto-login rule applies.
  // Tests that need admin auth on a token-based API call:
  //   await adminApiClient.login(adminCreds.username, adminCreds.password);

  adminApiClient: async ({ request }, use) => {
    const envConfig = getEnvConfig();
    const client = new ApiClient(request, { baseURL: envConfig.apiBaseURL });
    await use(client);
  },
});
