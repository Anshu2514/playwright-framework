/**
 * tests/e2e/login.spec.ts
 *
 * Real tests against https://www.saucedemo.com
 * Run:  npx playwright test tests/e2e/login.spec.ts --headed
 */

import { test, expect } from "../../fixtures";
import { credentials } from "../data/testData";

test.describe("Login — saucedemo.com", () => {

  test.beforeEach(async ({ loginPage }) => {
    await loginPage.goto();
  });

  // ── Successful login ──────────────────────────────────────────────────────

  test("valid credentials land on the inventory page", async ({
    loginPage,
    page,
  }) => {
    await loginPage.login(
      credentials.validUser.username,
      credentials.validUser.password,
    );
    await expect(page).toHaveURL(/inventory\.html/);
    await expect(page.locator(".inventory_list")).toBeVisible();
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
