/**
 * tests/data/testData.ts
 *
 * All test data tied to the two real public demo sites:
 *
 *   UI tests  → https://www.saucedemo.com
 *   API tests → https://automationexercise.com/api
 *
 * ── saucedemo.com accounts ────────────────────────────────────────────────────
 *
 *  standard_user         / secret_sauce  → normal shopper ✓
 *  locked_out_user       / secret_sauce  → login always rejected ✓
 *  problem_user          / secret_sauce  → broken product images
 *  performance_glitch_user / secret_sauce → intentionally slow
 *
 * ── saucedemo.com products (fixed catalogue, never changes) ──────────────────
 *
 *  Sauce Labs Backpack          $29.99
 *  Sauce Labs Bike Light        $9.99
 *  Sauce Labs Bolt T-Shirt      $15.99
 *  Sauce Labs Fleece Jacket     $49.99
 *  Sauce Labs Onesie            $7.99
 *  Test.allTheThings() T-Shirt  $15.99
 */

// ── Auth ──────────────────────────────────────────────────────────────────────

export const credentials = {
  /** Standard shopper — full access, happy-path tests */
  validUser: {
    username:    "standard_user",
    password:    "secret_sauce",
    displayName: "standard_user",
  },

  /** Admin account — saucedemo has no admin role; reuse standard for API tests */
  adminUser: {
    username:    "standard_user",
    password:    "secret_sauce",
    displayName: "standard_user",
  },

  invalidUsers: {
    /** Valid username, wrong password */
    wrongPassword: {
      username:      "standard_user",
      password:      "wrong_password",
      expectedError: "Epic sadface: Username and password do not match any user in this service",
    },
    /** Account that is always locked out by the server */
    lockedOut: {
      username:      "locked_out_user",
      password:      "secret_sauce",
      expectedError: "Epic sadface: Sorry, this user has been locked out.",
    },
    /** Completely unknown username */
    unknownEmail: {
      username:      "nobody_user",
      password:      "secret_sauce",
      expectedError: "Epic sadface: Username and password do not match any user in this service",
    },
    /** Both fields empty */
    emptyCredentials: {
      username:      "",
      password:      "",
      usernameError: "Epic sadface: Username is required",
      passwordError: "Epic sadface: Password is required",
    },
  },
} as const;

// ── Products (saucedemo.com fixed catalogue) ──────────────────────────────────

export const products = {
  backpack: {
    name:        "Sauce Labs Backpack",
    searchQuery: "Sauce Labs Backpack",   // used by addToCartByName helpers
    price:       "$29.99",
    dataTestId:  "sauce-labs-backpack",
    inStock:     true,
  },
  bikeLight: {
    name:        "Sauce Labs Bike Light",
    searchQuery: "Sauce Labs Bike Light",
    price:       "$9.99",
    dataTestId:  "sauce-labs-bike-light",
    inStock:     true,
  },
  boltTShirt: {
    name:        "Sauce Labs Bolt T-Shirt",
    searchQuery: "Sauce Labs Bolt T-Shirt",
    price:       "$15.99",
    dataTestId:  "sauce-labs-bolt-t-shirt",
    inStock:     true,
  },
  fleeceJacket: {
    name:        "Sauce Labs Fleece Jacket",
    searchQuery: "Sauce Labs Fleece Jacket",
    price:       "$49.99",
    dataTestId:  "sauce-labs-fleece-jacket",
    inStock:     true,
  },
  /** Alias used by fixtures/pageFixtures.ts — points to the cheapest item */
  headphones: {
    name:        "Sauce Labs Bike Light",
    searchQuery: "Sauce Labs Bike Light",
    price:       "$9.99",
    dataTestId:  "sauce-labs-bike-light",
    inStock:     true,
  },
  /** Alias for the most expensive item */
  laptop: {
    name:        "Sauce Labs Fleece Jacket",
    searchQuery: "Sauce Labs Fleece Jacket",
    price:       "$49.99",
    dataTestId:  "sauce-labs-fleece-jacket",
    inStock:     true,
  },
  /**
   * saucedemo has no out-of-stock items — we simulate this in API mocks only.
   * For UI tests that need an "out-of-stock" item, use this as a mock fixture.
   */
  outOfStock: {
    name:        "Out Of Stock Widget",
    searchQuery: "Out Of Stock Widget",
    price:       "$0.00",
    dataTestId:  "out-of-stock-widget",
    inStock:     false,
  },
} as const;

// ── Cart ──────────────────────────────────────────────────────────────────────

export const cart = {
  singleItem: {
    product:            products.backpack,
    quantity:           1,
    expectedBadgeCount: 1,
  },
  multipleItems: {
    products:           [products.backpack, products.bikeLight],
    expectedBadgeCount: 2,
  },
  updatedQuantity: 2,  // saucedemo doesn't support qty > 1 in cart, used in API mocks
} as const;

// ── Search ────────────────────────────────────────────────────────────────────
//
// saucedemo has no search box — its "sort" dropdown is the closest equivalent.
// These values are used in:
//   • homePage sort tests (saucedemo)
//   • automationexercise.com search tests (staging env)

export const search = {
  validQueries: {
    laptop: {
      query:      "Sauce Labs Fleece Jacket",
      minResults: 1,
    },
    headphones: {
      query:      "Sauce Labs Bike Light",
      minResults: 1,
    },
    keyboard: {
      query:      "Sauce Labs Backpack",
      minResults: 1,
    },
  },
  noResultsQuery: "zzznonexistentitem999",
  autocomplete: {
    partial:                  "Sauce",
    expectedSuggestionCount:  5,
    firstSuggestionText:      "Sauce Labs Backpack",
  },
  sortOptions: {
    nameAsc:   { value: "az"    as const, label: "Name (A to Z)"      },
    nameDesc:  { value: "za"    as const, label: "Name (Z to A)"      },
    priceAsc:  { value: "lohi"  as const, label: "Price (low to high)" },
    priceDesc: { value: "hilo"  as const, label: "Price (high to low)" },
  },
  filters: {
    priceRange: { min: 10, max: 30 },
    category:   "Clothing",
  },
} as const;

// ── Shipping ──────────────────────────────────────────────────────────────────
//
// saucedemo checkout only asks for First Name, Last Name, Zip/Postal Code.
// The remaining fields are used in API mocks and automationexercise.com tests.

export const shipping = {
  primary: {
    firstName:    "Alice",
    lastName:     "Thornton",
    zipCode:      "62701",
    // Extended fields for automationexercise.com / API mocks
    email:        "alice.thornton@testmail.com",
    phone:        "555-0101",
    addressLine1: "742 Evergreen Terrace",
    addressLine2: "Apt 12",
    city:         "Springfield",
    state:        "IL",
    country:      "US",
  },
  alternate: {
    firstName:    "Bob",
    lastName:     "Callaghan",
    zipCode:      "20500",
    email:        "bob.callaghan@testmail.com",
    phone:        "555-0202",
    addressLine1: "1600 Pennsylvania Ave NW",
    addressLine2: "",
    city:         "Washington",
    state:        "DC",
    country:      "US",
  },
  incomplete: {
    firstName:    "",
    lastName:     "",
    zipCode:      "",
    email:        "bad-email",
    phone:        "",
    addressLine1: "",
    city:         "",
    state:        "",
    country:      "US",
    expectedErrors: {
      firstName:   "Error: First Name is required",
      lastName:    "Error: Last Name is required",
      zipCode:     "Error: Postal Code is required",
      // Extended errors for automationexercise mock
      addressLine1: "Street address is required.",
      city:         "City is required.",
      email:        "Please enter a valid email address.",
    },
  },
} as const;

// ── Payment ───────────────────────────────────────────────────────────────────
//
// saucedemo does NOT have a payment step — checkout completes after the
// shipping form.  These card fixtures are used in API mocks only.

export const payment = {
  validVisa: {
    cardNumber:  "4111111111111111",
    cardHolder:  "Alice Thornton",
    expiryMonth: "12",
    expiryYear:  "2027",
    cvv:         "123",
    last4:       "1111",
  },
  validMastercard: {
    cardNumber:  "5500005555555559",
    cardHolder:  "Alice Thornton",
    expiryMonth: "08",
    expiryYear:  "2026",
    cvv:         "456",
    last4:       "5559",
  },
  declined: {
    cardNumber:    "4000000000000002",
    cardHolder:    "Alice Thornton",
    expiryMonth:   "12",
    expiryYear:    "2027",
    cvv:           "123",
    expectedError: "Your card was declined.",
  },
  invalidFormat: {
    cardNumber:    "1234567890123456",
    cardHolder:    "Alice Thornton",
    expiryMonth:   "12",
    expiryYear:    "2027",
    cvv:           "123",
    expectedError: "Please enter a valid card number.",
  },
} as const;

// ── Promo codes (API mock only — saucedemo has no promo system) ───────────────

export const promoCodes = {
  valid:      { code: "SAVE10",    discountLabel: "10% off",  discountType: "percentage" as const, discountValue: 10 },
  validFixed: { code: "FLAT5",     discountLabel: "$5 off",   discountType: "fixed"      as const, discountValue: 5  },
  expired:    { code: "SUMMER23",  expectedError: "This promo code has expired."   },
  unknown:    { code: "FAKE999",   expectedError: "Promo code not found."          },
} as const;

// ── Shipping methods (API mock only — saucedemo has no shipping step) ─────────

export const shippingMethods = {
  standard:  { value: "standard"  as const, label: "Standard Shipping", price: "$4.99"  },
  express:   { value: "express"   as const, label: "Express Shipping",  price: "$12.99" },
  overnight: { value: "overnight" as const, label: "Overnight",         price: "$24.99" },
} as const;

// ── Routes ────────────────────────────────────────────────────────────────────
//
// saucedemo uses .html suffixes on all routes except the root login page.

export const routes = {
  login:             "/",                         // saucedemo root IS the login page
  home:              "/inventory.html",           // product inventory
  cart:              "/cart.html",
  checkoutStep1:     "/checkout-step-one.html",
  checkoutStep2:     "/checkout-step-two.html",
  checkoutComplete:  "/checkout-complete.html",
  forgotPassword:    "/forgot-password",          // not on saucedemo — API mock only
  account:           "/account",
  orderConfirmation: /checkout-complete\.html/,
} as const;
