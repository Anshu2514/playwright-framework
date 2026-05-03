/**
 * tests/api/users.api.spec.ts
 *
 * Real API tests against https://automationexercise.com/api
 *
 * ── Endpoints covered ───────────────────────────────────────────────────────
 *   POST /verifyLogin           → auth check
 *   GET  /verifyLogin           → expected 405
 *   POST /createAccount         → register a new user
 *   GET  /getUserDetailByEmail  → fetch profile (uses query string)
 *   POST /deleteAccount         → cleanup
 *
 * ── Test data hygiene ───────────────────────────────────────────────────────
 *  Every test that creates an account registers an apiTeardown callback that
 *  deletes the account afterwards, so failures never leave orphaned data.
 *  Email addresses are randomised per test to avoid collisions on retries.
 */

import { test, expect } from "../../fixtures";
import type { AeMessage, AeUserDetail } from "../../types";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Generate a unique email per test run so accounts never collide. */
const uniqueEmail = (): string =>
  `pw_test_${Date.now()}_${Math.floor(Math.random() * 10_000)}@example.com`;

/** Standard payload for createAccount — every field is required by the API. */
const newAccountPayload = (
  email: string,
  password = "Test@1234",
): Record<string, string> => ({
  name:          "Playwright Test",
  email,
  password,
  title:         "Mr",
  birth_date:    "10",
  birth_month:   "May",
  birth_year:    "1990",
  firstname:     "Play",
  lastname:      "Wright",
  company:       "Acme",
  address1:      "742 Evergreen Terrace",
  address2:      "Apt 1",
  country:       "United States",
  zipcode:       "62701",
  state:         "IL",
  city:          "Springfield",
  mobile_number: "555-0100",
});

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

test.describe("Users API — automationexercise.com", () => {

  // ── POST /verifyLogin ─────────────────────────────────────────────────────

  test.describe("POST /verifyLogin", () => {

    test("returns 'User not found!' for an unknown email", async ({
      apiClient,
    }) => {
      const res = await apiClient.postForm<AeMessage>("/verifyLogin", {
        email:    "definitely_does_not_exist_12345@example.com",
        password: "irrelevant",
      });

      apiClient.assertStatus(res, 200);
      expect(res.body.responseCode).toBe(404);
      expect(res.body.message).toMatch(/user not found/i);
    });

    test("returns 'Bad request' when email parameter is missing", async ({
      apiClient,
    }) => {
      const res = await apiClient.postForm<AeMessage>("/verifyLogin", {
        password: "any",
      });

      apiClient.assertStatus(res, 200);
      expect(res.body.responseCode).toBe(400);
      expect(res.body.message).toMatch(/email or password parameter is missing/i);
    });

    test("returns 'Bad request' when password parameter is missing", async ({
      apiClient,
    }) => {
      const res = await apiClient.postForm<AeMessage>("/verifyLogin", {
        email: "anybody@example.com",
      });

      apiClient.assertStatus(res, 200);
      expect(res.body.responseCode).toBe(400);
      expect(res.body.message).toMatch(/email or password parameter is missing/i);
    });

  });

  // ── GET /verifyLogin → method not supported ───────────────────────────────

  test.describe("GET /verifyLogin → method not supported", () => {

    test("returns responseCode 405 with 'method not supported'", async ({
      apiClient,
    }) => {
      const res = await apiClient.getRaw<AeMessage>("/verifyLogin");

      apiClient.assertStatus(res, 200);
      expect(res.body.responseCode).toBe(405);
      expect(res.body.message).toMatch(/not supported/i);
    });

  });

  // ── Account lifecycle ─────────────────────────────────────────────────────

  test.describe("Account lifecycle (create → verify → fetch → delete)", () => {

    test("full lifecycle: create, verify login, fetch details, delete", async ({
      apiClient,
      apiTeardown,
    }) => {
      const email    = uniqueEmail();
      const password = "Test@1234";
      const payload  = newAccountPayload(email, password);

      // ── 1. Create the account ──────────────────────────────────────────
      const createRes = await apiClient.postForm<AeMessage>(
        "/createAccount",
        payload,
      );
      apiClient.assertStatus(createRes, 200);
      expect(createRes.body.responseCode).toBe(201);
      expect(createRes.body.message).toMatch(/user created/i);

      // Register cleanup IMMEDIATELY after creation — before any further
      // assertion that could throw and leak the account.
      // /deleteAccount uses HTTP DELETE method (per AE docs), not POST.
      apiTeardown(async () => {
        await apiClient.deleteForm("/deleteAccount", { email, password });
      });

      // ── 2. verifyLogin succeeds with the new credentials ───────────────
      const loginRes = await apiClient.postForm<AeMessage>("/verifyLogin", {
        email,
        password,
      });
      expect(loginRes.body.responseCode).toBe(200);
      expect(loginRes.body.message).toMatch(/user exists/i);

      // ── 3. getUserDetailByEmail returns the account ───────────────────
      // GET endpoint with email passed as a query-string parameter.
      const detailRes = await apiClient.getRaw<AeUserDetail>(
        `/getUserDetailByEmail?email=${encodeURIComponent(email)}`,
      );
      apiClient.assertStatus(detailRes, 200);
      expect(detailRes.body.responseCode).toBe(200);
      expect(detailRes.body.user.email).toBe(email);
      expect(detailRes.body.user.first_name).toBe(payload.firstname);
      expect(detailRes.body.user.last_name).toBe(payload.lastname);
    });

    test("creating an account with missing required fields fails", async ({
      apiClient,
    }) => {
      // Send only some fields — most are missing
      const res = await apiClient.postForm<AeMessage>("/createAccount", {
        name:  "Incomplete",
        email: uniqueEmail(),
        // password and other required fields intentionally omitted
      });

      apiClient.assertStatus(res, 200);
      // AE returns a non-201 responseCode here.  The exact code depends on
      // how strictly the API validates — historically it returns 400 with a
      // "Bad request" message, but some AE deployments return 200 + a
      // different message.  Assert the request did NOT succeed in creating.
      expect(res.body.responseCode).not.toBe(201);
    });

  });

  // ── GET /getUserDetailByEmail (negative path) ────────────────────────────

  test.describe("GET /getUserDetailByEmail", () => {

    test("does not return a populated user for a non-existent email", async ({
      apiClient,
    }) => {
      const fakeEmail = `ghost_account_${Date.now()}@example.com`;
      const res = await apiClient.getRaw<AeUserDetail | AeMessage>(
        `/getUserDetailByEmail?email=${encodeURIComponent(fakeEmail)}`,
      );

      apiClient.assertStatus(res, 200);
      // AE typically returns responseCode 404 for unknown accounts.
      // Accept either an explicit 404 OR a missing/empty user object,
      // since the exact behaviour can vary across AE deployments.
      const body = res.body as Partial<AeUserDetail> & Partial<AeMessage>;
      const isNotFound =
        body.responseCode === 404 ||
        body.user === undefined ||
        body.user?.email !== fakeEmail;
      expect(isNotFound).toBe(true);
    });

  });

});
