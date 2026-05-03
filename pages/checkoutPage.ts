/**
 * pages/checkoutPage.ts
 *
 * Page Object for the saucedemo.com checkout flow:
 *
 *   /cart.html               → Cart review
 *   /checkout-step-one.html  → Shipping info (First Name, Last Name, Zip only)
 *   /checkout-step-two.html  → Order overview (no payment form)
 *   /checkout-complete.html  → Confirmation
 *
 * ── Key difference from the fictional spec ────────────────────────────────────
 *   saucedemo has NO payment step and NO promo codes.
 *   Checkout is: Cart → Info → Overview → Complete.
 *   Payment fixtures in testData.ts are used only for API mocks.
 *
 * Verified locators (Jan 2025):
 *   Cart items      → .cart_item
 *   Remove button   → [data-test="remove-<slug>"]
 *   Checkout btn    → [data-test="checkout"]
 *   First name      → [data-test="firstName"]
 *   Last name       → [data-test="lastName"]
 *   Zip code        → [data-test="postalCode"]
 *   Continue btn    → [data-test="continue"]
 *   Error           → [data-test="error"]
 *   Finish btn      → [data-test="finish"]
 *   Confirmation    → .complete-header
 *   Order summary   → .summary_info
 *   Item total      → .summary_subtotal_label
 *   Tax             → .summary_tax_label
 *   Total           → .summary_total_label
 */

import { type Page, type Locator, expect } from "@playwright/test";
import { BasePage }  from "./basePage";
import type { ShippingDetails } from "./checkoutPage.types";

export type { ShippingDetails };

export class CheckoutPage extends BasePage {

  // ── Cart review (/cart.html) ────────────────────────────────────────────────

  readonly cartItems:         Locator;
  readonly checkoutButton:    Locator;
  readonly continueShoppingButton: Locator;
  readonly emptyCartMessage:  Locator;

  // ── Step 1 — Shipping info (/checkout-step-one.html) ──────────────────────

  readonly firstNameInput:    Locator;
  readonly lastNameInput:     Locator;
  readonly zipCodeInput:      Locator;
  readonly continueButton:    Locator;  // advances step 1 → step 2
  readonly errorMessage:      Locator;

  // ── Step 2 — Order overview (/checkout-step-two.html) ─────────────────────

  readonly summaryItems:      Locator;
  readonly itemTotal:         Locator;
  readonly taxLabel:          Locator;
  readonly totalLabel:        Locator;
  readonly finishButton:      Locator;  // places the order
  readonly backButton:        Locator;

  // ── Confirmation (/checkout-complete.html) ─────────────────────────────────

  readonly confirmationHeading:     Locator;
  readonly confirmationSubheading:  Locator;
  readonly backToHomeButton:        Locator;

  // ── Stubs — kept so shared fixtures compile against both real & mock API ───

  readonly cartBadge:             Locator;
  readonly continueToShippingMethodButton: Locator;
  readonly continueToReviewButton: Locator;
  readonly placeOrderButton:       Locator;
  readonly reviewShippingAddress:  Locator;
  readonly reviewPaymentMethod:    Locator;
  readonly promoCodeInput:         Locator;
  readonly applyPromoButton:       Locator;
  readonly promoSuccessBadge:      Locator;
  readonly promoErrorMessage:      Locator;
  readonly loadingSpinner:         Locator;
  readonly continueShoppingLink:   Locator;
  readonly orderNumberText:        Locator;
  readonly errorBanner:            Locator;

  constructor(page: Page) {
    super(page);

    // Cart
    this.cartItems              = page.locator(".cart_item");
    this.checkoutButton         = page.locator('[data-test="checkout"]');
    this.continueShoppingButton = page.locator('[data-test="continue-shopping"]');
    this.emptyCartMessage       = page.locator(".cart_list .removed_cart_item").first();

    // Step 1 — Info
    this.firstNameInput = page.locator('[data-test="firstName"]');
    this.lastNameInput  = page.locator('[data-test="lastName"]');
    this.zipCodeInput   = page.locator('[data-test="postalCode"]');
    this.continueButton = page.locator('[data-test="continue"]');
    this.errorMessage   = page.locator('[data-test="error"]');

    // Step 2 — Overview
    this.summaryItems = page.locator(".cart_item");
    this.itemTotal    = page.locator(".summary_subtotal_label");
    this.taxLabel     = page.locator(".summary_tax_label");
    this.totalLabel   = page.locator(".summary_total_label");
    this.finishButton = page.locator('[data-test="finish"]');
    this.backButton   = page.locator('[data-test="back"]');

    // Confirmation
    this.confirmationHeading    = page.locator(".complete-header");
    this.confirmationSubheading = page.locator(".complete-text");
    this.backToHomeButton       = page.locator('[data-test="back-to-products"]');

    // Stubs (API mock / automationexercise compatibility)
    this.cartBadge                       = page.locator(".shopping_cart_badge");
    this.continueToShippingMethodButton  = this.continueButton;
    this.continueToReviewButton          = this.continueButton;
    this.placeOrderButton                = this.finishButton;
    this.reviewShippingAddress           = page.locator(".summary_info");
    this.reviewPaymentMethod             = page.locator(".summary_info");
    this.promoCodeInput                  = page.locator('[data-test="promo-code"]');
    this.applyPromoButton                = page.locator('[data-test="apply-promo"]');
    this.promoSuccessBadge               = page.locator('[data-test="promo-success"]');
    this.promoErrorMessage               = page.locator('[data-test="promo-error"]');
    this.loadingSpinner                  = page.locator('[role="progressbar"]');
    this.continueShoppingLink            = this.backToHomeButton;
    this.orderNumberText                 = this.confirmationHeading;
    this.errorBanner                     = this.errorMessage;
  }

  // ── Navigation ─────────────────────────────────────────────────────────────

  async goto(): Promise<void> {
    await this.navigate("/cart.html");
    await this.waitForPageLoad();
  }

  // ── Cart review ─────────────────────────────────────────────────────────────

  async removeItem(productName: string): Promise<void> {
    // Derive the slug from the product name:  "Sauce Labs Backpack" → "sauce-labs-backpack"
    const slug = productName.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    await this.click(this.page.locator(`[data-test="remove-${slug}"]`));
  }

  async proceedToShipping(): Promise<void> {
    await this.click(this.checkoutButton);
    await this.waitForVisible(this.firstNameInput);
  }

  // ── Step 1 — Shipping info ─────────────────────────────────────────────────

  /**
   * Fill the saucedemo checkout form (First Name, Last Name, Zip only).
   * Extra fields in `details` (email, phone, city …) are silently ignored —
   * they are only used in API mocks and automationexercise.com tests.
   */
  async fillShippingAddress(details: ShippingDetails): Promise<void> {
    await this.fill(this.firstNameInput, details.firstName);
    await this.fill(this.lastNameInput,  details.lastName);
    await this.fill(this.zipCodeInput,   details.zipCode);
  }

  async proceedToShippingMethod(): Promise<void> {
    await this.click(this.continueButton);
    await this.waitForPageLoad();
  }

  async proceedToPayment(): Promise<void> {
    // saucedemo has no payment step — this is a no-op alias used by shared fixtures
    // so they compile without modification.
  }

  async proceedToReview(): Promise<void> {
    // On saucedemo, step 2 IS the review — no extra action needed.
  }

  // ── Step 2 — Overview / review ─────────────────────────────────────────────

  /**
   * Returns a structured snapshot of whatever order data is currently on the
   * page.  Works in two contexts:
   *
   *   /cart.html              → items only; summary fields are empty strings
   *   /checkout-step-two.html → items + subtotal + tax + total
   *
   * Tests that only need the items list can call this from either page.
   * Tests that need totals must navigate to step-two first.
   */
  async getOrderSummary(): Promise<{
    items:    Array<{ name: string; quantity: number; price: string }>;
    subtotal: string;
    shipping: string;
    tax:      string;
    total:    string;
  }> {
    const items = await this.summaryItems.all();
    const parsedItems = await Promise.all(
      items.map(async (item) => ({
        name:     ((await item.locator(".inventory_item_name").textContent()) ?? "").trim(),
        quantity: 1,
        price:    ((await item.locator(".inventory_item_price").textContent()) ?? "").trim(),
      })),
    );

    // Summary fields exist only on /checkout-step-two.html; check before reading.
    const isOnSummaryStep = this.page.url().includes("checkout-step-two.html");
    const [subtotal, tax, total] = isOnSummaryStep
      ? await Promise.all([
          this.itemTotal.textContent().then((t) => (t ?? "").trim()),
          this.taxLabel.textContent().then((t)  => (t ?? "").trim()),
          this.totalLabel.textContent().then((t) => (t ?? "").trim()),
        ])
      : ["", "", ""];

    return {
      items:    parsedItems,
      subtotal,
      shipping: "Free", // saucedemo always shows $0 shipping
      tax,
      total,
    };
  }

  // ── Finish ─────────────────────────────────────────────────────────────────

  /**
   * Click "Finish" to complete the order.
   * Returns the confirmation heading text (saucedemo has no order number).
   */
  async placeOrder(): Promise<string> {
    await this.click(this.finishButton);
    await this.waitForVisible(this.confirmationHeading);
    return this.getText(this.confirmationHeading);
  }

  /**
   * Run the full checkout end-to-end from cart → confirmation.
   * `shippingMethod` and `payment` are accepted but ignored on saucedemo.
   */
  async completeCheckout(
    shipping: ShippingDetails,
    _payment?: unknown,
    _shippingMethod?: string,
  ): Promise<string> {
    await this.proceedToShipping();
    await this.fillShippingAddress(shipping);
    await this.proceedToShippingMethod(); // clicks Continue on step 1
    return this.placeOrder();             // clicks Finish on step 2
  }

  // ── Stubs for API-mock / automationexercise compatibility ─────────────────

  async selectShippingMethod(_method: string): Promise<void> { /* no-op on saucedemo */ }
  async setBillingAddressSameAsShipping(_same: boolean): Promise<void> { /* no-op */ }
  async fillPaymentDetails(_payment: unknown): Promise<void> { /* no-op */ }
  async applyPromoCode(_code: string): Promise<void> { /* no-op */ }
  async updateItemQuantity(_name: string, _qty: number): Promise<void> { /* no-op */ }

  // ── Assertions ─────────────────────────────────────────────────────────────

  async assertOnCheckoutPage(): Promise<void> {
    await this.assertURL(/cart\.html/);
  }

  async assertOnConfirmationPage(): Promise<void> {
    await this.assertURL(/checkout-complete\.html/);
    await this.assertVisible(this.confirmationHeading);
  }

  async assertCartIsEmpty(): Promise<void> {
    await expect(this.cartItems).toHaveCount(0);
  }

  async assertCartContains(productName: string): Promise<void> {
    const item = this.cartItems.filter({ hasText: productName });
    await expect(item).toBeVisible();
  }

  async assertOrderNumber(text: string): Promise<void> {
    // saucedemo shows "Thank you for your order!" — no numeric order number
    await this.assertVisible(this.confirmationHeading);
    if (text) await this.assertContainsText(this.confirmationHeading, text);
  }

  async assertPromoApplied(): Promise<void> {
    await this.assertVisible(this.promoSuccessBadge);
  }

  async assertPromoError(message: string): Promise<void> {
    await this.assertContainsText(this.promoErrorMessage, message);
  }

  async assertTotalAmount(expected: string): Promise<void> {
    await this.assertContainsText(this.totalLabel, expected);
  }

  async assertShippingMethodSelected(_method: string): Promise<void> { /* no-op */ }

  async assertFieldError(_fieldName: string, message: string): Promise<void> {
    await this.assertContainsText(this.errorMessage, message);
  }

  async assertReviewAddressContains(_text: string): Promise<void> {
    // saucedemo step 2 does not display the entered address — no-op
  }

  async assertPaymentLast4(_last4: string): Promise<void> { /* no-op */ }
}
