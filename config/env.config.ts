/**
 * config/env.config.ts
 *
 * ── Real demo sites used ─────────────────────────────────────────────────────
 *
 *  UI tests  → https://www.saucedemo.com          (Sauce Labs demo shop)
 *              Always-on, no registration, fixed test credentials below.
 *
 *  API tests → https://automationexercise.com/api  (public REST API)
 *              No auth required for most endpoints.
 *
 * ── Environments ─────────────────────────────────────────────────────────────
 *
 *  dev      → saucedemo.com     (default, runs with no env vars)
 *  staging  → automationexercise.com  (more features: search, categories)
 *  prod     → saucedemo.com     (same as dev — placeholder for real prod URL)
 *
 * ── Switching environment ─────────────────────────────────────────────────────
 *
 *  TEST_ENV=staging npx playwright test
 *  TEST_ENV=dev     npx playwright test   (default)
 */

export type Environment = "dev" | "staging" | "prod";

export interface EnvConfig {
  /** Base URL for all page.goto() / navigate() calls */
  baseURL: string;
  /** Base URL used by ApiClient for REST calls */
  apiBaseURL: string;
  credentials: {
    username: string;
    password: string;
  };
}

const configs: Record<Environment, EnvConfig> = {

  // ── dev: Sauce Labs demo shop ──────────────────────────────────────────────
  //
  //  URL    : https://www.saucedemo.com
  //  Login  : /  (the root IS the login page on saucedemo)
  //  Inventory: /inventory.html
  //  Cart   : /cart.html
  //  Checkout: /checkout-step-one.html → step-two → complete.html
  //
  //  Built-in accounts (no registration needed):
  //   standard_user   / secret_sauce  ← happy-path user  ✓
  //   locked_out_user / secret_sauce  ← always rejected  ✓
  //   problem_user    / secret_sauce  ← broken images
  //   performance_glitch_user / secret_sauce ← slow responses
  //
  //  API base: automationexercise.com (saucedemo has no public API)

  dev: {
    baseURL:    "https://www.saucedemo.com",
    apiBaseURL: "https://automationexercise.com/api",
    credentials: {
      username: process.env["DEV_USER"] ?? "standard_user",
      password: process.env["DEV_PASS"] ?? "secret_sauce",
    },
  },

  // ── staging: Automation Exercise ──────────────────────────────────────────
  //
  //  URL    : https://automationexercise.com
  //  Login  : /login
  //  Products: /products (with search)
  //  Cart   : /cart
  //  Checkout: /checkout
  //  API    : /api/productsList, /api/getUserByEmail, etc.
  //
  //  Note: you must register an account at automationexercise.com and set
  //  STAGING_USER / STAGING_PASS in your .env file — no public accounts.

  staging: {
    baseURL:    "https://automationexercise.com",
    apiBaseURL: "https://automationexercise.com/api",
    credentials: {
      username: process.env["STAGING_USER"] ?? "your-registered-email@example.com",
      password: process.env["STAGING_PASS"] ?? "your-password",
    },
  },

  // ── prod: placeholder (replace with your real production URL) ─────────────
  prod: {
    baseURL:    process.env["PROD_URL"]      ?? "https://www.saucedemo.com",
    apiBaseURL: process.env["PROD_API_URL"]  ?? "https://automationexercise.com/api",
    credentials: {
      username: process.env["PROD_USER"] ?? "",
      password: process.env["PROD_PASS"] ?? "",
    },
  },
};

export function getEnvConfig(): EnvConfig {
  const env = (process.env["TEST_ENV"] as Environment) ?? "dev";
  const config = configs[env];
  if (!config) {
    throw new Error(
      `Unknown TEST_ENV="${env}". Valid values: dev | staging | prod`,
    );
  }
  return config;
}

export function getEnv(): Environment {
  return (process.env["TEST_ENV"] as Environment) ?? "dev";
}
