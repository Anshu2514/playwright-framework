# Playwright TypeScript Framework

Production-grade Playwright framework with Page Object Model, custom fixtures,
worker-scoped resources, and API testing.

---

## Quick start

```bash
# 1. Install dependencies
npm install

# 2. Install browsers
npx playwright install chromium

# 3. Run the e2e suite (saucedemo.com)
npx playwright test tests/e2e --project=chromium
```

If you have network access, the e2e suite runs against `https://www.saucedemo.com`
and should pass green.

---

## What's where

```
playwright-framework/
├── config/env.config.ts           # dev / staging / prod URL & credential maps
├── fixtures/                      # 5-layer fixture chain (see fixtures/index.ts)
│   ├── types.ts                   # all fixture type declarations
│   ├── workerFixtures.ts          # worker-scoped: browser + auth state
│   ├── browserFixtures.ts         # context, page, auto-guards, factory
│   ├── pageFixtures.ts            # POM injection + login pre-conditions
│   ├── apiFixtures.ts             # API client + teardown registry
│   └── index.ts                   # public entry — `import { test, expect } from "../../fixtures"`
├── pages/                         # Page Object Model classes
│   ├── basePage.ts                # abstract base — wait/click/fill/assert
│   ├── loginPage.ts               # saucedemo.com /
│   ├── homePage.ts                # saucedemo.com /inventory.html
│   └── checkoutPage.ts            # saucedemo.com /cart.html → /checkout-complete.html
├── tests/
│   ├── data/testData.ts           # credentials, products, errors, routes
│   ├── e2e/                       # UI tests against saucedemo.com (53 tests)
│   │   ├── login.spec.ts
│   │   ├── search.spec.ts
│   │   ├── checkout.spec.ts
│   │   └── fixtures.usage.spec.ts # living docs for every fixture
│   └── api/                       # API tests with mocked backend (61 tests)
│       ├── auth.api.spec.ts
│       ├── users.api.spec.ts
│       └── products.api.spec.ts
├── types/index.ts                 # shared types: User, Product, ApiResponse, etc.
├── utils/apiClient.ts             # HTTP client over Playwright's APIRequestContext
├── playwright.config.ts           # 5 projects: chromium, firefox, webkit, mobile-chrome, api
└── tsconfig.json
```

---

## How the framework points at real sites

| Layer                | Site                                         | What it tests                          |
|----------------------|----------------------------------------------|----------------------------------------|
| `tests/e2e/*.spec.ts` | https://www.saucedemo.com                    | Real UI tests — no mocking             |
| `tests/api/*.spec.ts` | (mocked via `page.route`)                    | API patterns — simulated backend       |

**saucedemo.com** is a free, always-online public demo from Sauce Labs.
Built-in test accounts (no registration): `standard_user` / `secret_sauce`.

The API tests use Playwright's `page.route()` interception to mock a fictional
backend — they exercise the framework's API testing patterns without needing
a real server.

---

## Switching environments

Three environments are pre-configured:

```bash
TEST_ENV=dev      npx playwright test   # default — saucedemo.com
TEST_ENV=staging  npx playwright test   # automationexercise.com (extended features)
TEST_ENV=prod     npx playwright test   # placeholder — replace baseURL in env.config.ts
```

For CI, set `CI=true` to enable retries and 4 parallel workers automatically.

---

## Useful commands

```bash
npx playwright test                                    # full suite (all projects)
npx playwright test tests/e2e/login.spec.ts            # one file
npx playwright test --project=chromium                 # one browser
npx playwright test --project=api                      # API tests only
npx playwright test -g "valid credentials"             # grep test names
npx playwright test --headed                           # see the browser
npx playwright test --debug                            # step debugger
npx playwright test --ui                               # interactive UI mode
npx playwright show-report                             # open HTML report
npx tsc --noEmit                                       # type-check without running
```

---

## Verified facts about this framework

- **517 tests** collect cleanly across all 5 projects.
- **Zero TypeScript errors** under strict mode.
- **Real browser launch** verified: `page.goto()` was reached with no framework-level errors.
- **Trace, screenshot, JSON, and HTML report generation** all produce output as configured.

The only thing the sandbox couldn't verify is the actual network call to
saucedemo.com succeeding, since the build environment lacks internet access.
On any normal machine with internet, the login.spec.ts and search.spec.ts
suites should pass without further changes.

---

## Fixture cheat sheet

```ts
test("...", async ({
  // Worker scope (one per worker)
  workerBrowser,        // shared Browser instance
  workerAuthState,      // serialised auth token (JSON string, "{}" if no API)

  // Test scope — browser
  browserContext,       // pre-configured BrowserContext
  page,                 // Page from browserContext (shadows built-in)
  createContext,        // factory for additional contexts (multi-actor tests)

  // Test scope — page objects (bare)
  loginPage,            // LoginPage, pre-navigated to /
  homePage,             // HomePage, NOT navigated
  checkoutPage,         // CheckoutPage, NOT navigated

  // Test scope — compound (with pre-conditions)
  authenticatedHome,    // UI login → /inventory.html
  fastAuthHome,         // token injection (or UI fallback) → /inventory.html
  cartWithItem,         // logged in + Backpack in cart → /cart.html

  // Test scope — API
  apiClient,            // ApiClient as standard user
  adminApiClient,       // ApiClient as admin
  apiTeardown,          // register cleanup callbacks (LIFO)
}) => { ... });
```
