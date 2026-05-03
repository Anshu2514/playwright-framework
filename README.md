# Playwright TypeScript Test Automation Framework

[![Playwright](https://img.shields.io/badge/Playwright-1.50+-2EAD33?logo=playwright&logoColor=white)](https://playwright.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.4+-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-18+-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![CI](https://img.shields.io/badge/GitHub_Actions-ready-2088FF?logo=github-actions&logoColor=white)](.github/workflows/playwright.yml)

Production-grade end-to-end and API test automation framework built on
Playwright with TypeScript.  Demonstrates **Page Object Model**, custom
**fixture composition**, **multi-environment configuration**, parallel
**sharded execution**, and full **CI/CD integration** — running against two
real public demo sites (`saucedemo.com` for UI, `automationexercise.com`
for API).

> **299 tests across 6 files**, 5 browser projects, 0 TypeScript errors.

---

## Tech stack

| Layer            | Technology                                                     |
|------------------|----------------------------------------------------------------|
| Test runner      | [Playwright Test](https://playwright.dev/) (`@playwright/test`) |
| Language         | TypeScript 5.4+ (strict mode)                                  |
| Runtime          | Node.js 18+                                                    |
| Browsers         | Chromium · Firefox · WebKit · Mobile Chrome (Pixel 5)          |
| API client       | Custom wrapper over Playwright's `APIRequestContext`           |
| CI/CD            | GitHub Actions (sharded matrix, blob report merging)           |
| Reporters        | list · html · json · junit · github (PR annotations)           |

---

## Quick start

```bash
# 1. Clone and install
git clone <repo-url>
cd playwright-framework
npm install

# 2. Install browsers
npx playwright install --with-deps

# 3. Run the full suite
npx playwright test
```

---

## How to run tests

```bash
# Full suite, all browser projects + API
npx playwright test

# By feature scope
npx playwright test tests/e2e          # UI tests against saucedemo.com
npx playwright test tests/api          # API tests against automationexercise.com

# By browser project
npx playwright test --project=chromium
npx playwright test --project=firefox
npx playwright test --project=mobile-chrome

# Single file or grep
npx playwright test tests/e2e/login.spec.ts
npx playwright test --grep "valid credentials"

# Interactive / debug modes
npx playwright test --headed           # visible browser
npx playwright test --debug            # step debugger
npx playwright test --ui               # interactive UI mode

# View reports
npx playwright show-report
```

---

## Framework structure

```
playwright-framework/
├── .github/workflows/playwright.yml   ← CI: sharded matrix + blob merge
├── config/
│   └── env.config.ts                  ← dev / staging / prod URL & credential maps
├── fixtures/                          ← 4-layer composable fixture chain
│   ├── types.ts                       ← all fixture type declarations
│   ├── workerFixtures.ts              ← worker-scoped: browser + auth state
│   ├── browserFixtures.ts             ← context, page, auto-guards, factory
│   ├── pageFixtures.ts                ← POM injection + login pre-conditions
│   ├── apiFixtures.ts                 ← API client + teardown registry
│   └── index.ts                       ← public entry point for tests
├── pages/                             ← Page Object Model
│   ├── basePage.ts                    ← abstract base (wait/click/fill/assert)
│   ├── loginPage.ts
│   ├── homePage.ts
│   └── checkoutPage.ts
├── tests/
│   ├── data/testData.ts               ← credentials, products, errors, routes
│   ├── e2e/                           ← UI tests (saucedemo.com)
│   │   ├── login.spec.ts
│   │   ├── search.spec.ts
│   │   ├── checkout.spec.ts
│   │   └── fixtures.usage.spec.ts     ← living docs for every fixture
│   └── api/                           ← API tests (automationexercise.com)
│       ├── products.api.spec.ts
│       └── users.api.spec.ts
├── types/index.ts                     ← shared types (User, Product, ApiResponse…)
├── utils/
│   ├── apiClient.ts                   ← typed HTTP client + assertions
│   ├── logger.ts                      ← structured 4-level logger
│   ├── helpers.ts                     ← retry, wait, data utilities
│   └── testData.ts                    ← test data factories
├── playwright.config.ts               ← 5 projects · parallel · multi-reporter
└── tsconfig.json
```

---

## Features

### Page Object Model
- All page classes extend an abstract `BasePage` providing reusable helpers
  for navigation, clicking, filling, waiting, and assertions.
- Locators declared once at construction time; actions are typed and
  composable.  Tests never touch raw selectors.

### Composable fixture chain
Tests import a single `test` symbol that carries every fixture in the chain:

```ts
test("...", async ({
  loginPage,        // pre-navigated to /
  authenticatedHome,// UI login → home
  fastAuthHome,     // token injection → home (faster)
  cartWithItem,     // logged-in + item in cart → checkout
  apiClient,        // typed HTTP client
  apiTeardown,      // LIFO cleanup registry
}) => { … });
```

Fixtures are split across worker, browser, page-object, and API layers
for clarity and easy extension.

### API testing without mocks
Custom `ApiClient` over Playwright's `APIRequestContext` provides:
- Typed `get<T>` / `post<T>` / `put<T>` / `patch<T>` / `delete<T>` (throw on non-2xx).
- Raw variants `getRaw<T>` / `postRaw<T>` / `postForm<T>` / `deleteForm<T>` that always resolve — for negative-path tests.
- Pluggable auth (Bearer · API-key · HTTP Basic).
- Built-in assertions: `assertStatus`, `assertSchema`, `assertHeader`, `assertMaxDuration`, `assertBodyContains`.
- Request interceptors and exponential-back-off retry on 429/5xx.

### Parallel sharded execution
- `fullyParallel: true` — every test runs in its own browser context.
- 4 workers on CI (configurable via `PW_WORKERS`).
- `test.describe.configure({ mode: "serial" })` for tests that share state.
- CI splits the e2e suite across 2 shards in parallel; blob reports are
  merged into a single HTML report.

### Smart retry strategy
- Global retries auto-enabled on CI, disabled locally.
- Per-project override (the API project gets +1 extra retry for the
  unreliable public demo).
- Per-block override for known-flaky tests:
  ```ts
  test.describe.configure({ retries: 5 });
  ```
- Trace, screenshot, and video captured on **first retry only** —
  zero overhead on green runs, full debugging detail on flaky ones.

### Multi-environment config
`TEST_ENV=dev|staging|prod` switches base URLs, credentials, and
behaviour without touching code.  Run-time metadata (environment, base
URL, CI flag) is embedded in every JSON and JUnit report for traceability.

### CI/CD-ready
- GitHub Actions workflow runs on push and pull request.
- Sharded matrix with parallel jobs for e2e and API.
- Blob reports merged into one unified HTML report at the end.
- Browser cache keyed on Playwright version — fast warm runs.
- All reports and failure artefacts uploaded; HTML retained 30 days.

### Comprehensive reporting
- **list** — concise console output.
- **html** — browseable per-test report with traces, screenshots, and videos.
- **json** — machine-readable for custom tooling.
- **junit** — CI integrations (Jenkins, GitLab, Azure DevOps).
- **github** — inline PR annotations on failed assertions.
- **structured logger** — 4 levels, timestamped, attachable to test reports.

---

## Why this framework is scalable

**Strict separation of concerns.** Locators live in page objects.
Test data lives in `tests/data/`.  Environment configuration lives in
`config/`.  Fixtures wire them together.  Tests stay declarative.
Adding a new feature touches at most three places: a new POM, new test
data, and a new spec file.

**Fixture composition over inheritance.**  The 4-layer fixture chain
(worker → browser → page → API) means new fixtures slot in without
disturbing existing ones.  Each layer's responsibilities are documented
in `fixtures/types.ts` — the canonical reference for what's available.

**Type-safe end-to-end.**  Every fixture, page object, API response, and
test data factory is typed.  TypeScript catches misuse at compile time —
not at 2 a.m. when a CI run fails.

**Parallel-first, serial-when-needed.**  Tests are isolated by default
via per-test browser contexts.  Shared resources opt into serial mode
explicitly.  No accidental coupling.

**Retry strategy without rot.**  Retries are layered (global → project
→ describe block) and traceable.  Each retry generates a trace so flake
sources are visible, not hidden.

**CI/CD as a first-class concern.**  The framework was designed assuming
CI from day one: deterministic startup, structured outputs, sharded
execution, and reports that downstream tools can consume.

---

## Cheat sheet — environment variables

| Variable                | Default     | Effect                                        |
|-------------------------|-------------|-----------------------------------------------|
| `TEST_ENV`              | `dev`       | Switch environment: `dev` / `staging` / `prod` |
| `DEV_USER` / `DEV_PASS` | saucedemo defaults | Override dev credentials               |
| `STAGING_USER` / `STAGING_PASS` | —   | Required for staging environment              |
| `PROD_URL` / `PROD_API_URL`     | —   | Production URL overrides                      |
| `PW_RETRIES`            | 0/2         | Override retry count for this run             |
| `PW_WORKERS`            | undef/4     | Override worker count                         |
| `PW_HEADED`             | `false`     | `true` runs with browser visible              |
| `LOG_LEVEL`             | `info`      | `debug` / `info` / `warn` / `error` / `silent` |
| `NO_COLOR`              | unset       | Set any value to disable ANSI colour codes    |
| `CI`                    | unset       | Set on CI: enables retries, 4 workers, no `.only` |
| `GITHUB_ACTIONS`        | unset       | Auto-enables inline PR annotation reporter    |
| `TEST_STRICT_CONSOLE`   | unset       | `true` fails tests on browser console errors  |

---

## Cheat sheet — Playwright flags

| Command                                     | Purpose                       |
|---------------------------------------------|-------------------------------|
| `npx playwright test`                       | Run full suite                |
| `npx playwright test --project=chromium`    | Single browser                |
| `npx playwright test --grep "@smoke"`       | Tag-based filtering           |
| `npx playwright test --headed`              | Browser visible               |
| `npx playwright test --debug`               | Step debugger                 |
| `npx playwright test --ui`                  | Interactive UI mode           |
| `npx playwright test --shard=1/4`           | Manual sharding               |
| `npx playwright test --reporter=list`       | Override reporter             |
| `npx playwright show-report`                | Open last HTML report         |
| `npx playwright codegen <url>`              | Record new tests              |
| `npx playwright show-trace trace.zip`       | Open a saved trace            |

---

## License

MIT

---

*Built as a portfolio piece demonstrating production-grade test
automation patterns: POM, fixture composition, type-safe API testing,
parallel sharded execution, and CI/CD integration.*
