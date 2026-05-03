/**
 * utils/apiClient.ts
 *
 * Production-grade HTTP client built on Playwright's APIRequestContext.
 *
 * ── Design goals ──────────────────────────────────────────────────────────────
 *
 *  1. Two response modes
 *     Typed methods  get<T>, post<T>, …       → throw on non-2xx, return body T
 *     Raw   methods  getRaw<T>, postRaw<T>, … → always resolve, return ApiResponse<T>
 *     Use typed methods for happy-path setup; raw methods for negative/error tests.
 *
 *  2. Pluggable authentication
 *     Bearer token · API key header · HTTP Basic · none
 *     Swap strategy at any point: client.setAuth({ type: "bearer", token })
 *     Convenience login() calls POST /api/auth/login and stores the token.
 *
 *  3. Automatic retry with exponential back-off
 *     Retries on 429 / 5xx up to `retries` times.  Default: 0 (off).
 *
 *  4. Request interceptors
 *     Register callbacks that mutate headers before every outgoing request.
 *     Useful for correlation IDs, request signing, or dynamic tokens.
 *
 *  5. Built-in assertions
 *     assertStatus()        exact HTTP status code
 *     assertStatusRange()   status in 2xx / 4xx / 5xx range
 *     assertHeader()        response header presence + optional value check
 *     assertSchema()        lightweight structural shape validation
 *     assertMaxDuration()   response time SLA
 *     assertBodyContains()  partial object match inside the response body
 *
 *  6. File upload
 *     postMultipart() wraps Playwright's multipart helper.
 *
 *  7. Request/response logging
 *     Pass verbose: true to log every call.  Never enabled in CI by default.
 *
 * ── Quick examples ────────────────────────────────────────────────────────────
 *
 *  // Happy path — get a typed resource
 *  const user = await client.get<User>("/api/users/42");
 *
 *  // Negative test — inspect the error body
 *  const res = await client.postRaw<ApiErrorBody>("/api/users", badPayload);
 *  client.assertStatus(res, 422);
 *  expect(res.body.code).toBe("VALIDATION_ERROR");
 *
 *  // Schema check — verify the response shape
 *  client.assertSchema(user, { id: "string", email: "string", role: "string" });
 *
 *  // Performance assertion
 *  const res = await client.getRaw<User>("/api/users/42");
 *  client.assertMaxDuration(res, 300); // must respond in ≤ 300 ms
 */

import { type APIRequestContext, type APIResponse } from "@playwright/test";
import type {
  ApiClientConfig,
  ApiResponse,
  AuthStrategy,
  LoginRequest,
  LoginResponse,
  RequestOptions,
} from "../types";

// ─────────────────────────────────────────────────────────────────────────────
// Custom error
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Thrown by typed methods (get, post, put, patch, delete) when the server
 * returns a non-2xx response.  Includes the raw body for debugging.
 */
export class ApiClientError extends Error {
  constructor(
    message:                   string,
    public readonly status:    number,
    public readonly endpoint:  string,
    public readonly body:      string,
  ) {
    super(message);
    this.name = "ApiClientError";
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal types
// ─────────────────────────────────────────────────────────────────────────────

type SchemaDescriptor = Record<
  string,
  "string" | "number" | "boolean" | "object" | "array" | "any"
>;

type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

/** Mutate the headers map before the request is dispatched. */
type RequestInterceptor = (headers: Record<string, string>) => unknown | Promise<unknown>;

// ─────────────────────────────────────────────────────────────────────────────
// ApiClient
// ─────────────────────────────────────────────────────────────────────────────

export class ApiClient {

  // ── State ──────────────────────────────────────────────────────────────────

  private readonly request:        APIRequestContext;
  private readonly baseURL:        string;
  private readonly defaultHeaders: Record<string, string>;
  private readonly globalTimeout:  number;
  private readonly verbose:        boolean;

  private auth:         AuthStrategy = { type: "none" };
  private interceptors: RequestInterceptor[] = [];

  // ── Constructor ────────────────────────────────────────────────────────────

  /**
   * @param request  Playwright APIRequestContext — inject from fixtures.
   * @param config   Optional client-level defaults.
   *
   * @example
   *   // In a fixture:
   *   apiClient: async ({ request }, use) => {
   *     const client = new ApiClient(request, { verbose: process.env.CI !== "true" });
   *     await client.login("user@example.com", "password");
   *     await use(client);
   *   }
   */
  constructor(request: APIRequestContext, config: ApiClientConfig = {}) {
    this.request        = request;
    this.baseURL        = config.baseURL        ?? "";
    this.defaultHeaders = config.defaultHeaders ?? {};
    this.globalTimeout  = config.timeoutMs      ?? 15_000;
    this.verbose        = config.verbose        ?? process.env["API_VERBOSE"] === "true";

    if (config.auth) this.setAuth(config.auth);
  }

  // ── Authentication ─────────────────────────────────────────────────────────

  /**
   * Set or replace the auth strategy used for all subsequent requests.
   *
   * @example
   *   client.setAuth({ type: "bearer", token: "eyJ…" });
   *   client.setAuth({ type: "apiKey", header: "X-Api-Key", value: "sk-…" });
   *   client.setAuth({ type: "basic",  username: "u", password: "p" });
   *   client.setAuth({ type: "none" });
   */
  setAuth(strategy: AuthStrategy): void {
    this.auth = strategy;
  }

  /**
   * POST /api/auth/login → store the returned Bearer token.
   * Returns the full login response so tests can inspect token metadata.
   *
   * The login request itself is sent without authentication headers to avoid
   * sending a stale token while the new one is being obtained.
   */
  async login(username: string, password: string): Promise<LoginResponse> {
    const previousAuth = this.auth;
    this.auth = { type: "none" };

    let response: LoginResponse;
    try {
      response = await this.post<LoginResponse>("/api/auth/login", {
        username,
        password,
      } satisfies LoginRequest);
    } catch (err) {
      this.auth = previousAuth; // restore on failure so caller can retry
      throw err;
    }

    this.auth = { type: "bearer", token: response.token };
    this.log(`[auth] Logged in as "${username}"`);
    return response;
  }

  /** Remove any stored auth token. */
  logout(): void {
    this.auth = { type: "none" };
    this.log("[auth] Auth cleared");
  }

  // ── Request interceptors ───────────────────────────────────────────────────

  /**
   * Register a function that is called with the mutable headers map before
   * every request.  Interceptors run in registration order.
   *
   * Common uses:
   *  • Add a correlation ID:  headers["X-Request-Id"] = uuid()
   *  • Rotate a dynamic API key dynamically
   *  • Log the outgoing headers in verbose mode
   *
   * @returns A deregister function — call it to remove the interceptor.
   *
   * @example
   *   const remove = client.addInterceptor((h) => {
   *     h["X-Trace-Id"] = crypto.randomUUID();
   *   });
   *   // … later …
   *   remove();
   */
  addInterceptor(fn: RequestInterceptor): () => void {
    this.interceptors.push(fn);
    return () => {
      this.interceptors = this.interceptors.filter((i) => i !== fn);
    };
  }

  // ── Typed HTTP methods (throw on non-2xx) ──────────────────────────────────
  //
  // Use these in happy-path tests and fixture setup / teardown.
  // They resolve directly to the parsed body T so assertions are concise:
  //
  //   const user = await client.post<User>("/api/users", payload);
  //   expect(user.email).toBe(payload.email);

  /**
   * GET `endpoint` and return the parsed body as T.
   * Throws ApiClientError on non-2xx.
   */
  async get<T = unknown>(
    endpoint: string,
    options:  RequestOptions = {},
  ): Promise<T> {
    const res = await this.send<T>("GET", endpoint, undefined, options);
    this.throwIfNotOk(res, "GET", endpoint);
    return res.body;
  }

  /**
   * POST `body` to `endpoint` and return the parsed body as T.
   * Throws ApiClientError on non-2xx.
   */
  async post<T = unknown>(
    endpoint: string,
    body:     unknown,
    options:  RequestOptions = {},
  ): Promise<T> {
    const res = await this.send<T>("POST", endpoint, body, options);
    this.throwIfNotOk(res, "POST", endpoint);
    return res.body;
  }

  /**
   * POST a request with `application/x-www-form-urlencoded` body.
   *
   * Required for APIs that don't accept JSON, such as automationexercise.com.
   * Returns the FULL ApiResponse<T> rather than just the body, because such
   * APIs commonly return HTTP 200 even on logical failures (the real outcome
   * lives inside the JSON body, e.g. `body.responseCode`).
   *
   * Does NOT throw on non-2xx — tests inspect the body directly.
   *
   * @example
   *   const res = await client.postForm<AeMessage>("/verifyLogin", {
   *     email:    "user@example.com",
   *     password: "secret",
   *   });
   *   expect(res.body.responseCode).toBe(200);
   */
  async postForm<T = unknown>(
    endpoint: string,
    fields:   Record<string, string | number | boolean>,
    options:  RequestOptions = {},
  ): Promise<ApiResponse<T>> {
    const { headers: extra = {}, timeoutMs = this.globalTimeout } = options;
    const headers = await this.buildHeaders(extra);
    headers["Content-Type"] = "application/x-www-form-urlencoded";

    const startMs = Date.now();
    const raw = await this.request.post(this.buildUrl(endpoint), {
      headers,
      timeout: timeoutMs,
      form:    fields,
    });
    const res = await this.toApiResponse<T>(raw, Date.now() - startMs);
    this.logRequest("POST (form)", this.buildUrl(endpoint), res);
    return res;
  }

  /**
   * DELETE a request with `application/x-www-form-urlencoded` body.
   * Sibling of postForm for APIs (like automationexercise.com) that send
   * delete payloads as form data instead of in the URL or as JSON.
   */
  async deleteForm<T = unknown>(
    endpoint: string,
    fields:   Record<string, string | number | boolean>,
    options:  RequestOptions = {},
  ): Promise<ApiResponse<T>> {
    const { headers: extra = {}, timeoutMs = this.globalTimeout } = options;
    const headers = await this.buildHeaders(extra);
    headers["Content-Type"] = "application/x-www-form-urlencoded";

    const startMs = Date.now();
    const raw = await this.request.delete(this.buildUrl(endpoint), {
      headers,
      timeout: timeoutMs,
      form:    fields,
    });
    const res = await this.toApiResponse<T>(raw, Date.now() - startMs);
    this.logRequest("DELETE (form)", this.buildUrl(endpoint), res);
    return res;
  }

  /**
   * PUT a request with `application/x-www-form-urlencoded` body.
   * Sibling of postForm for form-encoded update endpoints.
   */
  async putForm<T = unknown>(
    endpoint: string,
    fields:   Record<string, string | number | boolean>,
    options:  RequestOptions = {},
  ): Promise<ApiResponse<T>> {
    const { headers: extra = {}, timeoutMs = this.globalTimeout } = options;
    const headers = await this.buildHeaders(extra);
    headers["Content-Type"] = "application/x-www-form-urlencoded";

    const startMs = Date.now();
    const raw = await this.request.put(this.buildUrl(endpoint), {
      headers,
      timeout: timeoutMs,
      form:    fields,
    });
    const res = await this.toApiResponse<T>(raw, Date.now() - startMs);
    this.logRequest("PUT (form)", this.buildUrl(endpoint), res);
    return res;
  }

  /**
   * PUT `body` to `endpoint` and return the parsed body as T.
   * Throws ApiClientError on non-2xx.
   */
  async put<T = unknown>(
    endpoint: string,
    body:     unknown,
    options:  RequestOptions = {},
  ): Promise<T> {
    const res = await this.send<T>("PUT", endpoint, body, options);
    this.throwIfNotOk(res, "PUT", endpoint);
    return res.body;
  }

  /**
   * PATCH `body` to `endpoint` and return the parsed body as T.
   * Throws ApiClientError on non-2xx.
   */
  async patch<T = unknown>(
    endpoint: string,
    body:     unknown,
    options:  RequestOptions = {},
  ): Promise<T> {
    const res = await this.send<T>("PATCH", endpoint, body, options);
    this.throwIfNotOk(res, "PATCH", endpoint);
    return res.body;
  }

  /**
   * DELETE `endpoint` and return the parsed body as T.
   * Throws ApiClientError on non-2xx.
   */
  async delete<T = unknown>(
    endpoint: string,
    options:  RequestOptions = {},
  ): Promise<T> {
    const res = await this.send<T>("DELETE", endpoint, undefined, options);
    this.throwIfNotOk(res, "DELETE", endpoint);
    return res.body;
  }

  // ── Raw HTTP methods (always resolve) ─────────────────────────────────────
  //
  // Use these in negative / error-path tests where a 4xx or 5xx is the
  // *expected* outcome.  They always resolve to ApiResponse<T> regardless
  // of the HTTP status code.
  //
  //   const res = await client.postRaw<ApiErrorBody>("/api/users", badPayload);
  //   client.assertStatus(res, 422);
  //   expect(res.body.code).toBe("VALIDATION_ERROR");

  async getRaw<T = unknown>(
    endpoint: string,
    options:  RequestOptions = {},
  ): Promise<ApiResponse<T>> {
    return this.send<T>("GET", endpoint, undefined, { ...options, allowNonOk: true });
  }

  async postRaw<T = unknown>(
    endpoint: string,
    body:     unknown,
    options:  RequestOptions = {},
  ): Promise<ApiResponse<T>> {
    return this.send<T>("POST", endpoint, body, { ...options, allowNonOk: true });
  }

  async putRaw<T = unknown>(
    endpoint: string,
    body:     unknown,
    options:  RequestOptions = {},
  ): Promise<ApiResponse<T>> {
    return this.send<T>("PUT", endpoint, body, { ...options, allowNonOk: true });
  }

  async patchRaw<T = unknown>(
    endpoint: string,
    body:     unknown,
    options:  RequestOptions = {},
  ): Promise<ApiResponse<T>> {
    return this.send<T>("PATCH", endpoint, body, { ...options, allowNonOk: true });
  }

  async deleteRaw<T = unknown>(
    endpoint: string,
    options:  RequestOptions = {},
  ): Promise<ApiResponse<T>> {
    return this.send<T>("DELETE", endpoint, undefined, { ...options, allowNonOk: true });
  }

  // ── File upload ────────────────────────────────────────────────────────────

  /**
   * POST a multipart/form-data request.
   * Each field value is either a string or a Buffer for binary fields.
   * Playwright infers and sets the correct Content-Type boundary automatically.
   *
   * @example
   *   const product = await client.postMultipart<Product>("/api/products/images", {
   *     productId: "abc-123",
   *     image: { buffer: fs.readFileSync("image.png"), mimeType: "image/png", name: "image.png" },
   *   });
   */
  async postMultipart<T = unknown>(
    endpoint: string,
    fields:   Record<string, string | { buffer: Buffer; mimeType: string; name: string }>,
    options:  Omit<RequestOptions, "allowNonOk"> = {},
  ): Promise<T> {
    const { headers: extra = {}, timeoutMs = this.globalTimeout } = options;
    const headers = await this.buildHeaders(extra);

    // Remove Content-Type — Playwright sets the multipart boundary automatically
    delete headers["Content-Type"];

    const multipart: Record<
      string,
      string | { name: string; mimeType: string; buffer: Buffer }
    > = {};

    for (const [key, value] of Object.entries(fields)) {
      multipart[key] =
        typeof value === "string"
          ? value
          : { name: value.name, mimeType: value.mimeType, buffer: value.buffer };
    }

    const startMs = Date.now();
    const raw = await this.request.post(this.buildUrl(endpoint), {
      headers,
      timeout: timeoutMs,
      multipart: multipart as NonNullable<Parameters<typeof this.request.post>[1]>["multipart"],
    });

    const res = await this.toApiResponse<T>(raw, Date.now() - startMs);
    this.logRequest("POST (multipart)", this.buildUrl(endpoint), res);
    this.throwIfNotOk(res, "POST", endpoint);
    return res.body;
  }

  // ── Assertion helpers ──────────────────────────────────────────────────────
  //
  // These are plain methods (not Playwright `expect` matchers) so they can be
  // used in both test bodies and helper utilities without importing `expect`.

  /**
   * Assert that `res.status` equals `expected`.
   * Throws with a descriptive message if the assertion fails.
   *
   * @example
   *   client.assertStatus(res, 201);
   */
  assertStatus(res: ApiResponse, expected: number): void {
    if (res.status !== expected) {
      throw new Error(
        `Expected HTTP ${expected} but got ${res.status}.\n` +
        `Endpoint: ${res.rawText.slice(0, 200)}`,
      );
    }
  }

  /**
   * Assert that `res.status` falls within a named range.
   *
   * @example
   *   client.assertStatusRange(res, "2xx");  // 200–299
   *   client.assertStatusRange(res, "4xx");  // 400–499
   *   client.assertStatusRange(res, "5xx");  // 500–599
   */
  assertStatusRange(res: ApiResponse, range: "2xx" | "4xx" | "5xx"): void {
    const floor = parseInt(range[0]) * 100;
    const ceil  = floor + 99;
    if (res.status < floor || res.status > ceil) {
      throw new Error(
        `Expected HTTP status in ${range} (${floor}–${ceil}) but got ${res.status}.`,
      );
    }
  }

  /**
   * Assert that the response includes a header with the given `name`.
   * If `value` is supplied, also asserts that the header's value
   * contains that string (case-insensitive substring match).
   *
   * @example
   *   client.assertHeader(res, "content-type", "application/json");
   *   client.assertHeader(res, "x-request-id");  // just presence
   */
  assertHeader(res: ApiResponse, name: string, value?: string): void {
    const key   = name.toLowerCase();
    const entry = Object.entries(res.headers).find(([k]) => k.toLowerCase() === key);

    if (!entry) {
      throw new Error(
        `Expected response header "${name}" to be present.\n` +
        `Received headers: ${Object.keys(res.headers).join(", ")}`,
      );
    }

    if (value !== undefined) {
      const actual = entry[1].toLowerCase();
      if (!actual.includes(value.toLowerCase())) {
        throw new Error(
          `Header "${name}": expected value to contain "${value}" but was "${entry[1]}".`,
        );
      }
    }
  }

  /**
   * Assert that `res.durationMs` is at most `maxMs`.
   * Use to enforce response-time SLAs inside performance-sensitive tests.
   *
   * @example
   *   client.assertMaxDuration(res, 500); // must respond within 500 ms
   */
  assertMaxDuration(res: ApiResponse, maxMs: number): void {
    if (res.durationMs > maxMs) {
      throw new Error(
        `Response time SLA breached: expected ≤ ${maxMs} ms but took ${res.durationMs} ms.`,
      );
    }
  }

  /**
   * Validate that `data` has every key in `schema` and each value is the
   * expected JS type.  Use "any" to skip the type check for a specific key.
   *
   * Validates flat objects only.  For nested shapes, call assertSchema()
   * recursively on the nested property.
   *
   * @example
   *   client.assertSchema(user, {
   *     id:        "string",
   *     email:     "string",
   *     role:      "string",
   *     createdAt: "string",
   *     status:    "string",
   *   });
   */
  assertSchema(data: unknown, schema: SchemaDescriptor): void {
    if (typeof data !== "object" || data === null || Array.isArray(data)) {
      throw new Error(
        `assertSchema: expected a plain object but received ${
          Array.isArray(data) ? "array" : typeof data
        }.`,
      );
    }

    const obj    = data as Record<string, unknown>;
    const errors: string[] = [];

    for (const [key, expectedType] of Object.entries(schema)) {
      if (!(key in obj)) {
        errors.push(`  • "${key}" — key is missing`);
        continue;
      }
      if (expectedType === "any") continue;

      const actual     = obj[key];
      const actualType = Array.isArray(actual) ? "array" : typeof actual;

      if (actualType !== expectedType) {
        errors.push(
          `  • "${key}" — expected ${expectedType}, got ${actualType}` +
          (actual !== null && actual !== undefined ? ` (value: ${JSON.stringify(actual)})` : ""),
        );
      }
    }

    if (errors.length > 0) {
      throw new Error(`Schema validation failed (${errors.length} error(s)):\n${errors.join("\n")}`);
    }
  }

  /**
   * Assert that every key/value pair in `subset` exists in the response body.
   * Performs a partial (shallow) match — extra keys in the body are ignored.
   *
   * @example
   *   client.assertBodyContains(res, { email: "alice@example.com", role: "editor" });
   */
  assertBodyContains<T extends object>(
    res:    ApiResponse<T>,
    subset: Partial<T>,
  ): void {
    const body   = res.body as Record<string, unknown>;
    const errors: string[] = [];

    for (const [key, expected] of Object.entries(subset)) {
      const actual = body[key];
      if (JSON.stringify(actual) !== JSON.stringify(expected)) {
        errors.push(
          `  • "${key}": expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
        );
      }
    }

    if (errors.length > 0) {
      throw new Error(`assertBodyContains failed:\n${errors.join("\n")}`);
    }
  }

  // ── Internals ──────────────────────────────────────────────────────────────

  /**
   * Core send pipeline:
   *  buildUrl → buildHeaders → (retry loop) → dispatch → toApiResponse → log
   */
  private async send<T>(
    method:   HttpMethod,
    endpoint: string,
    body:     unknown,
    options:  RequestOptions,
  ): Promise<ApiResponse<T>> {
    const {
      headers: extraHeaders = {},
      params,
      timeoutMs    = this.globalTimeout,
      retries      = 0,
      retryDelayMs = 500,
    } = options;

    const url     = this.buildUrl(endpoint, params);
    const headers = await this.buildHeaders(extraHeaders);

    let lastResponse: ApiResponse<T> | undefined;
    let lastError:    unknown;

    for (let attempt = 0; attempt <= retries; attempt++) {
      if (attempt > 0) {
        this.log(`[retry] Attempt ${attempt + 1}/${retries + 1} — ${method} ${endpoint}`);
        await this.delay(retryDelayMs * 2 ** (attempt - 1)); // exponential back-off
      }

      try {
        const startMs = Date.now();
        const raw     = await this.dispatch(method, url, body, headers, timeoutMs);
        const res     = await this.toApiResponse<T>(raw, Date.now() - startMs);

        this.logRequest(method, url, res);
        lastResponse = res;

        // Retry only on transient server-side errors, not client errors (4xx)
        if ([429, 500, 502, 503, 504].includes(res.status) && attempt < retries) {
          continue;
        }

        return res;
      } catch (networkErr) {
        // Network-level failures (DNS, ECONNREFUSED) are also retried
        lastError = networkErr;
        this.log(`[send] Network error on attempt ${attempt + 1}: ${String(networkErr)}`);
        if (attempt === retries) break;
      }
    }

    if (lastResponse) return lastResponse;
    throw lastError ?? new Error(`${method} ${endpoint} failed after ${retries + 1} attempt(s)`);
  }

  /** Dispatch the correct Playwright HTTP call for the given verb. */
  private dispatch(
    method:    HttpMethod,
    url:       string,
    body:      unknown,
    headers:   Record<string, string>,
    timeoutMs: number,
  ): Promise<APIResponse> {
    const opts = {
      headers,
      timeout: timeoutMs,
      ...(body !== undefined ? { data: body } : {}),
    };

    switch (method) {
      case "GET":    return this.request.get(url, opts);
      case "POST":   return this.request.post(url, opts);
      case "PUT":    return this.request.put(url, opts);
      case "PATCH":  return this.request.patch(url, opts);
      case "DELETE": return this.request.delete(url, opts);
    }
  }

  /** Parse a raw Playwright APIResponse into our typed ApiResponse<T> wrapper. */
  private async toApiResponse<T>(
    raw:        APIResponse,
    durationMs: number,
  ): Promise<ApiResponse<T>> {
    const rawText = await raw.text();

    let body: T;
    try {
      body = JSON.parse(rawText) as T;
    } catch {
      // Non-JSON body (plain text, HTML) — cast as-is
      body = rawText as unknown as T;
    }

    // Normalise headers into a plain Record<string, string>
    const headers: Record<string, string> = {};
    for (const [k, v] of Object.entries(raw.headers())) {
      headers[k] = Array.isArray(v) ? v.join(", ") : String(v);
    }

    return {
      status:     raw.status(),
      ok:         raw.ok(),
      headers,
      body,
      rawText,
      durationMs,
    };
  }

  /** Build the request URL, appending query parameters if provided. */
  private buildUrl(
    endpoint: string,
    params?:  Record<string, string | number | boolean>,
  ): string {
    const base = endpoint.startsWith("http")
      ? endpoint
      : `${this.baseURL}${endpoint}`;

    if (!params || Object.keys(params).length === 0) return base;

    const qs = Object.entries(params)
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
      .join("&");

    return `${base}?${qs}`;
  }

  /**
   * Merge default headers → auth headers → per-request headers → interceptors.
   * Later layers win (per-request headers override defaults).
   */
  private async buildHeaders(
    extra: Record<string, string>,
  ): Promise<Record<string, string>> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "Accept":       "application/json",
      ...this.defaultHeaders,
    };

    // Apply the active authentication strategy
    switch (this.auth.type) {
      case "bearer":
        headers["Authorization"] = `Bearer ${this.auth.token}`;
        break;
      case "apiKey":
        headers[this.auth.header] = this.auth.value;
        break;
      case "basic": {
        const encoded = Buffer.from(
          `${this.auth.username}:${this.auth.password}`,
        ).toString("base64");
        headers["Authorization"] = `Basic ${encoded}`;
        break;
      }
      case "none":
        break;
    }

    // Merge per-request overrides (highest priority)
    Object.assign(headers, extra);

    // Run registered interceptors
    for (const interceptor of this.interceptors) {
      await interceptor(headers);
    }

    return headers;
  }

  private throwIfNotOk(res: ApiResponse, method: string, endpoint: string): void {
    if (!res.ok) {
      throw new ApiClientError(
        `${method} ${endpoint} → HTTP ${res.status}`,
        res.status,
        endpoint,
        res.rawText,
      );
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private log(message: string): void {
    if (this.verbose) console.log(`  [ApiClient] ${message}`);
  }

  private logRequest(method: string, url: string, res: ApiResponse): void {
    if (!this.verbose) return;
    const icon = res.ok ? "✓" : "✗";
    console.log(
      `  ${icon} [api] ${method.padEnd(7)} ${url}\n` +
      `         → ${res.status}  ${res.durationMs} ms`,
    );
  }
}
