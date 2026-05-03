/**
 * tests/e2e/login.spec.ts
 *
 * Real tests against https://www.saucedemo.com
 *
 * Run:  npx playwright test tests/e2e/login.spec.ts --headed
 *
 * ── Demonstrates the framework's new patterns ───────────────────────────────
 *  • test.describe.configure({ retries: 5 }) for known-flaky tests
 *  • test.describe.configure({ mode: "serial" }) for tests that share state
 *  • logger.forTest() for structured per-test logging with attachment
 */

import { test, expect } from "../../fixtures";
import { credentials } from "../data/testData";
import { logger } from "../../utils/logger";

test.describe("Login — saucedemo.com", () => {

  test.beforeEach(async ({ loginPage }) => {
    await loginPage.goto();
  });

  // ── Successful login ──────────────────────────────────────────────────────

  test("valid credentials land on the inventory page", async ({
    loginPage,
    page,
  }, testInfo) => {
    const log = logger.forTest(testInfo);
    log.info("Submitting valid credentials");

    await loginPage.login(
      credentials.validUser.username,
      credentials.validUser.password,
    );

    log.info("Verifying redirect to inventory");
    await expect(page).toHaveURL(/inventory\.html/);
    await expect(page.locator(".inventory_list")).toBeVisible();

    await log.attach();
  });

  test("page title is 'Swag Labs' after login", async ({
    loginPage,
    page,
  }) => {
    await loginPage.login(
      credentials.validUser.username,
      credentials.validUser.password,
    );
    await expect(page).toHaveTitle("Swag Labs");
  });

  // ── Failed login ──────────────────────────────────────────────────────────

  test("wrong password shows error banner", async ({ loginPage }) => {
    await loginPage.loginExpectingError(
      credentials.invalidUsers.wrongPassword.username,
      credentials.invalidUsers.wrongPassword.password,
    );
    await loginPage.assertErrorMessage(
      credentials.invalidUsers.wrongPassword.expectedError,
    );
    await loginPage.assertOnLoginPage();
  });

  test("locked-out user sees the locked-out error", async ({ loginPage }) => {
    await loginPage.loginExpectingError(
      credentials.invalidUsers.lockedOut.username,
      credentials.invalidUsers.lockedOut.password,
    );
    await loginPage.assertErrorMessage(
      credentials.invalidUsers.lockedOut.expectedError,
    );
  });

  test("unknown username shows credential mismatch error", async ({
    loginPage,
  }) => {
    await loginPage.loginExpectingError(
      credentials.invalidUsers.unknownEmail.username,
      credentials.invalidUsers.unknownEmail.password,
    );
    await loginPage.assertErrorMessage(
      credentials.invalidUsers.unknownEmail.expectedError,
    );
  });

  // ── Form validation ───────────────────────────────────────────────────────

  test("empty username shows 'Username is required'", async ({
    loginPage,
  }) => {
    await loginPage.click(loginPage.loginButton);
    await loginPage.assertErrorMessage(
      credentials.invalidUsers.emptyCredentials.usernameError,
    );
  });

  test("username filled but password empty shows 'Password is required'", async ({
    loginPage,
  }) => {
    await loginPage.fill(loginPage.usernameInput, "standard_user");
    await loginPage.click(loginPage.loginButton);
    await loginPage.assertErrorMessage(
      credentials.invalidUsers.emptyCredentials.passwordError,
    );
  });

  // ── UI ────────────────────────────────────────────────────────────────────

  test("password field is masked by default", async ({ loginPage }) => {
    await expect(loginPage.passwordInput).toHaveAttribute("type", "password");
  });

  test("filled-then-cleared inputs report empty values", async ({
    loginPage,
  }) => {
    await loginPage.fill(loginPage.usernameInput, "standard_user");
    await loginPage.fill(loginPage.passwordInput, "secret_sauce");
    // Use the basePage.fill helper which clears before filling
    await loginPage.fill(loginPage.usernameInput, "");
    await loginPage.fill(loginPage.passwordInput, "");
    await expect(loginPage.usernameInput).toHaveValue("");
    await expect(loginPage.passwordInput).toHaveValue("");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Demonstration — performance_glitch_user (intentionally slow)
//
// This account on saucedemo introduces ~5s of artificial delay during login.
// Without extra retries the test is flaky on slow CI runners.  Bumping retries
// to 5 inside this describe block keeps it green without affecting any other
// tests in the file.
//
// The override is ADDITIVE to the project-level retry count — it doesn't
// replace it.  Use sparingly and only on tests that are flaky for KNOWN
// reasons (network, third-party slowness).  Unknown flake = bug.
// ─────────────────────────────────────────────────────────────────────────────

test.describe("Login — performance_glitch_user (known slow)", () => {

  // Per-block override.  Default retries (from playwright.config.ts) are 0
  // locally and 2 on CI; this block uses 5 in both cases.
  test.describe.configure({ retries: 5 });

  test.beforeEach(async ({ loginPage }) => {
    await loginPage.goto();
  });

  test("slow user can still log in within timeout", async ({
    loginPage,
    page,
  }, testInfo) => {
    const log = logger.forTest(testInfo);

    // Increase this single test's timeout to absorb the ~5s artificial delay
    test.setTimeout(60_000);

    log.info("Logging in as performance_glitch_user (expect ~5s delay)");
    const startMs = Date.now();

    await loginPage.login("performance_glitch_user", "secret_sauce");

    const elapsedMs = Date.now() - startMs;
    log.info("Login finished", { elapsedMs });

    await expect(page).toHaveURL(/inventory\.html/);
    await log.attach();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Demonstration — serial mode for tests that must run in a fixed order
//
// Tests in a serial-mode describe block:
//   • Run on the SAME worker (so worker-scoped fixtures are shared)
//   • Run in declaration order
//   • Stop after the first failure — remaining tests are skipped
//
// Each test still gets its own browser context and page (test-scoped
// fixtures), so the session does NOT carry over between them.
// Use serial mode when:
//   • Tests share an external resource that can't tolerate parallel access
//     (e.g. a single test account where one test would log the other out).
//   • A later test only makes sense if an earlier one passed.
//
// For the saucedemo demo we just verify that the same user can log in twice
// in sequence — useful for catching session-leak bugs that a parallel run
// would miss because each test gets a fresh context.
// ─────────────────────────────────────────────────────────────────────────────

test.describe("Login — serial flow (sequential by design)", () => {

  test.describe.configure({ mode: "serial" });

  test("step 1 — log in for the first time", async ({ loginPage, page }) => {
    await loginPage.goto();
    await loginPage.login(
      credentials.validUser.username,
      credentials.validUser.password,
    );
    await expect(page).toHaveURL(/inventory\.html/);
  });

  test("step 2 — log in again with the same credentials", async ({
    loginPage,
    page,
  }) => {
    await loginPage.goto();
    await loginPage.login(
      credentials.validUser.username,
      credentials.validUser.password,
    );
    await expect(page).toHaveURL(/inventory\.html/);
  });
});
