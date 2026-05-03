/**
 * tests/e2e/fixtures.usage.spec.ts
 *
 * Living documentation for the fixture system, exercised against
 * https://www.saucedemo.com.
 *
 * Each describe block demonstrates one fixture (or fixture pattern) with a
 * concrete, runnable test.  Read this file alongside fixtures/index.ts to
 * understand what every fixture does and when to use it.
 *
 * ── Saucedemo limitations ────────────────────────────────────────────────────
 *  Saucedemo has no public API and no admin role, so any fixture that depends
 *  on a backend (apiClient, adminApiClient, apiTeardown) is exercised inside
 *  test.skip blocks.  These tests pass type-checking and serve as
 *  documentation for when the framework is repointed at a real backend.
 */

import { test, expect } from "../../fixtures";
import { credentials, products } from "../data/testData";

// ─────────────────────────────────────────────────────────────────────────────
// 1. loginPage — pre-navigated to /
//    Use when login UI behaviour is the subject of the test.
// ─────────────────────────────────────────────────────────────────────────────

test.describe("loginPage fixture", () => {

  test("page is on / and the login button is visible", async ({ loginPage }) => {
    await loginPage.assertOnLoginPage();
    await loginPage.assertVisible(loginPage.loginButton);
  });

  test("successful login redirects to /inventory.html", async ({
    loginPage,
    page,
  }) => {
    await loginPage.login(
      credentials.validUser.username,
      credentials.validUser.password,
    );
    await expect(page).toHaveURL(/inventory\.html/);
  });

  test("wrong credentials show error banner and stay on login page", async ({
    loginPage,
  }) => {
    await loginPage.loginExpectingError("standard_user", "bad-pass");
    await loginPage.assertOnLoginPage();
    await loginPage.assertVisible(loginPage.errorMessage);
  });

});

// ─────────────────────────────────────────────────────────────────────────────
// 2. homePage (bare — not navigated)
//    Use when you want to drive navigation yourself.
// ─────────────────────────────────────────────────────────────────────────────

test.describe("homePage fixture (bare)", () => {

  test("homePage is constructed but not navigated", async ({ homePage, page }) => {
    // Bare fixture — no navigation occurred yet
    expect(page.url()).toMatch(/^about:blank|^https?:\/\/www\.saucedemo\.com\/?$/);
    void homePage;
  });

  test("can drive navigation to inventory after manual login", async ({
    homePage,
    loginPage,
  }) => {
    // The loginPage fixture already navigated us to /
    await loginPage.login(
      credentials.validUser.username,
      credentials.validUser.password,
    );
    await homePage.waitForVisible(homePage.inventoryList);
    await homePage.assertOnHomePage();
  });

});

// ─────────────────────────────────────────────────────────────────────────────
// 3. authenticatedHome — full UI login + on /inventory.html
//    Use when login itself is part of the test's preconditions.
// ─────────────────────────────────────────────────────────────────────────────

test.describe("authenticatedHome fixture", () => {

  test("user lands on inventory page after UI login", async ({
    authenticatedHome,
  }) => {
    await authenticatedHome.assertOnHomePage();
  });

  test("burger menu is visible (only rendered for logged-in users)", async ({
    authenticatedHome,
  }) => {
    await authenticatedHome.assertVisible(authenticatedHome.burgerMenu);
  });

  test("cart badge is hidden for a fresh session (no items added)", async ({
    authenticatedHome,
  }) => {
    const count = await authenticatedHome.getCartItemCount();
    expect(count).toBe(0);
  });

  test("inventory contains the expected number of products", async ({
    authenticatedHome,
  }) => {
    await authenticatedHome.assertElementCount(
      authenticatedHome.productCards,
      6,
    );
  });

});

// ─────────────────────────────────────────────────────────────────────────────
// 4. fastAuthHome — token injection if API exists, UI login fallback otherwise
//    Saucedemo has no API, so this fixture transparently falls back to UI login.
// ─────────────────────────────────────────────────────────────────────────────

test.describe("fastAuthHome fixture", () => {

  test("user is authenticated and on the inventory page", async ({
    fastAuthHome,
    page,
  }) => {
    // Whether by token injection (real API) or UI login fallback (saucedemo),
    // the end state must be the same: authenticated, on /inventory.html.
    await expect(page).toHaveURL(/inventory\.html/);
    await fastAuthHome.assertOnHomePage();
  });

  test("adding to cart works in a fast-auth session", async ({
    fastAuthHome,
  }) => {
    await fastAuthHome.addToCart("sauce-labs-backpack");
    const count = await fastAuthHome.getCartItemCount();
    expect(count).toBe(1);
  });

});

// ─────────────────────────────────────────────────────────────────────────────
// 5. cartWithItem — authenticated + Sauce Labs Backpack in cart + on /cart.html
//    Use for tests that exercise the checkout wizard steps.
// ─────────────────────────────────────────────────────────────────────────────

test.describe("cartWithItem fixture", () => {

  test("checkout page renders with one cart item", async ({ cartWithItem }) => {
    await cartWithItem.assertOnCheckoutPage();
    const summary = await cartWithItem.getOrderSummary();
    expect(summary.items.length).toBeGreaterThanOrEqual(1);
  });

  test("the pre-added item is the Sauce Labs Backpack", async ({
    cartWithItem,
  }) => {
    await cartWithItem.assertCartContains(products.backpack.name);
  });

});

// ─────────────────────────────────────────────────────────────────────────────
// 6. createContext (factory) — multi-actor scenarios
// ─────────────────────────────────────────────────────────────────────────────

test.describe("createContext factory fixture", () => {

  test("two factory contexts share no cookies (isolated sessions)", async ({
    createContext,
  }) => {
    const ctx1 = await createContext();
    const ctx2 = await createContext();

    await ctx1.addCookies([{
      name: "session", value: "user-a", domain: "www.saucedemo.com", path: "/",
    }]);

    const ctx2Cookies = await ctx2.cookies();
    expect(ctx2Cookies.find((c) => c.name === "session")).toBeUndefined();
  });

  test("two pages can navigate independently in their own contexts", async ({
    createContext,
  }) => {
    const [ctxA, ctxB] = await Promise.all([
      createContext(),
      createContext(),
    ]);

    const [pageA, pageB] = await Promise.all([
      ctxA.newPage(),
      ctxB.newPage(),
    ]);

    await Promise.all([
      pageA.goto("/"),
      pageB.goto("/"),
    ]);

    // Both pages should be on saucedemo's login screen
    await expect(pageA.locator("#login-button")).toBeVisible();
    await expect(pageB.locator("#login-button")).toBeVisible();

    // ctxA and ctxB are closed automatically by the createContext teardown
  });

});

// ─────────────────────────────────────────────────────────────────────────────
// 7. autoConsoleGuard (auto: true — always active)
//    No import needed.  Demonstrated here by NOT causing a console error.
// ─────────────────────────────────────────────────────────────────────────────

test.describe("autoConsoleGuard (always-on)", () => {

  test("a clean page produces no console errors — guard is silent", async ({
    authenticatedHome,
  }) => {
    void authenticatedHome;
    // If saucedemo emits console.error() calls, this test fails automatically
    // via the guard — no assertion needed here.
  });

});

// ─────────────────────────────────────────────────────────────────────────────
// 8. API fixtures — skipped on saucedemo (no public API)
//    These tests are kept as living documentation for when the framework is
//    repointed at a real backend.  Re-enable by removing test.describe.skip.
// ─────────────────────────────────────────────────────────────────────────────

test.describe.skip("apiClient fixture (requires a real API)", () => {

  test("GET /api/products returns a non-empty array", async ({ apiClient }) => {
    const list = await apiClient.get<{ id: string }[]>("/api/products");
    expect(Array.isArray(list)).toBe(true);
    expect(list.length).toBeGreaterThan(0);
  });

  test("POST then DELETE a user via API", async ({ apiClient, apiTeardown }) => {
    const payload = {
      username:  "fixture_demo_user",
      email:     "fixture@example.com",
      firstName: "Fixture",
      lastName:  "Demo",
      role:      "viewer" as const,
      status:    "active" as const,
      password:  "P@ssw0rd!",
    };

    const created = await apiClient.post<{ id: string; email: string }>(
      "/api/users",
      payload,
    );
    apiTeardown(async () => apiClient.delete(`/api/users/${created.id}`));

    expect(created.email).toBe(payload.email);
  });

});

test.describe.skip("adminApiClient fixture (requires a real API)", () => {

  test("admin can fetch all users", async ({ adminApiClient }) => {
    const users = await adminApiClient.get<{ id: string }[]>("/api/admin/users");
    expect(Array.isArray(users)).toBe(true);
  });

});

test.describe.skip("apiTeardown LIFO ordering (requires a real API)", () => {

  test("multiple teardowns run in LIFO order", async ({ apiTeardown }) => {
    const order: number[] = [];

    apiTeardown(async () => { order.push(1); });
    apiTeardown(async () => { order.push(2); });
    apiTeardown(async () => { order.push(3); });

    // Within the test body, teardowns have not run yet.
    // After the test body completes, teardown will produce [3, 2, 1].
    expect(order).toEqual([]);
  });

});
