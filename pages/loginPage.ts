/**
 * pages/loginPage.ts
 *
 * Page Object for https://www.saucedemo.com  (the root route IS the login page)
 *
 * Verified locators (Jan 2025):
 *   Username  → #user-name
 *   Password  → #password
 *   Button    → #login-button
 *   Error     → [data-test="error"]   (e.g. "Epic sadface: …")
 *
 * Built-in test accounts  (no registration required):
 *   standard_user         / secret_sauce  → success ✓
 *   locked_out_user       / secret_sauce  → always rejected ✓
 *   problem_user          / secret_sauce  → broken images
 *   performance_glitch_user / secret_sauce → slow
 */

import { type Page, type Locator, expect } from "@playwright/test";
import { BasePage } from "./basePage";

export class LoginPage extends BasePage {
  // ── Locators ──────────────────────────────────────────────────────────────

  readonly usernameInput: Locator;
  readonly passwordInput: Locator;
  readonly loginButton:   Locator;
  readonly errorMessage:  Locator;

  constructor(page: Page) {
    super(page);
    this.usernameInput = page.locator("#user-name");
    this.passwordInput = page.locator("#password");
    this.loginButton   = page.locator("#login-button");
    this.errorMessage  = page.locator('[data-test="error"]');
  }

  // ── Navigation ─────────────────────────────────────────────────────────────

  /** Navigate to saucedemo root and wait for the login button to be ready. */
  async goto(): Promise<void> {
    await this.navigate("/");
    await this.waitForVisible(this.loginButton);
  }

  // ── Actions ────────────────────────────────────────────────────────────────

  /**
   * Happy-path login — fills credentials and submits.
   * Does NOT assert the destination; caller owns that assertion.
   * On success the browser lands on /inventory.html.
   */
  async login(username: string, password: string): Promise<void> {
    await this.fill(this.usernameInput, username);
    await this.fill(this.passwordInput, password);
    await this.click(this.loginButton);
    await this.waitForPageLoad();
  }

  /**
   * Login that is expected to fail.
   * Waits for the error banner instead of a redirect.
   */
  async loginExpectingError(username: string, password: string): Promise<void> {
    await this.fill(this.usernameInput, username);
    await this.fill(this.passwordInput, password);
    await this.click(this.loginButton);
    await this.waitForVisible(this.errorMessage);
  }

  // ── Assertions ─────────────────────────────────────────────────────────────

  async assertOnLoginPage(): Promise<void> {
    await this.assertURL("/");
    await this.assertVisible(this.loginButton);
  }

  async assertErrorMessage(text: string | RegExp): Promise<void> {
    await this.assertVisible(this.errorMessage);
    if (typeof text === "string") {
      await this.assertContainsText(this.errorMessage, text);
    } else {
      await expect(this.errorMessage).toHaveText(text);
    }
  }

  /**
   * saucedemo surfaces field errors in a single banner — not per-field.
   * This method matches the banner text against the expected string.
   */
  async assertFieldError(_field: "username" | "password", message: string): Promise<void> {
    await this.assertContainsText(this.errorMessage, message);
  }
}
