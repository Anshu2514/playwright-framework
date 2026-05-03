/**
 * fixtures/types.ts
 *
 * Single source of truth for every custom fixture type in the framework.
 * Separating type declarations from implementations prevents circular imports
 * and gives IDE auto-complete accurate information across all fixture layers.
 *
 * ── Fixture scope rules ──────────────────────────────────────────────────────
 *
 *  "test"   (default)
 *    Created fresh for every test, torn down after it completes.
 *    Safe to mutate — no shared state between tests.
 *
 *  "worker"
 *    Created once when a Playwright worker process starts, shared by every
 *    test that runs in that worker, destroyed when the worker exits.
 *    Must be read-only or safe for concurrent access (workers run tests in
 *    series, not in parallel, so true concurrency is not an issue, but the
 *    fixture must not leave side-effects that bleed into the next test).
 *
 * ── Adding a new fixture ──────────────────────────────────────────────────────
 *  1.  Declare its return type here in the appropriate block below.
 *  2.  Implement it in the relevant layer file (workerFixtures, browserFixtures,
 *      pageFixtures, or apiFixtures).
 *  3.  No changes needed to index.ts — the composition chain picks it up.
 */

import type {
  Browser,
  BrowserContext,
  Page,
  APIRequestContext,
} from "@playwright/test";

import type { LoginPage }    from "../pages/loginPage";
import type { HomePage }     from "../pages/homePage";
import type { CheckoutPage } from "../pages/checkoutPage";
import type { ApiClient }    from "../utils/apiClient";

// ─────────────────────────────────────────────────────────────────────────────
// Worker-scoped fixture types
// ─────────────────────────────────────────────────────────────────────────────

export type WorkerFixtures = {
  /**
   * The single Browser instance owned by this worker.
   * We surface it as a named fixture so dependent fixtures can reference it
   * without importing Playwright's internal `browser` fixture directly.
   *
   * Backed by Playwright's built-in `browser` worker fixture.
   */
  workerBrowser: Browser;

  /**
   * Serialised auth storage state — produced by a single API login per worker.
   *
   * Shape: JSON string that matches Playwright's BrowserContext.storageState()
   * output (cookies + localStorage origins).
   *
   * Tests that need a fast authenticated context inject this into their
   * BrowserContext rather than going through the UI login form, saving
   * several seconds per test over large suites.
   *
   *   Worker 1 ──► 1 API login ──► shared by all N tests in Worker 1
   *   Worker 2 ──► 1 API login ──► shared by all N tests in Worker 2
   *   …
   *
   * If the auth endpoint is unreachable the fixture falls back to "{}" (empty)
   * and logs a warning — it does NOT crash the entire worker.
   */
  workerAuthState: string;
};

// ─────────────────────────────────────────────────────────────────────────────
// Test-scoped fixture types
// ─────────────────────────────────────────────────────────────────────────────

export type TestFixtures = {

  // ── Browser surface ───────────────────────────────────────────────────────

  /**
   * Custom BrowserContext created fresh for every test.
   *
   * Configured with:
   *  • locale, timezone, geolocation  from env config
   *  • viewport                       responsive to project name ("mobile" → 390px)
   *  • permissions                    geolocation + clipboard pre-granted
   *  • network listeners              logs every failed request and every 4xx/5xx
   *  • tracing                        started automatically; saved on failure
   *  • storage state                  NOT injected here (use fastAuthHome for that)
   *
   * Shadows Playwright's built-in `context` fixture so tests transparently
   * inherit all the above without explicit configuration.
   */
  browserContext: BrowserContext;

  /**
   * Page created from `browserContext`.
   * Shadows Playwright's built-in `page` fixture — tests never need to open
   * a page themselves; one is always ready and connected to the right context.
   *
   * Also attaches a global dialog handler that auto-dismisses unexpected
   * alert / confirm / prompt dialogs rather than hanging the test.
   */
  page: Page;

  /**
   * Auto-active fixture (auto: true) — runs for every test without opt-in.
   *
   * Captures browser console.error() calls and uncaught page errors.
   * After the test completes, any captured errors are attached to the test
   * report as a plain-text attachment.
   *
   * Set env var TEST_STRICT_CONSOLE=true to make any captured error
   * immediately fail the test rather than just attach a report entry.
   */
  autoConsoleGuard: void;

  /**
   * Auto-active fixture (auto: true) — runs for every test without opt-in.
   *
   * Records performance metrics (FCP, LCP, CLS, TBT) for pages navigated
   * during the test and attaches a JSON report after the test completes.
   * Useful for catching performance regressions as a side-effect of UI tests.
   */
  autoPerfMetrics: void;

  /**
   * Factory that creates additional isolated BrowserContexts within a test.
   * Useful for multi-actor scenarios (e.g. shopper + admin acting simultaneously).
   *
   * All contexts spawned through this factory are closed automatically
   * in teardown — callers do NOT need to call ctx.close() themselves.
   *
   * @example
   *   const adminCtx  = await createContext({ storageState: adminAuthState });
   *   const adminPage = await adminCtx.newPage();
   */
  createContext: (
    options?: Parameters<Browser["newContext"]>[0],
  ) => Promise<BrowserContext>;

  // ── Page objects ──────────────────────────────────────────────────────────

  /**
   * LoginPage instance.  Already navigated to /login and asserted that the
   * login button is visible before the test body runs.
   */
  loginPage: LoginPage;

  /**
   * HomePage instance.  NOT navigated — the test drives the URL.
   * Use `authenticatedHome` or `fastAuthHome` for a ready-to-use home page.
   */
  homePage: HomePage;

  /**
   * CheckoutPage instance.  NOT navigated.
   * Use `cartWithItem` for a pre-populated checkout context.
   */
  checkoutPage: CheckoutPage;

  /**
   * Pre-conditions: full UI login via the login form.
   * Yields: HomePage already on the home route ("/").
   *
   * Use when:
   *  • the test's subject matter involves the login UX as a precondition
   *  • you need to verify the post-login redirect / landing state
   *
   * Avoid for tests that are unrelated to login — prefer fastAuthHome to
   * skip the ~2s UI login overhead.
   */
  authenticatedHome: HomePage;

  /**
   * Pre-conditions: worker-level auth token injected into the browser context
   *                 (no UI login form involved).
   * Yields: HomePage already on the home route ("/").
   *
   * This is the fastest way to start a test in an authenticated state.
   * One token is obtained per Playwright worker via the API; every test in
   * that worker reuses it without incurring an extra login round-trip.
   *
   * Use for any test where login itself is not the subject under test.
   */
  fastAuthHome: HomePage;

  /**
   * Pre-conditions: fastAuth + SoundWave Pro Headphones added to cart.
   * Yields: CheckoutPage already at /checkout (step 1 — cart review).
   *
   * Use for all checkout-scope tests.  Setup noise is zero; the test can
   * immediately call proceedToShipping() or assert on the cart summary.
   */
  cartWithItem: CheckoutPage;

  // ── API clients ───────────────────────────────────────────────────────────

  /**
   * ApiClient authenticated as the standard test user.
   * A fresh client (and fresh API session) is created for each test.
   */
  apiClient: ApiClient;

  /**
   * ApiClient authenticated as the admin user.
   * Use only in tests that specifically exercise admin-only functionality.
   * Kept separate from apiClient to prevent accidental privilege escalation.
   */
  adminApiClient: ApiClient;

  /**
   * Register a teardown callback to be executed after the test completes,
   * regardless of whether the test passed or failed.
   *
   * Callbacks run in LIFO order (last registered = first executed) so that
   * dependencies are cleaned up in reverse-creation order.
   *
   * Errors inside callbacks are caught and logged — they do not interrupt
   * subsequent teardowns.
   *
   * @example
   *   const user = await apiClient.post("/api/users", TestData.user());
   *   apiTeardown(async () => apiClient.delete(`/api/users/${user.id}`));
   */
  apiTeardown: (fn: () => Promise<unknown> | unknown) => void;
};
