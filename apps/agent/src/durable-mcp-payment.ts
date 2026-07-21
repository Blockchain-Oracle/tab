import { createHash } from "node:crypto";

import { type x402Client, x402HTTPClient } from "@x402/core/client";
import type { PaymentPayload, PaymentRequired, SettleResponse } from "@x402/core/types";
import { MCP_PAYMENT_META_KEY } from "@x402/mcp";

import type { readPaymentAuthorizationState } from "./payment-authorization-state.js";
import { newPaymentEnvelope } from "./payment-envelope.js";
import {
  PaymentEnvelopeJournal,
  PaymentIdempotencyRequiredError,
} from "./payment-envelope-journal.js";
import { validatePaymentIdempotencyKey } from "./payment-envelope-model.js";
import type { PaymentEnvelopeStore } from "./payment-envelope-store.js";
import type { PaymentProfile } from "./payment-profile.js";
import type { TabRemoteSigner } from "./remote-signer.js";

export const MCP_PAYMENT_IDEMPOTENCY_META_KEY = "tab/payment-idempotency-key";
const MAX_MCP_PAYMENT_REQUEST_BYTES = 1_048_576;

interface DurableMcpPaymentOptions {
  address: `0x${string}`;
  authorizationState?: typeof readPaymentAuthorizationState;
  client: x402Client;
  nowSeconds?: () => number;
  paymentProfile: PaymentProfile;
  signer: TabRemoteSigner;
  store: PaymentEnvelopeStore;
}

export interface McpPaymentContext {
  idempotencyKey: string;
  payload: PaymentPayload;
  requestFingerprint: string;
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function canonical(value: unknown): unknown {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (Array.isArray(value)) return value.map(canonical);
  if (record(value)) {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonical(value[key])]),
    );
  }
  throw new Error("The MCP payment request is invalid");
}

function paymentRequest(params: Record<string, unknown>) {
  const copy = { ...params };
  if (record(copy._meta)) {
    const meta = { ...copy._meta };
    delete meta[MCP_PAYMENT_IDEMPOTENCY_META_KEY];
    delete meta[MCP_PAYMENT_META_KEY];
    copy._meta = meta;
  }
  const serialized = JSON.stringify(canonical(copy));
  if (Buffer.byteLength(serialized) > MAX_MCP_PAYMENT_REQUEST_BYTES) {
    throw new Error("The MCP payment request is invalid");
  }
  return createHash("sha256").update(serialized).digest("hex");
}

function paymentKey(params: Record<string, unknown>) {
  const value = record(params._meta) ? params._meta[MCP_PAYMENT_IDEMPOTENCY_META_KEY] : undefined;
  if (value === undefined) return undefined;
  if (typeof value !== "string") throw new PaymentIdempotencyRequiredError();
  return validatePaymentIdempotencyKey(value);
}

export function createDurableMcpPayment(options: DurableMcpPaymentOptions) {
  const httpClient = new x402HTTPClient(options.client);
  const journal = new PaymentEnvelopeJournal({
    address: options.address,
    ...(options.authorizationState ? { authorizationState: options.authorizationState } : {}),
    ...(options.nowSeconds ? { nowSeconds: options.nowSeconds } : {}),
    paymentProfile: options.paymentProfile,
    signer: options.signer,
    store: options.store,
  });

  async function parseContext(
    params: Record<string, unknown>,
    requireKey: boolean,
  ): Promise<{ idempotencyKey?: string; requestFingerprint: string }> {
    const idempotencyKey = paymentKey(params);
    if (requireKey && !idempotencyKey) throw new PaymentIdempotencyRequiredError();
    return {
      ...(idempotencyKey ? { idempotencyKey } : {}),
      requestFingerprint: paymentRequest(params),
    };
  }

  return {
    async create(
      params: Record<string, unknown>,
      challenge: PaymentRequired,
    ): Promise<McpPaymentContext> {
      const context = await parseContext(params, true);
      const idempotencyKey = context.idempotencyKey as string;
      const envelope = await journal.getOrCreate(
        idempotencyKey,
        context.requestFingerprint,
        async () => {
          const payload = await options.client.createPaymentPayload(challenge);
          const header = httpClient.encodePaymentSignatureHeader(payload)["PAYMENT-SIGNATURE"];
          if (!header) throw new Error("The x402 payment payload is invalid");
          return newPaymentEnvelope(payload, header, options.signer);
        },
      );
      const parsed = await journal.parse(envelope);
      return { ...context, idempotencyKey, payload: parsed.payload };
    },

    async load(params: Record<string, unknown>): Promise<McpPaymentContext | null> {
      const context = await parseContext(params, false);
      if (!context.idempotencyKey) return null;
      const envelope = await journal.load(context.idempotencyKey, context.requestFingerprint);
      if (!envelope) return null;
      const parsed = await journal.parse(envelope);
      await journal.reconcileObserved(
        context.idempotencyKey,
        context.requestFingerprint,
        envelope,
        parsed,
      );
      return { ...context, idempotencyKey: context.idempotencyKey, payload: parsed.payload };
    },

    async observe(context: McpPaymentContext, settlement: SettleResponse) {
      const parsed = { payload: context.payload };
      const observed = await journal.recordObservation(
        context.idempotencyKey,
        context.requestFingerprint,
        parsed,
        settlement,
      );
      if (!observed) return { status: "ignored", verified: false } as const;
      await options.client.handlePaymentResponse({
        paymentPayload: context.payload,
        requirements: context.payload.accepted,
        settleResponse: settlement,
      });
      return journal.reconcileObserved(
        context.idempotencyKey,
        context.requestFingerprint,
        observed,
        parsed,
      );
    },
  };
}

export type DurableMcpPayment = ReturnType<typeof createDurableMcpPayment>;
