# API Test Configuration — Files Changed

These 7 files contain everything needed to retarget the API test suite from
the old fictional/mocked API to the real **automationexercise.com** API.

---

## How to apply

Unzip on top of your existing playwright-framework directory. All 7 files
overwrite their counterparts at the same paths:

```
playwright.config.ts
utils/apiClient.ts
types/index.ts
fixtures/apiFixtures.ts
fixtures/workerFixtures.ts
tests/api/products.api.spec.ts
tests/api/users.api.spec.ts
```

Then **delete the obsolete file** (it targets a fictional auth API that no
longer exists in this configuration):

```bash
rm tests/api/auth.api.spec.ts
```

---

## Run

```bash
npx playwright test --project=api
```

You should see 15 API tests run against `https://automationexercise.com/api`.

---

## Summary of changes

### `playwright.config.ts`
- API project now uses `Content-Type: application/x-www-form-urlencoded`
  (AE rejects JSON bodies on POST endpoints).
- Bumped action and navigation timeouts for the API project — public demo
  can be slow.

### `utils/apiClient.ts`
- Added three new methods: `postForm()`, `deleteForm()`, `putForm()`.
- All three send `application/x-www-form-urlencoded` bodies via
  Playwright's native `form:` option.
- All three return the FULL `ApiResponse<T>` (not just the body) and DO NOT
  throw on non-2xx — required because AE returns HTTP 200 for everything,
  with the real outcome in `body.responseCode`.

### `types/index.ts`
- Appended AE-specific shapes: `AeMessage`, `AeProduct`, `AeBrand`,
  `AeProductsList`, `AeBrandsList`, `AeUserDetail`.

### `fixtures/apiFixtures.ts`
- Removed automatic `client.login()` call from `apiClient` and
  `adminApiClient` fixtures (AE has no token-based auth).
- Now passes `envConfig.apiBaseURL` into `ApiClient` so it builds full
  absolute URLs internally — bypasses Playwright's known bug where
  baseURL paths are stripped (issue #22592).
- Removed unused `credentials` import.

### `fixtures/workerFixtures.ts`
- Short-circuits the worker-level API auth attempt when `apiBaseURL`
  points at automationexercise.com (which has no `/api/auth/login`).
  Yields empty state immediately so no spurious warnings appear.

### `tests/api/products.api.spec.ts` (replaced)
8 tests covering:
- GET /productsList — success, schema check, SLA
- POST /productsList — expected 405
- GET /brandsList — success, schema check
- POST /searchProduct — success and missing-param 400

### `tests/api/users.api.spec.ts` (replaced)
7 tests covering:
- POST /verifyLogin — 4 negative paths (unknown email, missing email,
  missing password, GET method 405)
- POST /createAccount + POST /verifyLogin + GET /getUserDetailByEmail +
  DELETE /deleteAccount — full lifecycle test
- Account creation with missing fields
- GET /getUserDetailByEmail with non-existent email

---

## Important AE API quirks (already handled in the tests)

1. **HTTP status is always 200.** Real outcome lives in `body.responseCode`
   (200, 201, 400, 404, 405). All tests assert against the body.

2. **POST/PUT/DELETE bodies must be `application/x-www-form-urlencoded`.**
   JSON bodies are rejected. The new `postForm`, `deleteForm`, `putForm`
   methods handle this automatically.

3. **`deleteAccount` is HTTP DELETE, not POST.** The lifecycle test uses
   `apiClient.deleteForm("/deleteAccount", { email, password })` — using
   `postForm` would return responseCode 405.

4. **Account email collisions.** The lifecycle test uses a randomised
   email per run (`pw_test_<timestamp>_<random>@example.com`) and registers
   `apiTeardown` cleanup IMMEDIATELY after creation, so failures don't
   leak orphaned accounts.

---

## Verified before zipping

- `tsc --noEmit` — zero TypeScript errors across the framework.
- `playwright test --list --project=api` — all 15 tests collect.
- One test run through the full code path — verified the URL goes out as
  `https://automationexercise.com/api/productsList` (the `/api` prefix is
  preserved). Only failure was DNS resolution, which is a sandbox network
  limitation — not a code issue.
