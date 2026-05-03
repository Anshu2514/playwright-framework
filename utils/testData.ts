import { randomUUID } from "crypto";

/**
 * TestData — factories for generating deterministic or random test payloads.
 */
export const TestData = {
  user: (overrides: Partial<User> = {}): User => ({
    id: randomUUID(),
    username: `user_${Date.now()}`,
    email: `test_${Date.now()}@example.com`,
    firstName: "Test",
    lastName: "User",
    role: "viewer",
    ...overrides,
  }),

  admin: (overrides: Partial<User> = {}): User =>
    TestData.user({ role: "admin", ...overrides }),

  product: (overrides: Partial<Product> = {}): Product => ({
    id: randomUUID(),
    name: `Product ${Date.now()}`,
    price: 9.99,
    sku: `SKU-${Date.now()}`,
    inStock: true,
    ...overrides,
  }),

  /** Reproducible seed-based string for stable visual snapshots */
  stable: (seed: string) => `stable_${seed}_value`,
};

// ── Types ─────────────────────────────────────────────────────────────────────

export interface User {
  id: string;
  username: string;
  email: string;
  firstName: string;
  lastName: string;
  role: "admin" | "editor" | "viewer";
}

export interface Product {
  id: string;
  name: string;
  price: number;
  sku: string;
  inStock: boolean;
}
