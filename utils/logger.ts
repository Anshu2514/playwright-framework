/**
 * utils/logger.ts
 *
 * Structured logger for tests and fixtures.
 *
 * ── Why a logger instead of console.log? ─────────────────────────────────────
 *
 *  1. Levels      info / warn / error / debug — easily filterable.
 *  2. Timestamps  every line is prefixed with HH:MM:SS.mmm for correlation
 *                 with screenshots and traces.
 *  3. Context     test title is included automatically when a TestInfo is
 *                 passed in — so log lines are unambiguous in a parallel run.
 *  4. Attachments calling `attachLog()` writes the captured log to the test
 *                 report as a downloadable text file — visible in HTML report.
 *
 * ── Usage ────────────────────────────────────────────────────────────────────
 *
 *   import { logger } from "../../utils/logger";
 *
 *   test("…", async ({ page }, testInfo) => {
 *     const log = logger.forTest(testInfo);
 *     log.info("Navigating to login");
 *     await page.goto("/");
 *     log.warn("Took longer than expected", { ms: 1234 });
 *     await log.attach();   // attach this test's log to the HTML report
 *   });
 *
 * ── Verbosity ────────────────────────────────────────────────────────────────
 *  Set LOG_LEVEL=debug to enable debug-level lines.  Default: info.
 *  Set LOG_LEVEL=silent to suppress everything (useful when JSON/JUnit
 *  reports are the only ones consumed).
 */

import type { TestInfo } from "@playwright/test";

export type LogLevel = "debug" | "info" | "warn" | "error" | "silent";

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug:  10,
  info:   20,
  warn:   30,
  error:  40,
  silent: 100,
};

const ICONS: Record<Exclude<LogLevel, "silent">, string> = {
  debug: "·",
  info:  "i",
  warn:  "⚠",
  error: "✗",
};

const COLOURS: Record<Exclude<LogLevel, "silent">, string> = {
  debug: "\x1b[2m",      // dim
  info:  "\x1b[36m",     // cyan
  warn:  "\x1b[33m",     // yellow
  error: "\x1b[31m",     // red
};
const RESET = "\x1b[0m";

const useColour = process.stdout.isTTY && !process.env["NO_COLOR"];

function timestamp(): string {
  const d  = new Date();
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");
  const ms = String(d.getMilliseconds()).padStart(3, "0");
  return `${hh}:${mm}:${ss}.${ms}`;
}

function shouldLog(level: LogLevel): boolean {
  const configured = (process.env["LOG_LEVEL"] as LogLevel) || "info";
  return LEVEL_PRIORITY[level] >= LEVEL_PRIORITY[configured];
}

// ─────────────────────────────────────────────────────────────────────────────
// Per-test logger
// ─────────────────────────────────────────────────────────────────────────────

class TestLogger {
  private readonly buffer: string[] = [];

  constructor(
    private readonly prefix:    string,
    private readonly testInfo?: TestInfo,
  ) {}

  /** Detail for stepping through code — disabled by default. */
  debug(message: string, data?: unknown): void {
    this.write("debug", message, data);
  }

  /** Routine progress — the default level. */
  info(message: string, data?: unknown): void {
    this.write("info", message, data);
  }

  /** Anomalies that don't fail the test but warrant attention. */
  warn(message: string, data?: unknown): void {
    this.write("warn", message, data);
  }

  /** A test-affecting failure.  Does NOT fail the test on its own. */
  error(message: string, data?: unknown): void {
    this.write("error", message, data);
  }

  /**
   * Attach the captured log buffer to the test report as a text file.
   * Visible in the HTML report under the test's "Attachments" section.
   * Safe to call even when no testInfo was provided — becomes a no-op.
   */
  async attach(name = "test-log.txt"): Promise<void> {
    if (!this.testInfo || this.buffer.length === 0) return;
    await this.testInfo.attach(name, {
      contentType: "text/plain",
      body:        Buffer.from(this.buffer.join("\n")),
    });
  }

  /** Currently-buffered log lines.  Useful for assertions in self-tests. */
  flush(): string[] {
    return [...this.buffer];
  }

  // ── Internals ────────────────────────────────────────────────────────────

  private write(level: Exclude<LogLevel, "silent">, message: string, data?: unknown): void {
    const ts        = timestamp();
    const ctx       = this.prefix ? `[${this.prefix}] ` : "";
    const dataStr   = data !== undefined ? ` ${this.safeStringify(data)}` : "";
    const plainLine = `${ts} ${level.toUpperCase().padEnd(5)} ${ctx}${message}${dataStr}`;

    // Always buffer — attach() needs the full history regardless of console level
    this.buffer.push(plainLine);

    if (!shouldLog(level)) return;

    if (useColour) {
      const c = COLOURS[level];
      // eslint-disable-next-line no-console
      console.log(
        `\x1b[2m${ts}\x1b[0m ${c}${ICONS[level]} ${level.toUpperCase().padEnd(5)}${RESET} ${ctx}${message}${dataStr}`,
      );
    } else {
      // eslint-disable-next-line no-console
      console.log(plainLine);
    }
  }

  private safeStringify(value: unknown): string {
    try {
      return typeof value === "string" ? value : JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

export const logger = {
  /**
   * Get a logger scoped to a specific test.
   * The prefix becomes the test title; lines emitted from this logger are
   * attributable to a single test even in a parallel run.
   */
  forTest(testInfo: TestInfo): TestLogger {
    return new TestLogger(testInfo.title, testInfo);
  },

  /**
   * Get a logger with an arbitrary prefix.
   * Use in fixtures, utilities, and helper modules where no TestInfo is
   * available.  Lines won't be attached to any specific test report.
   */
  named(prefix: string): TestLogger {
    return new TestLogger(prefix);
  },

  /** Default "anonymous" logger — no prefix.  Same level / colouring rules. */
  default: new TestLogger(""),
};
