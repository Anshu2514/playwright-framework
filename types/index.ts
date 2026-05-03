/**
 * types/index.ts
 *
 * Shared TypeScript types used across:
 *   - utils/apiClient.ts       (request / response shapes)
 *   - tests/api/*.spec.ts      (domain entity types)
 *   - pages/*.ts               (reused in POM return values)
 *   - fixtures/types.ts        (referenced for fixture generics)
 *
 * Convention: keep types pure (no runtime code).  This file is always
 * safe to import from any layer without introducing circular dependencies.
 */

// ─────────────────────────────────────────────────────────────────────────────
// HTTP / ApiClient infrastructure types
// ─────────────────────────────────────────────────────────────────────────────

/** Every HTTP verb the ApiClient supports. */
export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

/** Authentication strategies the ApiClient can use. */
export type AuthStrategy =
  | { type: "bearer"; token: string }
  | { type: "apiKey"; header: string; value: string }
  | { type: "basic";  username: string; password: string }
  | { type: "none" };

/**
 * Full response wrapper returned by ApiClient raw methods.
 * Gives tests access to the status code, headers, and typed body
 * without calling .json() / .text() themselves.
 */
export interface ApiResponse<T = unknown> {
  /** HTTP status code (e.g. 200, 201, 400, 404). */
  status: number;
  /** True when status is in the 2xx range. */
  ok: boolean;
  /** All response headers as a plain object. */
  headers: Record<string, string>;
  /** Parsed response body — typed by the caller via the generic parameter. */
  body: T;
  /** Raw response text (useful for debugging malformed JSON). */
  rawText: string;
  /** Total round-trip time in milliseconds. */
  durationMs: number;
}

/**
 * Options passed to every ApiClient request method.
 * All fields are optional — defaults are applied by the client.
 */
export interface RequestOptions {
  /** Additional headers merged on top of the client defaults. */
  headers?: Record<string, string>;
  /** Query-string parameters appended to the URL. */
  params?: Record<string, string | number | boolean>;
  /** Override the request timeout for this call (ms). Default: 15 000. */
  timeoutMs?: number;
  /**
   * When true the client will NOT throw on non-2xx responses.
   * Use in negative tests where a 4xx / 5xx is the expected outcome.
   */
  allowNonOk?: boolean;
  /**
   * Number of automatic retries on transient failures (network errors,
   * 429 Too Many Requests, 5xx).  Default: 0.
   */
  retries?: number;
  /** Delay in ms between retries.  Default: 500. */
  retryDelayMs?: number;
}

/** Configuration passed to the ApiClient constructor. */
export interface ApiClientConfig {
  /** Base URL prepended to every endpoint (e.g. "https://api.example.com"). */
  baseURL?: string;
  /** Default headers sent with every request. */
  defaultHeaders?: Record<string, string>;
  /** Authentication strategy applied to every request. */
  auth?: AuthStrategy;
  /** Global request timeout in milliseconds.  Default: 15 000. */
  timeoutMs?: number;
  /** Enable verbose request/response logging to the console.  Default: false. */
  verbose?: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Auth domain
// ─────────────────────────────────────────────────────────────────────────────

export interface LoginRequest {
  username: string;
  password: string;
}

export interface LoginResponse {
  token:        string;
  refreshToken: string;
  expiresIn:    number;     // seconds
  tokenType:    "Bearer";
  user: {
    id:          string;
    username:    string;
    email:       string;
    displayName: string;
    role:        UserRole;
  };
}

export interface RefreshTokenRequest  { refreshToken: string; }
export interface RefreshTokenResponse { token: string; expiresIn: number; }

// ─────────────────────────────────────────────────────────────────────────────
// User domain
// ─────────────────────────────────────────────────────────────────────────────

export type UserRole = "admin" | "editor" | "viewer";
export type UserStatus = "active" | "suspended" | "pending";

export interface User {
  id:          string;
  username:    string;
  email:       string;
  firstName:   string;
  lastName:    string;
  displayName: string;
  role:        UserRole;
  status:      UserStatus;
  createdAt:   string;   // ISO-8601
  updatedAt:   string;
}

export type CreateUserRequest = Omit<User, "id" | "displayName" | "createdAt" | "updatedAt"> & {
  password: string;
};

export type UpdateUserRequest = Partial<
  Pick<User, "firstName" | "lastName" | "role" | "status">
>;

// ─────────────────────────────────────────────────────────────────────────────
// Product domain
// ─────────────────────────────────────────────────────────────────────────────

export interface Product {
  id:          string;
  name:        string;
  description: string;
  price:       number;      // USD, two decimal places
  sku:         string;
  category:    string;
  stock:       number;
  inStock:     boolean;
  imageUrl:    string | null;
  rating:      number | null;  // 0–5
  createdAt:   string;
  updatedAt:   string;
}

export type CreateProductRequest = Omit<
  Product,
  "id" | "inStock" | "rating" | "createdAt" | "updatedAt"
>;

export type UpdateProductRequest = Partial<
  Pick<Product, "name" | "description" | "price" | "stock" | "category">
>;

// ─────────────────────────────────────────────────────────────────────────────
// Order domain
// ─────────────────────────────────────────────────────────────────────────────

export type OrderStatus =
  | "pending"
  | "confirmed"
  | "processing"
  | "shipped"
  | "delivered"
  | "cancelled"
  | "refunded";

export interface OrderItem {
  productId: string;
  name:      string;
  quantity:  number;
  unitPrice: number;
  total:     number;
}

export interface Order {
  id:          string;
  userId:      string;
  status:      OrderStatus;
  items:       OrderItem[];
  subtotal:    number;
  shipping:    number;
  tax:         number;
  discount:    number;
  total:       number;
  currency:    string;
  shippingAddress: {
    firstName: string;
    lastName:  string;
    line1:     string;
    line2?:    string;
    city:      string;
    state:     string;
    zip:       string;
    country:   string;
  };
  promoCode?:  string;
  createdAt:   string;
  updatedAt:   string;
}

export interface CreateOrderRequest {
  items:      Pick<OrderItem, "productId" | "quantity">[];
  shippingAddress: Order["shippingAddress"];
  promoCode?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared / utility types
// ─────────────────────────────────────────────────────────────────────────────

/** Standard envelope for paginated list endpoints. */
export interface PaginatedResponse<T> {
  data:       T[];
  total:      number;
  page:       number;
  pageSize:   number;
  totalPages: number;
}

/** Standard error shape returned by the API on 4xx / 5xx. */
export interface ApiErrorBody {
  code:     string;          // machine-readable error code (e.g. "USER_NOT_FOUND")
  message:  string;          // human-readable summary
  details?: Record<string, string[]>;  // per-field validation errors
  traceId?: string;          // server-side correlation ID
}

/** Test metadata tags applied to individual test cases. */
export type TestTag = "@smoke" | "@regression" | "@critical" | "@slow" | "@wip";

// ─────────────────────────────────────────────────────────────────────────────
// automationexercise.com response shapes
// ─────────────────────────────────────────────────────────────────────────────
//
// Every endpoint returns HTTP 200.  The real outcome lives in body.responseCode:
//   200 = success
//   201 = created (e.g. account creation)
//   400 = bad request (missing parameter)
//   404 = not found (e.g. user doesn't exist)
//   405 = method not supported
//
// Bodies are JSON, but POST endpoints REQUIRE application/x-www-form-urlencoded
// requests — JSON bodies are rejected with a 400.

/** Generic response envelope used across most AE endpoints. */
export interface AeMessage {
  responseCode: number;
  message:      string;
}

/** Single product entry returned by /productsList and /searchProduct. */
export interface AeProduct {
  id:    number;
  name:  string;
  price: string;       // e.g. "Rs. 500"
  brand: string;
  category: {
    usertype: { usertype: string };
    category: string;
  };
}

/** Single brand entry returned by /brandsList. */
export interface AeBrand {
  id:                  number;
  brand:               string;
}

/** Response from GET /productsList. */
export interface AeProductsList {
  responseCode: number;
  products:     AeProduct[];
}

/** Response from GET /brandsList. */
export interface AeBrandsList {
  responseCode: number;
  brands:       AeBrand[];
}

/** User detail returned by GET /getUserDetailByEmail. */
export interface AeUserDetail {
  responseCode: number;
  user: {
    id:          number;
    name:        string;
    email:       string;
    title:       string;
    birth_day:   string;
    birth_month: string;
    birth_year:  string;
    first_name:  string;
    last_name:   string;
    company:     string;
    address1:    string;
    address2:    string;
    country:     string;
    state:       string;
    city:        string;
    zipcode:     string;
  };
}
