/**
 * tests/e2e/checkout.spec.ts
 *
 * Real end-to-end checkout tests against https://www.saucedemo.com
 *
 * saucedemo checkout steps:
 *   /cart.html              → review cart
 *   /checkout-step-one.html → first name / last name / zip
 *   /checkout-step-two.html → overview (no payment form)
 *   /checkout-complete.html → confirmation "Thank you for your order!"
 *
 * Run:  npx playwright test tests/e2e/checkout.spec.ts --headed
 */

import { test, expect } from "../../fixtures";
import { shipping, products } from "../data/testData";
import { CheckoutPage } from "../../pages/checkoutPage";

test.describe("Checkout — saucedemo.com", () => {

  // The cartWithItem fixture authenticates and adds Sauce Labs Backpack
  // (deterministic — not affected by sort order).

  // ── Cart review ───────────────────────────────────────────────────────────

  test("cart shows the pre-added item", async ({ cartWithItem }) => {
    const summary = await cartWithItem.getOrderSummary();
    expect(summary.items.length).toBeGreaterThanOrEqual(1);
    expect(summary.items[0].name).toBe(products.backpack.name);
  });

  test("cart page title is 'Swag Labs'", async ({ cartWithItem, page }) => {
    void cartWithItem;
    await expect(page).toHaveTitle("Swag Labs");
  });

  test("cart shows a non-zero item total on the overview step", async ({
    cartWithItem,
  }) => {
    await cartWithItem.proceedToShipping();
    await cartWithItem.fillShippingAddress(shipping.primary);
    await cartWithItem.proceedToShippingMethod();    // → step 2

    const summary = await cartWithItem.getOrderSummary();
    const total = parseFloat(summary.total.replace(/[^0-9.]/g, ""));
    expect(total).toBeGreaterThan(0);
  });

  test("removing the item from the cart empties it", async ({
    cartWithItem,
  }) => {
    await cartWithItem.removeItem(products.backpack.name);
    await cartWithItem.assertCartIsEmpty();
  });

  // ── Shipping form validation ───────────────────────────────────────────────

  test("submitting empty shipping form shows First Name error", async ({
    cartWithItem,
  }) => {
    await cartWithItem.proceedToShipping();
    await cartWithItem.click(cartWithItem.continueButton);
    await cartWithItem.assertFieldError(
      "firstName",
      shipping.incomplete.expectedErrors.firstName,
    );
  });

  test("only zip missing shows Postal Code error", async ({ cartWithItem }) => {
    await cartWithItem.proceedToShipping();
    await cartWithItem.fill(cartWithItem.firstNameInput, "Alice");
    await cartWithItem.fill(cartWithItem.lastNameInput, "Thornton");
    // zip intentionally left blank
    await cartWithItem.click(cartWithItem.continueButton);
    await cartWithItem.assertFieldError(
      "zipCode",
      shipping.incomplete.expectedErrors.zipCode,
    );
  });

  // ── Step 2 — Order overview ────────────────────────────────────────────────

  test("overview step shows the item name", async ({ cartWithItem }) => {
    await cartWithItem.proceedToShipping();
    await cartWithItem.fillShippingAddress(shipping.primary);
    await cartWithItem.proceedToShippingMethod();

    const summary = await cartWithItem.getOrderSummary();
    expect(summary.items.length).toBeGreaterThan(0);
    expect(summary.items[0].name).toBe(products.backpack.name);
  });

  test("overview step shows subtotal, tax, and total labels", async ({
    cartWithItem,
  }) => {
    await cartWithItem.proceedToShipping();
    await cartWithItem.fillShippingAddress(shipping.primary);
    await cartWithItem.proceedToShippingMethod();

    await expect(cartWithItem.itemTotal).toBeVisible();
    await expect(cartWithItem.taxLabel).toBeVisible();
    await expect(cartWithItem.totalLabel).toBeVisible();
  });

  // ── Full happy-path ───────────────────────────────────────────────────────

  test("full checkout completes and shows confirmation page", async ({
    cartWithItem,
    page,
  }) => {
    const heading = await cartWithItem.completeCheckout(shipping.primary);

    await expect(page).toHaveURL(/checkout-complete\.html/);
    expect(heading).toMatch(/thank you/i);
    await expect(cartWithItem.confirmationHeading).toBeVisible();
  });

  test("confirmation page shows the thank-you subheading", async ({
    cartWithItem,
  }) => {
    await cartWithItem.completeCheckout(shipping.primary);
    await expect(cartWithItem.confirmationSubheading).toBeVisible();
  });

  test("back-to-products button returns to inventory after order", async ({
    cartWithItem,
    page,
  }) => {
    await cartWithItem.completeCheckout(shipping.primary);
    await cartWithItem.click(cartWithItem.backToHomeButton);
    await expect(page).toHaveURL(/inventory\.html/);
  });

  test("cart badge is gone after completing an order", async ({
    cartWithItem,
    page,
  }) => {
    await cartWithItem.completeCheckout(shipping.primary);
    await cartWithItem.click(cartWithItem.backToHomeButton);
    await expect(page.locator(".shopping_cart_badge")).toBeHidden();
  });

  // ── Multiple items ────────────────────────────────────────────────────────

  test("adding two items shows both on the overview step", async ({
    authenticatedHome,
    page,
  }) => {
    // Add two specific products (named, not by index — order-independent)
    await authenticatedHome.addToCart("sauce-labs-backpack");
    await authenticatedHome.addToCart("sauce-labs-bike-light");
    await authenticatedHome.assertCartBadgeCount(2);

    await authenticatedHome.goToCart();

    const co = new CheckoutPage(page);
    await co.proceedToShipping();
    await co.fillShippingAddress(shipping.primary);
    await co.proceedToShippingMethod();

    const summary = await co.getOrderSummary();
    expect(summary.items.length).toBe(2);
  });
});
