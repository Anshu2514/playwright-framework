/**
 * pages/homePage.ts
 *
 * Page Object for https://www.saucedemo.com/inventory.html
 *
 * saucedemo does NOT have a search box.  "Search" in this context means
 * filtering/finding products by name within the inventory grid.
 * The sort dropdown is the only built-in filter control.
 *
 * Verified locators (Jan 2025):
 *   Product cards   → .inventory_item
 *   Product name    → .inventory_item_name
 *   Product price   → .inventory_item_price
 *   Add to cart btn → [data-test="add-to-cart-<slug>"]
 *   Sort dropdown   → [data-test="product_sort_container"]
 *   Cart icon link  → .shopping_cart_link
 *   Cart badge      → .shopping_cart_badge
 *   Burger menu     → #react-burger-menu-btn
 */

import { type Page, type Locator, expect } from "@playwright/test";
import { BasePage } from "./basePage";

export interface ProductCard {
  name:    string;
  price:   number;   // numeric — "$29.99" → 29.99
  inStock: boolean;
}

// saucedemo sort values match the <option value="…"> attributes
export type SortOption = "az" | "za" | "lohi" | "hilo";

export class HomePage extends BasePage {
  // ── Header ─────────────────────────────────────────────────────────────────

  readonly cartIcon:  Locator;
  readonly cartBadge: Locator;
  readonly burgerMenu: Locator;

  // ── Inventory ──────────────────────────────────────────────────────────────

  readonly inventoryList:  Locator;
  readonly productCards:   Locator;
  readonly sortDropdown:   Locator;

  // ── Parameterised locators ─────────────────────────────────────────────────

  /** Find a product card by its visible name text. */
  readonly productCard: (name: string) => Locator;

  /** "Add to cart" button for a product by its data-test slug
   *  e.g. "sauce-labs-backpack" → data-test="add-to-cart-sauce-labs-backpack" */
  readonly addToCartButton: (slug: string) => Locator;

  /** "Remove" button after an item is added to the cart */
  readonly removeButton: (slug: string) => Locator;

  // ── Search input (only available on automationexercise.com / staging) ──────
  //
  // saucedemo has no search box.  We expose the locator anyway so the same
  // test file works against both environments — tests skip or guard on env.
  readonly searchInput:  Locator;
  readonly searchButton: Locator;
  readonly productGrid:  Locator;    // alias for inventoryList

  constructor(page: Page) {
    super(page);

    // Header
    this.cartIcon   = page.locator(".shopping_cart_link");
    this.cartBadge  = page.locator(".shopping_cart_badge");
    this.burgerMenu = page.locator("#react-burger-menu-btn");

    // Inventory
    this.inventoryList = page.locator(".inventory_list");
    this.productCards  = page.locator(".inventory_item");
    this.sortDropdown  = page.locator('.product_sort_container');

    // Parameterised
    this.productCard = (name) =>
      page.locator(".inventory_item").filter({
        has: page.locator(".inventory_item_name", { hasText: name }),
      });

    this.addToCartButton = (slug) =>
      page.locator(`[data-test="add-to-cart-${slug}"]`);

    this.removeButton = (slug) =>
      page.locator(`[data-test="remove-${slug}"]`);

    // automationexercise.com compatibility aliases
    this.searchInput = page.locator("#search_product");
    this.searchButton = page.locator("#submit_search");
    this.productGrid  = this.inventoryList;
  }

  // ── Navigation ─────────────────────────────────────────────────────────────

  async goto(): Promise<void> {
    await this.navigate("/inventory.html");
    await this.waitForVisible(this.inventoryList);
  }

  async goToCart(): Promise<void> {
    await this.click(this.cartIcon);
    await this.waitForPageLoad();
  }

  // ── Sort ───────────────────────────────────────────────────────────────────

  /**
   * Sort the inventory using the dropdown.
   * @param option  "az" | "za" | "lohi" | "hilo"
   */
  async sortBy(option: SortOption): Promise<void> {
    // Wait for attachment (in DOM) rather than visibility — saucedemo's
    // <select> is sometimes flagged not-visible by Playwright due to its
    // custom CSS styling, even though it's fully interactive.
    await this.sortDropdown.waitFor({ state: "attached" });
    await this.selectOption(this.sortDropdown, option);
    // Sorting is synchronous on saucedemo (no network call)
    await this.page.waitForTimeout(300);
  }

  // ── Search (delegates to name-based filter on saucedemo) ───────────────────

  /**
   * On saucedemo: scrolls to and highlights the matching card (no search box).
   * On automationexercise.com: uses the real search input.
   */
  async searchFor(query: string): Promise<void> {
    const isSaucedemo = this.page.url().includes("saucedemo.com");

    if (isSaucedemo) {
      // Filter client-side: just wait for the card to be visible
      await this.waitForVisible(this.productCard(query).first().or(this.inventoryList));
    } else {
      await this.fill(this.searchInput, query);
      await this.click(this.searchButton);
      await this.waitForVisible(this.productGrid);
    }
  }

  async searchForByEnter(query: string): Promise<void> {
    await this.fill(this.searchInput, query);
    await this.pressKey("Enter");
    await this.waitForVisible(this.productGrid);
  }

  // ── Cart interactions ──────────────────────────────────────────────────────

  /**
   * Add a product to the cart by its data-test slug.
   *
   * saucedemo slugs are the kebab-case product names:
   *   "Sauce Labs Backpack" → "sauce-labs-backpack"
   *
   * @example  await home.addToCart("sauce-labs-backpack");
   */
  async addToCart(slug: string): Promise<void> {
    await this.click(this.addToCartButton(slug));
    // Badge appears / increments immediately (no network call on saucedemo)
  }

  /**
   * Add the product at zero-based grid position `index` to the cart.
   * Extracts the slug from the button's data-test attribute automatically.
   */
  async addToCartByIndex(index: number): Promise<void> {
    const card = this.productCards.nth(index);
    await this.scrollIntoView(card);
    const btn = card.locator("button.btn_inventory");
    await this.click(btn);
  }

  /**
   * Add a product by its exact visible name.
   * Extracts the slug from the "Add to cart" button inside the matching card.
   */
  async addToCartByName(productName: string): Promise<void> {
    const card = this.productCard(productName);
    await this.scrollIntoView(card);
    const btn = card.locator("button.btn_inventory");
    await this.click(btn);
  }

  async removeFromCart(slug: string): Promise<void> {
    await this.click(this.removeButton(slug));
  }

  async openProduct(productName: string): Promise<void> {
    await this.click(
      this.productCard(productName).locator(".inventory_item_name"),
    );
    await this.waitForPageLoad();
  }

  // ── Data extraction ────────────────────────────────────────────────────────

  /**
   * Scrape every visible product card into a typed array.
   * Used by sort-order tests to compare price arrays.
   */
  async getProductCards(): Promise<ProductCard[]> {
    const cards = await this.productCards.all();
    return Promise.all(
      cards.map(async (card): Promise<ProductCard> => {
        const name  = (await card.locator(".inventory_item_name").textContent()) ?? "";
        const priceText = (await card.locator(".inventory_item_price").textContent()) ?? "0";
        const price = parseFloat(priceText.replace(/[^0-9.]/g, ""));
        const btnText   = (await card.locator("button.btn_inventory").textContent()) ?? "";
        const inStock   = !btnText.toLowerCase().includes("remove");
        return { name: name.trim(), price, inStock };
      }),
    );
  }

  async getCartItemCount(): Promise<number> {
    const visible = await this.cartBadge.isVisible();
    if (!visible) return 0;
    const text = await this.cartBadge.textContent();
    return parseInt(text ?? "0", 10);
  }

  /** Returns the count of currently visible product cards. */
  async getResultCount(): Promise<number> {
    return this.productCards.count();
  }

  // ── Assertions ─────────────────────────────────────────────────────────────

  async assertOnHomePage(): Promise<void> {
    await this.assertURL("/inventory.html");
    await this.assertVisible(this.inventoryList);
  }

  async assertProductVisible(productName: string): Promise<void> {
    await this.assertVisible(this.productCard(productName));
  }

  async assertCartBadgeCount(expected: number): Promise<void> {
    if (expected === 0) {
      await expect(this.cartBadge).toBeHidden();
    } else {
      await expect(this.cartBadge).toHaveText(String(expected));
    }
  }

  async assertNoResults(): Promise<void> {
    await expect(this.productCards).toHaveCount(0);
  }

  // Stubs to keep fixture code compatible
  async assertSuggestionsVisible(): Promise<void> {
    // No autocomplete on saucedemo — no-op
  }

  async clearSearch(): Promise<void> {
    await this.fill(this.searchInput, "");
  }

  async assertVisible(locator: Locator): Promise<void> {
    await expect(locator).toBeVisible();
  }

  async assertHidden(locator: Locator): Promise<void> {
    await expect(locator).toBeHidden();
  }
}
