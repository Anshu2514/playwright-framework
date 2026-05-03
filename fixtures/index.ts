/**
 * fixtures/index.ts
 *
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                       SINGLE IMPORT FOR ALL TESTS                       ║
 * ║                                                                          ║
 * ║   import { test, expect } from "../../fixtures";                         ║
 * ║                                                                          ║
 * ║   Never import from @playwright/test directly in spec files.             ║
 * ║   This file re-exports everything tests need and adds all custom          ║
 * ║   fixtures automatically.                                                ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 *
 * ── Fixture composition chain ─────────────────────────────────────────────────
 *
 *   @playwright/test (base)
 *        │  Playwright built-ins: browser, context, page, request, testInfo …
 *        ▼
 *   workerFixtures                         fixtures/workerFixtures.ts
 *        │  workerBrowser     ← worker-scoped Browser instance
 *        │  workerAuthState   ← worker-scoped serialised auth token (1× per worker)
 *        ▼
 *   browserFixtures                        fixtures/browserFixtures.ts
 *        │  browserContext    ← custom Context (locale, viewport, tracing, headers)
 *        │  page              ← Page from browserContext (shadows built-in)
 *        │  autoConsoleGuard  ← [auto] captures console errors → test report
 *        │  autoPerfMetrics   ← [auto] collects Web Vitals → test report
 *        │  createContext     ← factory for additional isolated contexts
 *        ▼
 *   pageFixtures                           fixtures/pageFixtures.ts
 *        │  loginPage         ← LoginPage, pre-navigated to /login
 *        │  homePage          ← HomePage, not navigated
 *        │  checkoutPage      ← CheckoutPage, not navigated
 *        │  authenticatedHome ← full UI login → HomePage at /
 *        │  fastAuthHome      ← token injection (no UI) → HomePage at /
 *        │  cartWithItem      ← fastAuth + 1 product in cart → CheckoutPage at /checkout
 *        ▼
 *   apiFixtures                            fixtures/apiFixtures.ts
 *        │  apiClient         ← ApiClient authenticated as standard user
 *        │  adminApiClient    ← ApiClient authenticated as admin user
 *        │  apiTeardown       ← register post-test cleanup callbacks (LIFO)
 *        ▼
 *   ┌────────────────────────────────────┐
 *   │  export { test, expect }           │  ← this file
 *   └────────────────────────────────────┘
 *
 * ── Quick-reference ───────────────────────────────────────────────────────────
 *
 *  FIXTURE               SCOPE   DESCRIPTION
 *  ─────────────────────────────────────────────────────────────────────────────
 *  workerBrowser         worker  Shared Browser instance
 *  workerAuthState       worker  Serialised auth token (JSON string)
 *  ─────────────────────────────────────────────────────────────────────────────
 *  browserContext        test    Isolated Context with full configuration
 *  page                  test    Page from browserContext
 *  autoConsoleGuard      test*   [auto] Console error capture
 *  autoPerfMetrics       test*   [auto] Web Vitals attachment
 *  createContext         test    Factory for additional contexts
 *  ─────────────────────────────────────────────────────────────────────────────
 *  loginPage             test    LoginPage, pre-navigated to /login
 *  homePage              test    HomePage, not navigated
 *  checkoutPage          test    CheckoutPage, not navigated
 *  authenticatedHome     test    UI login → home page
 *  fastAuthHome          test    Token injection → home page (faster)
 *  cartWithItem          test    Token injection + headphones in cart → checkout
 *  ─────────────────────────────────────────────────────────────────────────────
 *  apiClient             test    ApiClient as standard user
 *  adminApiClient        test    ApiClient as admin user
 *  apiTeardown           test    Cleanup callback registry
 *  ─────────────────────────────────────────────────────────────────────────────
 *  * auto: true — runs for every test without appearing in its parameter list
 *
 * ── Usage examples ────────────────────────────────────────────────────────────
 *
 *  // 1. Basic page-object test
 *  test("user can search", async ({ fastAuthHome }) => {
 *    await fastAuthHome.searchFor("laptop");
 *    await fastAuthHome.assertVisible(fastAuthHome.productGrid);
 *  });
 *
 *  // 2. API + UI hybrid test with guaranteed teardown
 *  test("created product appears in search", async ({
 *    fastAuthHome,
 *    apiClient,
 *    apiTeardown,
 *  }) => {
 *    const product = await apiClient.post("/api/products", { name: "Widget" });
 *    apiTeardown(() => apiClient.delete(`/api/products/${product.id}`));
 *    await fastAuthHome.searchFor("Widget");
 *    await fastAuthHome.assertProductVisible("Widget");
 *  });
 *
 *  // 3. Multi-actor test using the context factory
 *  test("admin sees buyer's order", async ({ page, createContext }) => {
 *    const adminCtx  = await createContext({ storageState: adminToken });
 *    const adminPage = await adminCtx.newPage();
 *    // … drive both pages …
 *  });
 *
 *  // 4. Admin-only API test
 *  test("admin can delete any user", async ({ adminApiClient }) => {
 *    const res = await adminApiClient.delete("/api/users/42");
 *    expect(res).toBeTruthy();
 *  });
 */

import { apiFixtures } from "./apiFixtures";
export { expect }      from "@playwright/test";

/**
 * `test` — the fully-composed custom test function.
 *
 * Import ONLY this in spec files.  It includes every fixture in the chain
 * and is fully type-safe: TypeScript will surface a compile error if you
 * reference a fixture that doesn't exist.
 */
export const test = apiFixtures;

/**
 * `mergedTest` — alias for `test`.
 *
 * Some teams configure ESLint `no-restricted-imports` to ban direct imports
 * from @playwright/test and allow only `mergedTest` from this module.
 * Both names are identical at runtime.
 */
export { test as mergedTest };

// Re-export fixture types so external tooling (e.g. custom reporters, helper
// utilities) can reference them without importing from the implementation files.
export type { TestFixtures, WorkerFixtures } from "./types";
