type JsonRecord = Record<string, unknown>;

export interface TabPayment {
  amount: string;
  createdAt: string;
  currency: "USD";
  env: "live" | "test";
  failureReason: string | null;
  id: string;
  intentUrl: string;
  livemode: boolean;
  payerAddress: string | null;
  payerType: "agent" | "human";
  refCode: string;
  reportedAt: string | null;
  reportedTransactionId: string | null;
  settledAt: string | null;
  status: "failed" | "pending" | "settled";
  token: { address: string; chainId: number };
}

export interface TabOptions {
  apiBaseUrl?: string;
  request?: typeof fetch;
}

export class TabApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status = 0,
  ) {
    super(message);
    this.name = "TabApiError";
  }
}

function record(value: unknown): JsonRecord | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as JsonRecord)
    : undefined;
}

function localHostname(hostname: string) {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
}

function configuredBaseUrl(options: TabOptions) {
  const runtime = globalThis as typeof globalThis & {
    process?: { env?: Record<string, string | undefined> };
  };
  return options.apiBaseUrl ?? runtime.process?.env?.TAB_API_BASE_URL;
}

function parseBaseUrl(value: string | undefined) {
  try {
    if (!value?.trim()) throw new Error();
    const url = new URL(value);
    const localHttp = url.protocol === "http:" && localHostname(url.hostname);
    if (
      (url.protocol !== "https:" && !localHttp) ||
      url.username ||
      url.password ||
      url.pathname !== "/" ||
      url.search ||
      url.hash
    ) {
      throw new Error();
    }
    return url.origin;
  } catch {
    throw new TabApiError(
      "INVALID_CONFIGURATION",
      "Set TAB_API_BASE_URL to the root HTTPS Tab API URL.",
    );
  }
}

function parseSecretKey(value: string) {
  if (!/^sk_(?:live|test)_[A-Za-z0-9_-]+$/.test(value)) {
    throw new TabApiError("INVALID_CONFIGURATION", "Tab requires a valid secret API key.");
  }
  return value;
}

const AMOUNT = /^(?:0\.\d{1,6}|[1-9]\d{0,13}(?:\.\d{1,6})?)$/;
const ADDRESS = /^0x[0-9a-f]{40}$/i;
const REF_CODE = /^TAB-[0-9A-HJKMNP-TV-Z]{8}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ARBITRUM_USDC = "0xaf88d065e77c8cc2239327c5edb3a432268e5831";

function isoDate(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const date = new Date(value);
  return !Number.isNaN(date.getTime()) && date.toISOString() === value;
}

function optionalIsoDate(value: unknown): value is string | null {
  return value === null || isoDate(value);
}

function intentUrl(value: unknown) {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    return (
      (url.protocol === "https:" || (url.protocol === "http:" && localHostname(url.hostname))) &&
      !url.username &&
      !url.password &&
      !url.hash
    );
  } catch {
    return false;
  }
}

function nullableAddress(value: unknown): value is string | null {
  return value === null || (typeof value === "string" && ADDRESS.test(value));
}

function optionalText(value: unknown): value is string | null {
  return value === null || (typeof value === "string" && value.trim().length > 0);
}

function parsePayment(value: unknown): TabPayment {
  const payment = record(value);
  const token = record(payment?.token);
  const env = payment?.env;
  const status = payment?.status;
  const reported = payment?.reportedAt !== null || payment?.reportedTransactionId !== null;
  if (
    !payment ||
    !token ||
    typeof payment.amount !== "string" ||
    !AMOUNT.test(payment.amount) ||
    !/[1-9]/.test(payment.amount) ||
    !isoDate(payment.createdAt) ||
    typeof payment.id !== "string" ||
    !UUID.test(payment.id) ||
    !intentUrl(payment.intentUrl) ||
    typeof payment.refCode !== "string" ||
    !REF_CODE.test(payment.refCode) ||
    payment.currency !== "USD" ||
    (env !== "live" && env !== "test") ||
    payment.livemode !== (env === "live") ||
    (payment.payerType !== "agent" && payment.payerType !== "human") ||
    (status !== "failed" && status !== "pending" && status !== "settled") ||
    !optionalText(payment.failureReason) ||
    !nullableAddress(payment.payerAddress) ||
    !optionalIsoDate(payment.reportedAt) ||
    !optionalText(payment.reportedTransactionId) ||
    !optionalIsoDate(payment.settledAt) ||
    (reported &&
      (payment.reportedAt === null ||
        payment.reportedTransactionId === null ||
        payment.payerAddress === null)) ||
    (status === "pending" && (payment.failureReason !== null || payment.settledAt !== null)) ||
    (status === "failed" && (payment.failureReason === null || payment.settledAt !== null)) ||
    (status === "settled" &&
      (payment.failureReason !== null ||
        payment.settledAt === null ||
        payment.reportedAt === null ||
        payment.reportedTransactionId === null ||
        payment.payerAddress === null)) ||
    token.chainId !== 42161 ||
    typeof token.address !== "string" ||
    token.address.toLowerCase() !== ARBITRUM_USDC
  ) {
    throw new TabApiError("INVALID_RESPONSE", "Tab returned an invalid response.");
  }
  return payment as unknown as TabPayment;
}

function apiFailure(body: unknown, status: number) {
  const error = record(record(body)?.error);
  return new TabApiError(
    typeof error?.code === "string" ? error.code : "REQUEST_FAILED",
    typeof error?.message === "string" ? error.message : "The Tab request failed.",
    status,
  );
}

export class Tab {
  readonly payments = {
    list: (options: { limit?: number } = {}) => this.listPayments(options),
    retrieve: (paymentId: string) => this.retrievePayment(paymentId),
  };

  readonly #apiBaseUrl: string;
  readonly #request: typeof fetch;
  readonly #secretKey: string;

  constructor(secretKey: string, options: TabOptions = {}) {
    this.#secretKey = parseSecretKey(secretKey);
    this.#apiBaseUrl = parseBaseUrl(configuredBaseUrl(options));
    this.#request = options.request ?? fetch;
  }

  async #get(path: string) {
    let response: Response;
    try {
      response = await this.#request(new URL(path, this.#apiBaseUrl).toString(), {
        cache: "no-store",
        headers: { authorization: `Bearer ${this.#secretKey}` },
        method: "GET",
      });
    } catch {
      throw new TabApiError("NETWORK_ERROR", "Tab could not be reached.");
    }

    let body: unknown;
    try {
      body = (await response.json()) as unknown;
    } catch {
      throw new TabApiError(
        "INVALID_RESPONSE",
        "Tab returned an invalid response.",
        response.status,
      );
    }
    if (!response.ok) throw apiFailure(body, response.status);
    return body;
  }

  async listPayments(options: { limit?: number }) {
    const limit = options.limit ?? 20;
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
      throw new TabApiError("INVALID_OPTIONS", "Payment list limit must be from 1 to 100.");
    }
    const body = record(await this.#get(`/api/v1/payments?limit=${limit}`));
    if (!Array.isArray(body?.payments)) {
      throw new TabApiError("INVALID_RESPONSE", "Tab returned an invalid response.");
    }
    return body.payments.map(parsePayment);
  }

  async retrievePayment(paymentId: string) {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(paymentId)) {
      throw new TabApiError("INVALID_PAYMENT_ID", "Payment ID must be a UUID.");
    }
    const body = record(await this.#get(`/api/v1/payments/${paymentId}`));
    return parsePayment(body?.payment);
  }
}
