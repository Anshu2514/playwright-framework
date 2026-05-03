import { type Page } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";

// ── Wait helpers ──────────────────────────────────────────────────────────────

export async function waitFor(ms: number): Promise<void> {
  await new Promise((res) => setTimeout(res, ms));
}

export async function retryUntil<T>(
  fn: () => Promise<T>,
  predicate: (result: T) => boolean,
  options: { retries?: number; delayMs?: number } = {}
): Promise<T> {
  const { retries = 5, delayMs = 500 } = options;
  for (let i = 0; i < retries; i++) {
    const result = await fn();
    if (predicate(result)) return result;
    await waitFor(delayMs);
  }
  throw new Error("retryUntil: predicate never satisfied within retries");
}

// ── DOM helpers ───────────────────────────────────────────────────────────────

export async function dismissDialog(page: Page): Promise<void> {
  page.on("dialog", (d) => d.dismiss());
}

export async function acceptDialog(page: Page): Promise<void> {
  page.on("dialog", (d) => d.accept());
}

export async function mockRoute(
  page: Page,
  urlPattern: string | RegExp,
  responseBody: unknown,
  status = 200
): Promise<void> {
  await page.route(urlPattern, (route) =>
    route.fulfill({
      status,
      contentType: "application/json",
      body: JSON.stringify(responseBody),
    })
  );
}

export async function interceptRequest(
  page: Page,
  urlPattern: string | RegExp
): Promise<string> {
  return new Promise((resolve) => {
    page.on("request", (req) => {
      if (
        (typeof urlPattern === "string" && req.url().includes(urlPattern)) ||
        (urlPattern instanceof RegExp && urlPattern.test(req.url()))
      ) {
        resolve(req.url());
      }
    });
  });
}

// ── File helpers ──────────────────────────────────────────────────────────────

export function ensureDir(dirPath: string): void {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

export function readJSON<T>(filePath: string): T {
  const abs = path.resolve(filePath);
  return JSON.parse(fs.readFileSync(abs, "utf-8")) as T;
}

// ── String helpers ────────────────────────────────────────────────────────────

export function randomString(length = 8): string {
  return Math.random()
    .toString(36)
    .substring(2, 2 + length);
}

export function formatDate(date = new Date()): string {
  return date.toISOString().split("T")[0];
}
