import { TabApiError } from "./tab-errors";

type JsonRecord = Record<string, unknown>;

/** Minimal transport contract the Tab client hands to its resources. */
export interface TabTransport {
  call(method: "DELETE" | "GET" | "PATCH" | "POST", path: string, body?: unknown): Promise<unknown>;
}

export interface TabWebhookEndpoint {
  createdAt: string;
  env: "live" | "test";
  id: string;
  secretLast4: string;
  updatedAt: string;
  url: string;
  verifiedAt: string | null;
}

export interface TabPaymentIntent {
  intent: JsonRecord;
  intentToken: string;
}

function record(value: unknown): JsonRecord | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as JsonRecord)
    : undefined;
}

function endpointView(value: unknown): TabWebhookEndpoint {
  const endpoint = record(value);
  if (
    !endpoint ||
    typeof endpoint.id !== "string" ||
    typeof endpoint.url !== "string" ||
    typeof endpoint.secretLast4 !== "string" ||
    (endpoint.env !== "live" && endpoint.env !== "test")
  ) {
    throw new TabApiError("INVALID_RESPONSE", "Tab returned an invalid response.");
  }
  return endpoint as unknown as TabWebhookEndpoint;
}

/**
 * Webhook management: one endpoint per environment. `configure` is
 * idempotent — it creates the endpoint or updates the URL of the existing
 * one. The whsec_ signing secret is returned ONLY on first creation.
 */
export class TabWebhooks {
  readonly #transport: TabTransport;

  constructor(transport: TabTransport) {
    this.#transport = transport;
  }

  async configure(options: { url: string }): Promise<{
    endpoint: TabWebhookEndpoint;
    /** Present only when the endpoint was just created. Store it now. */
    signingSecret?: string;
  }> {
    if (typeof options.url !== "string" || options.url.length === 0) {
      throw new TabApiError("INVALID_OPTIONS", "A webhook url is required.");
    }
    const existing = await this.get();
    if (existing) {
      const body = record(
        await this.#transport.call("PATCH", "/api/v1/webhook-endpoint", { url: options.url }),
      );
      return { endpoint: endpointView(body?.endpoint) };
    }
    const body = record(
      await this.#transport.call("POST", "/api/v1/webhook-endpoint", { url: options.url }),
    );
    const secret = body?.secret;
    if (typeof secret !== "string") {
      throw new TabApiError("INVALID_RESPONSE", "Tab returned an invalid response.");
    }
    return {
      endpoint: endpointView(record(body?.endpoint) ?? body?.endpoint),
      signingSecret: secret,
    };
  }

  async get(): Promise<TabWebhookEndpoint | null> {
    const body = record(await this.#transport.call("GET", "/api/v1/webhook-endpoint"));
    if (body?.endpoint === null || body?.endpoint === undefined) return null;
    return endpointView(body.endpoint);
  }

  async remove(): Promise<void> {
    await this.#transport.call("DELETE", "/api/v1/webhook-endpoint");
  }

  async sendTest(): Promise<{ delivered: boolean }> {
    const body = record(await this.#transport.call("POST", "/api/v1/webhook-endpoint/test"));
    return { delivered: body?.ok === true || body?.delivered === true };
  }
}

/** Signed payment intents — the server-side half of a checkout. */
export class TabPaymentIntents {
  readonly #transport: TabTransport;

  constructor(transport: TabTransport) {
    this.#transport = transport;
  }

  async create(options: { amount: string; intentUrl: string }): Promise<TabPaymentIntent> {
    if (typeof options.amount !== "string" || typeof options.intentUrl !== "string") {
      throw new TabApiError("INVALID_OPTIONS", "amount and intentUrl are required.");
    }
    const body = record(
      await this.#transport.call("POST", "/api/v1/payment-intents", {
        amount: options.amount,
        intentUrl: options.intentUrl,
      }),
    );
    const intent = record(body?.intent);
    if (!intent || typeof body?.intentToken !== "string") {
      throw new TabApiError("INVALID_RESPONSE", "Tab returned an invalid response.");
    }
    return { intent, intentToken: body.intentToken };
  }
}
