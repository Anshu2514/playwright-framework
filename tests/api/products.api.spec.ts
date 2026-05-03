/**
 * tests/api/products.api.spec.ts
 *
 * Real API tests against https://automationexercise.com/api
 *
 * ── Quirks of this API ──────────────────────────────────────────────────────
 *  • Every response returns HTTP 200 — real outcome is in body.responseCode.
 *  • POST endpoints accept application/x-www-form-urlencoded only (NOT JSON).
 *  • POSTing to a GET-only endpoint returns responseCode 405.
 *  • The site is a public demo and can be slow / occasionally throttled.
 *
 * ── Endpoints covered ───────────────────────────────────────────────────────
 *   GET  /productsList
 *   POST /productsList     → expected 405
 *   GET  /brandsList
 *   POST /searchProduct    → keyword search
 *   POST /searchProduct    → missing param → 400
 */

import { test, expect } from "../../fixtures";
import type {
  AeProductsList,
  AeBrandsList,
  AeMessage,
} from "../../types";

test.describe("Products API — automationexercise.com", () => {

  // ── GET /productsList ─────────────────────────────────────────────────────

  test.describe("GET /productsList", () => {

    test("returns responseCode 200 with a non-empty products array", async ({
      apiClient,
    }) => {
      const res = await apiClient.getRaw<AeProductsList>("/productsList");

      // HTTP layer is always 200 on this API
      apiClient.assertStatus(res, 200);

      // Logical response code lives in the body
      expect(res.body.responseCode).toBe(200);
      expect(Array.isArray(res.body.products)).toBe(true);
      expect(res.body.products.length).toBeGreaterThan(0);
    });

    test("each product has id, name, price, brand, and category", async ({
      apiClient,
    }) => {
      const res = await apiClient.getRaw<AeProductsList>("/productsList");
      apiClient.assertStatus(res, 200);
      expect(res.body.responseCode).toBe(200);

      // Sample-check the first 5 products to keep the test fast
      for (const product of res.body.products.slice(0, 5)) {
        expect(typeof product.id).toBe("number");
        expect(typeof product.name).toBe("string");
        expect(product.name.length).toBeGreaterThan(0);
        expect(typeof product.price).toBe("string");
        expect(product.price).toMatch(/^Rs\.\s*\d+/);   // e.g. "Rs. 500"
        expect(typeof product.brand).toBe("string");
        expect(product.category).toBeDefined();
        expect(typeof product.category.category).toBe("string");
      }
    });

    test("response time is within 5 000 ms SLA", async ({ apiClient }) => {
      const res = await apiClient.getRaw<AeProductsList>("/productsList");
      apiClient.assertMaxDuration(res, 5_000);
    });

  });

  // ── POST /productsList — method not supported ─────────────────────────────

  test.describe("POST /productsList → method not supported", () => {

    test("returns responseCode 405 'This request method is not supported'", async ({
      apiClient,
    }) => {
      const res = await apiClient.postForm<AeMessage>("/productsList", {});

      // HTTP layer still 200 even though the method isn't allowed
      apiClient.assertStatus(res, 200);

      expect(res.body.responseCode).toBe(405);
      expect(res.body.message).toMatch(/not supported/i);
    });

  });

  // ── GET /brandsList ───────────────────────────────────────────────────────

  test.describe("GET /brandsList", () => {

    test("returns responseCode 200 with a non-empty brands array", async ({
      apiClient,
    }) => {
      const res = await apiClient.getRaw<AeBrandsList>("/brandsList");

      apiClient.assertStatus(res, 200);
      expect(res.body.responseCode).toBe(200);
      expect(Array.isArray(res.body.brands)).toBe(true);
      expect(res.body.brands.length).toBeGreaterThan(0);
    });

    test("each brand has id and brand name", async ({ apiClient }) => {
      const res = await apiClient.getRaw<AeBrandsList>("/brandsList");
      apiClient.assertStatus(res, 200);

      for (const brand of res.body.brands.slice(0, 5)) {
        expect(typeof brand.id).toBe("number");
        expect(typeof brand.brand).toBe("string");
        expect(brand.brand.length).toBeGreaterThan(0);
      }
    });

  });

  // ── POST /searchProduct ───────────────────────────────────────────────────

  test.describe("POST /searchProduct", () => {

    test("returns responseCode 200 with matching products for valid keyword", async ({
      apiClient,
    }) => {
      const res = await apiClient.postForm<AeProductsList>("/searchProduct", {
        search_product: "top",
      });

      apiClient.assertStatus(res, 200);
      expect(res.body.responseCode).toBe(200);
      expect(Array.isArray(res.body.products)).toBe(true);
      expect(res.body.products.length).toBeGreaterThan(0);

      // At least one result name should contain the search term
      // (case-insensitive substring match against name OR category).
      const anyMatch = res.body.products.some(
        (p) =>
          p.name.toLowerCase().includes("top") ||
          p.category.category.toLowerCase().includes("top"),
      );
      expect(anyMatch).toBe(true);
    });

    test("returns responseCode 400 when search_product param is missing", async ({
      apiClient,
    }) => {
      const res = await apiClient.postForm<AeMessage>("/searchProduct", {});

      apiClient.assertStatus(res, 200);
      expect(res.body.responseCode).toBe(400);
      expect(res.body.message).toMatch(/search_product parameter is missing/i);
    });

  });

});
