/**
 * tests/e2e/search.spec.ts
 *
 * saucedemo has no search box — "searching" here means sorting the
 * inventory and verifying the displayed order.
 *
 * Run:  npx playwright test tests/e2e/search.spec.ts --headed
 */

import { test, expect } from "../../fixtures";
import { search, products } from "../data/testData";

test.describe("Inventory (sort & cart) — saucedemo.com", () => {

  test.beforeEach(async ({ authenticatedHome }) => {
    // authenticatedHome fixture handles login and lands on /inventory.html
    void authenticatedHome;
  });

  // ── Inventory renders ─────────────────────────────────────────────────────

  test("inventory page shows 6 products", async ({ authenticatedHome }) => {
    await authenticatedHome.assertElementCount(
      authenticatedHome.productCards, 6,
    );
  });

  test("all known products are visible", async ({ authenticatedHome }) => {
    await authenticatedHome.assertProductVisible(products.backpack.name);
    await authenticatedHome.assertProductVisible(products.bikeLight.name);
    await authenticatedHome.assertProductVisible(products.boltTShirt.name);
    await authenticatedHome.assertProductVisible(products.fleeceJacket.name);
  });

  // ── Sort ──────────────────────────────────────────────────────────────────

  test("sort A→Z puts products in alphabetical order", async ({
    authenticatedHome,
  }) => {
    await authenticatedHome.sortBy(search.sortOptions.nameAsc.value);
    const cards = await authenticatedHome.getProductCards();
    const names = cards.map((c) => c.name);
    expect(names).toEqual([...names].sort());
  });

  test("sort Z→A puts products in reverse alphabetical order", async ({
    authenticatedHome,
  }) => {
    await authenticatedHome.sortBy(search.sortOptions.nameDesc.value);
    const cards = await authenticatedHome.getProductCards();
    const names = cards.map((c) => c.name);
    expect(names).toEqual([...names].sort().reverse());
  });

  test("sort price low→high orders cheapest first", async ({
    authenticatedHome,
  }) => {
    await authenticatedHome.sortBy(search.sortOptions.priceAsc.value);
    const cards  = await authenticatedHome.getProductCards();
    const prices = cards.map((c) => c.price);
    expect(prices).toEqual([...prices].sort((a, b) => a - b));
  });

  test("sort price high→low orders most expensive first", async ({
    authenticatedHome,
  }) => {
    await authenticatedHome.sortBy(search.sortOptions.priceDesc.value);
    const cards  = await authenticatedHome.getProductCards();
    const prices = cards.map((c) => c.price);
    expect(prices).toEqual([...prices].sort((a, b) => b - a));
  });

  // ── Cart ──────────────────────────────────────────────────────────────────

  test("adding first product increments cart badge to 1", async ({
    authenticatedHome,
  }) => {
    await authenticatedHome.addToCartByIndex(0);
    await authenticatedHome.assertCartBadgeCount(1);
  });

  test("adding two products increments cart badge to 2", async ({
    authenticatedHome,
  }) => {
    await authenticatedHome.addToCartByIndex(0);
    await authenticatedHome.addToCartByIndex(1);
    await authenticatedHome.assertCartBadgeCount(2);
  });

  test("adding Sauce Labs Backpack by name increments badge", async ({
    authenticatedHome,
  }) => {
    await authenticatedHome.addToCartByName(products.backpack.name);
    await authenticatedHome.assertCartBadgeCount(1);
  });

  test("clicking a product name navigates to the detail page", async ({
    authenticatedHome,
    page,
  }) => {
    await authenticatedHome.openProduct(products.backpack.name);
    await expect(page).toHaveURL(/inventory-item\.html/);
    await expect(page.locator(".inventory_details_name")).toContainText(
      products.backpack.name,
    );
  });

  test("cart icon navigates to /cart.html", async ({ authenticatedHome }) => {
    await authenticatedHome.goToCart();
    await authenticatedHome.assertURL(/cart\.html/);
  });
});
