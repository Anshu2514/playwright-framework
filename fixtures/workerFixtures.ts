/**
 * fixtures/workerFixtures.ts
 *
 * Worker-scoped fixtures — created ONCE per Playwright worker process.
 *
 * ── workerAuthState ──────────────────────────────────────────────────────────
 *  Tries to obtain a session token via POST /api/auth/login.  Three outcomes:
 *
 *   1. Endpoint exists and login succeeds → returns serialised cookies + LS
 *   2. Endpoint returns non-2xx           → warns, returns "{}"
 *   3. Endpoint unreachable / no API site → warns, returns "{}"
 *
 *  saucedemo.com has no API, so case 3 is the default.  Tests using
 *  `fastAuthHome` then fall back transparently to UI login.
 *
 * ── Important type detail ────────────────────────────────────────────────────
 *  Playwright's `request` fixture is TEST-scoped, not worker-scoped, so it is
 *  NOT available inside worker fixtures.  We use `playwright.request.newContext`
 *  to create a stand-alone request context manually, then dispose it.
 */

import { test as base, request as playwrightRequest } from "@playwright/test";
import type { WorkerFixtures } from "./types";
import { getEnvConfig }  from "../config/env.config";
import { credentials }   from "../tests/data/testData";

// This layer declares only worker-scoped fixtures.  The first generic param
// (`{}`) means we add NO test-scoped fixtures here — those are layered on
// top by browserFixtures, pageFixtures, and apiFixtures.
export const workerFixtures = base.extend<{}, WorkerFixtures>({

  // ── workerBrowser ─────────────────────────────────────────────────────────
  workerBrowser: [
    async ({ browser }, use) => {
      await use(browser);
    },
    { scope: "worker" },
  ],

  // ── workerAuthState ───────────────────────────────────────────────────────
  workerAuthState: [
    async ({}, use) => {
      const envConfig = getEnvConfig();
      const username  = envConfig.credentials.username || credentials.validUser.username;
      const password  = envConfig.credentials.password || credentials.validUser.password;
      const baseURL   = envConfig.baseURL;

      // automationexercise.com has no /api/auth/login endpoint.
      // Skip the API login attempt entirely and yield empty state.
      // E2E tests using fastAuthHome / cartWithItem will fall back to UI login.
      const apiBase = envConfig.apiBaseURL ?? "";
      if (apiBase.includes("automationexercise.com")) {
        await use("{}");
        return;
      }

      let storageState = "{}";
      let apiContext;

      try {
        apiContext = await playwrightRequest.newContext({
          baseURL: envConfig.apiBaseURL || baseURL,
          timeout: 5_000,
        });

        const loginRes = await apiContext.post("/api/auth/login", {
          data: { username, password },
          headers: { "Content-Type": "application/json" },
          failOnStatusCode: false,
        });

        if (!loginRes.ok()) {
          console.warn(
            `[workerAuthState] Auth API responded ${loginRes.status()}. ` +
            "fastAuthHome tests will fall back to UI login.",
          );
        } else {
          const body  = (await loginRes.json()) as { token: string };
          const token = body.token;
          const host  = new URL(baseURL).hostname;

          storageState = JSON.stringify({
            cookies: [
              {
                name:     "auth_token",
                value:    token,
                domain:   host,
                path:     "/",
                expires:  -1,
                httpOnly: true,
                secure:   baseURL.startsWith("https"),
                sameSite: "Lax" as const,
              },
            ],
            origins: [
              {
                origin: baseURL,
                localStorage: [
                  { name: "auth_token",    value: token },
                  { name: "auth_username", value: username },
                ],
              },
            ],
          });

          console.info(
            `[workerAuthState] Worker authenticated as "${username}".`,
          );
        }
      } catch (err) {
        console.warn(
          `[workerAuthState] Could not reach auth endpoint: ${String(err)}. ` +
          "fastAuthHome tests will fall back to UI login.",
        );
      } finally {
        if (apiContext) await apiContext.dispose();
      }

      await use(storageState);
    },
    { scope: "worker" },
  ],
});
