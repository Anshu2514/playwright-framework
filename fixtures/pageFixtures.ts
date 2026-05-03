/**
 * fixtures/pageFixtures.ts
 *
 * Injects page objects (Page Object Model classes) into tests.
 *
 * ── Design principles ─────────────────────────────────────────────────────────
 *
 *  1.  Bare fixtures (loginPage, homePage, checkoutPage)
 *      → Only construct the POM; the test drives navigation.
 *        This keeps fixtures reusable across suites that start at different URLs.
 *
 *  2.  Compound fixtures (authenticatedHome, fastAuthHome, cartWithItem)
 *      → Handle multi-step setup so the test body starts exactly where it needs
 *        to without copying boilerplate.  Each fixture documents the exact
 *        preconditions it satisfies.
 *
 *  3.  Teardown is intentionally absent from these fixtures.
 *      The browserFixtures layer closes the BrowserContext after each test,
 *      which closes all pages and clears cookies/localStorage.  Adding explicit
 *      page teardown here would be redundant.
 *
 * ── Choosing between authenticatedHome and fastAuthHome ──────────────────────
 *
 *  authenticatedHome  — full UI login form → use when LOGIN is part of the story
 *  fastAuthHome       — API token injection → use when login is just plumbing
 *
 *  As a rule of thumb:
 *    • login.spec.ts       → authenticatedHome (or plain loginPage)
 *    • search.spec.ts      → fastAuthHome
 *    • checkout.spec.ts    → cartWithItem (which uses fastAuth internally)
 *    • admin.spec.ts       → fastAuthHome (admin variant)
 *
 * ── Composition chain ─────────────────────────────────────────────────────────
 *
 *  workerFixtures → browserFixtures → pageFixtures ◄── this file
 *                                          ▼
 *                                     apiFixtures
 */

import { browserFixtures } from "./browserFixtures";
import type { TestFixtures } from "./types";
import { LoginPage }    from "../pages/loginPage";
import { HomePage }     from "../pages/homePage";
import { CheckoutPage } from "../pages/checkoutPage";
import { credentials } from "../tests/data/testData";

export const pageFixtures = browserFixtures.extend<
  Pick<
    TestFixtures,
    | "loginPage"
    | "homePage"
    | "checkoutPage"
    | "authenticatedHome"
    | "fastAuthHome"
    | "cartWithItem"
  >
>({

  // ─────────────────────────────────────────────────────────────────────────────
  // Bare page objects
  // Tests that use these own navigation — the fixture just constructs the POM.
  // ─────────────────────────────────────────────────────────────────────────────

  // ── loginPage ────────────────────────────────────────────────────────────────
  //
  // Constructed AND navigated: always starts on /login with the login button
  // confirmed visible.  Every login test starts from the same, known state.

  loginPage: async ({ page }, use) => {
    const lp = new LoginPage(page);
    await lp.goto();   // navigate to /login + assert login button is visible
    await use(lp);
    // Teardown: none. Context cleanup is handled by browserFixtures.
  },

  // ── homePage ─────────────────────────────────────────────────────────────────
  //
  // Bare construction — NOT navigated.  Use authenticatedHome or fastAuthHome
  // for a ready-to-use home page with an active session.

  homePage: async ({ page }, use) => {
    await use(new HomePage(page));
  },

  // ── checkoutPage ─────────────────────────────────────────────────────────────
  //
  // Bare construction — NOT navigated.  Use cartWithItem for a pre-populated
  // checkout context that starts with an item in the cart.

  checkoutPage: async ({ page }, use) => {
    await use(new CheckoutPage(page));
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // Compound fixtures
  // These handle multi-step setup so test bodies start at the right point.
  // ─────────────────────────────────────────────────────────────────────────────

  // ── authenticatedHome ────────────────────────────────────────────────────────
  //
  // Drives the real login UI form end-to-end before yielding the home page.
  //
  // When to use:
  //   ✓  The test scenario explicitly covers the login journey
  //   ✓  A regression in the login form would affect the test's feature area
  //   ✗  The test is about search, checkout, or any post-login feature
  //      (use fastAuthHome — it's ~2s faster per test)
  //
  // Post-conditions guaranteed before yield:
  //   • Session cookie is set (real auth, real cookie)
  //   • Browser is on the home route "/"
  //   • Search input is visible (reliable post-login landmark)

  authenticatedHome: async ({ page }, use) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();

    await loginPage.login(
      credentials.validUser.username,
      credentials.validUser.password,
    );

    const home = new HomePage(page);
    // Wait for a reliable element that only renders post-login.
    // saucedemo: inventoryList ; automationexercise: productGrid (alias)
    await home.waitForVisible(home.inventoryList);

    await use(home);
  },

  // ── fastAuthHome ─────────────────────────────────────────────────────────────
  //
  // Bypasses the login UI by injecting the worker-level auth token directly
  // into the browser context before the first navigation.
  //
  // Mechanics:
  //   1.  Cookies from workerAuthState are added to the context.
  //   2.  The browser navigates to "/".
  //   3.  LocalStorage entries are written via page.evaluate().
  //   4.  The page reloads so the app picks up the localStorage state.
  //
  // Net result: the app sees a fully authenticated session without ever
  // rendering the login form.  Saves ~2s per test over UI login.
  //
  // When to use:
  //   ✓  Any test where login is plumbing, not the subject under test
  //   ✗  Tests that assert on the login form, redirect behaviour, or
  //      "remember me" persistence — those need authenticatedHome

  fastAuthHome: async ({ page, browserContext, workerAuthState }, use) => {
    // ── Step 1: parse the worker-level serialised state ───────────────────
    type StorageState = {
      cookies?: Parameters<typeof browserContext.addCookies>[0];
      origins?: Array<{
        origin:       string;
        localStorage: Array<{ name: string; value: string }>;
      }>;
    };
    const state = JSON.parse(workerAuthState) as StorageState;
    const hasState =
      (state.cookies && state.cookies.length > 0) ||
      (state.origins && state.origins.length > 0);

    const home = new HomePage(page);

    if (!hasState) {
      // ── Fallback: no API available (e.g. saucedemo.com) ─────────────────
      // Drive the UI login form just like authenticatedHome.  This is
      // slower than token injection but works on any site.
      const loginPage = new LoginPage(page);
      await loginPage.goto();
      await loginPage.login(
        credentials.validUser.username,
        credentials.validUser.password,
      );
      await home.waitForVisible(home.inventoryList);
      await use(home);
      return;
    }

    // ── Step 2: inject cookies BEFORE the first navigation ────────────────
    if (state.cookies && state.cookies.length > 0) {
      await browserContext.addCookies(state.cookies);
    }

    // ── Step 3: navigate and inject localStorage ──────────────────────────
    await home.navigate("/");

    if (state.origins && state.origins.length > 0) {
      for (const origin of state.origins) {
        for (const item of origin.localStorage) {
          await page.evaluate(
            (kv: { key: string; value: string }) =>
              window.localStorage.setItem(kv.key, kv.value),
            { key: item.name, value: item.value },
          );
        }
      }
      // ── Step 4: reload so the app re-reads localStorage ─────────────────
      await home.reload();
    }

    // ── Step 5: assert we are actually authenticated ──────────────────────
    // Use the inventory list (saucedemo) as the post-login landmark.
    await home.waitForVisible(home.inventoryList);
    await use(home);
  },

  // ── cartWithItem ─────────────────────────────────────────────────────────────
  //
  // Preconditions:
  //   • User is authenticated (via fast-auth token injection)
  //   • "SoundWave Pro Headphones" has been found via search and added to cart
  //   • Browser is on /checkout (step 1 — cart review visible)
  //
  // Tests that use this fixture should focus purely on checkout behaviour;
  // they must not repeat or depend on the search / add-to-cart flow.
  //
  // Implementation note:
  //   We intentionally DUPLICATE the three cookie-injection lines from
  //   fastAuthHome rather than depending on fastAuthHome as a sub-fixture.
  //   Playwright fixtures can only be composed via the parameter list, and
  //   listing `fastAuthHome` here would force the cart fixture to accept its
  //   HomePage return value even though we need to keep going to /checkout.
  //   Duplication is the correct and idiomatic approach for this pattern.

  cartWithItem: async ({ page, browserContext, workerAuthState }, use) => {
    // ── 1. Authenticate ───────────────────────────────────────────────────
    type StorageState = {
      cookies?: Parameters<typeof browserContext.addCookies>[0];
    };
    const state = JSON.parse(workerAuthState) as StorageState;
    const hasState = state.cookies && state.cookies.length > 0;

    if (hasState) {
      // Token injection
      await browserContext.addCookies(state.cookies!);
      await page.goto("/inventory.html");
    } else {
      // No API → UI login (saucedemo path)
      const loginPage = new LoginPage(page);
      await loginPage.goto();
      await loginPage.login(
        credentials.validUser.username,
        credentials.validUser.password,
      );
    }

    // ── 2. Add a deterministic product to the cart ────────────────────────
    // Use a NAMED product (not index) so checkout tests can reliably
    // reference the same item across runs regardless of default sort order.
    const home = new HomePage(page);
    await home.waitForVisible(home.inventoryList);
    await home.click(home.addToCartButton("sauce-labs-backpack"));

    // ── 3. Navigate to /cart.html and verify it's the cart route ─────────
    const checkout = new CheckoutPage(page);
    await checkout.goto();
    await checkout.assertOnCheckoutPage();

    await use(checkout);
  },
});
