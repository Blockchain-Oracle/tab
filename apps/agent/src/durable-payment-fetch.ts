import { type x402Client, x402HTTPClient } from "@x402/core/client";
import type { PaymentRequired } from "@x402/core/types";

import type { readPaymentAuthorizationState } from "./payment-authorization-state.js";
import { newPaymentEnvelope } from "./payment-envelope.js";
import {
  PaymentEnvelopeJournal,
  PaymentIdempotencyRequiredError,
  PaymentReconciliationRequiredError,
} from "./payment-envelope-journal.js";
import type { PaymentEnvelopeRecord, PaymentEnvelopeStore } from "./payment-envelope-store.js";
import type { PaymentProfile } from "./payment-profile.js";
import { fingerprintPaymentRequest } from "./payment-request-fingerprint.js";
import type { TabRemoteSigner } from "./remote-signer.js";

const MAX_PAYMENT_REQUIRED_BODY_BYTES = 65_536;

async function boundedJson(response: Response) {
  if (!response.body) return undefined;
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > MAX_PAYMENT_REQUIRED_BODY_BYTES) {
        await reader.cancel().catch(() => undefined);
        throw new Error("Payment-required response is too large");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  return text ? (JSON.parse(text) as unknown) : undefined;
}

async function paymentRequired(response: Response, client: x402HTTPClient) {
  const getHeader = (name: string) => response.headers.get(name);
  try {
    const required = client.getPaymentRequiredResponse(getHeader);
    void response.body?.cancel().catch(() => undefined);
    return required;
  } catch {
    const body = await boundedJson(response);
    return client.getPaymentRequiredResponse(getHeader, body);
  }
}

interface DurablePaymentFetchOptions {
  address: `0x${string}`;
  authorizationState?: typeof readPaymentAuthorizationState;
  client: x402Client;
  fetch: typeof globalThis.fetch;
  idempotencyKey: () => string | undefined;
  nowSeconds?: () => number;
  paymentProfile: PaymentProfile;
  signer: TabRemoteSigner;
  store: PaymentEnvelopeStore;
}

export function createDurablePaymentFetch(options: DurablePaymentFetchOptions) {
  const httpClient = new x402HTTPClient(options.client);
  const journal = new PaymentEnvelopeJournal({
    address: options.address,
    ...(options.authorizationState ? { authorizationState: options.authorizationState } : {}),
    ...(options.nowSeconds ? { nowSeconds: options.nowSeconds } : {}),
    paymentProfile: options.paymentProfile,
    signer: options.signer,
    store: options.store,
  });

  async function processPaidResponse(
    response: Response,
    parsed: Awaited<ReturnType<PaymentEnvelopeJournal["parse"]>>,
    idempotencyKey: string,
    requestFingerprint: string,
  ) {
    const result = await httpClient.processPaymentResult(
      parsed.payload,
      (name) => response.headers.get(name),
      response.status,
    );
    if (result.settleResponse) {
      const observed = await journal.recordObservation(
        idempotencyKey,
        requestFingerprint,
        parsed,
        result.settleResponse,
      );
      if (observed) {
        await journal.reconcileObserved(idempotencyKey, requestFingerprint, observed, parsed);
      }
    }
    return response;
  }

  async function sendEnvelope(
    request: Request,
    envelope: PaymentEnvelopeRecord,
    idempotencyKey: string,
    requestFingerprint: string,
  ) {
    const parsed = await journal.parse(envelope);
    await journal.reconcileObserved(idempotencyKey, requestFingerprint, envelope, parsed);
    request.headers.set("PAYMENT-SIGNATURE", envelope.paymentSignature);
    request.headers.set("Access-Control-Expose-Headers", "PAYMENT-RESPONSE,X-PAYMENT-RESPONSE");
    const response = await options.fetch(request);
    return processPaidResponse(response, parsed, idempotencyKey, requestFingerprint);
  }

  return async (input: Request | string | URL, init?: RequestInit) => {
    const request = new Request(input, init);
    const paymentRequest = request.clone();
    const requestFingerprint = await fingerprintPaymentRequest(request.clone());
    const idempotencyKey = options.idempotencyKey();
    if (idempotencyKey) {
      const existing = await journal.load(idempotencyKey, requestFingerprint);
      if (existing) {
        return sendEnvelope(paymentRequest, existing, idempotencyKey, requestFingerprint);
      }
    }

    const response = await options.fetch(request);
    if (response.status !== 402) return response;
    if (!idempotencyKey) {
      await response.body?.cancel().catch(() => undefined);
      throw new PaymentIdempotencyRequiredError();
    }

    const required: PaymentRequired = await paymentRequired(response, httpClient);
    const hookHeaders = await httpClient.handlePaymentRequired(required);
    if (hookHeaders) {
      const hookRequest = paymentRequest.clone();
      for (const [name, value] of Object.entries(hookHeaders)) hookRequest.headers.set(name, value);
      const hookResponse = await options.fetch(hookRequest);
      if (hookResponse.status !== 402) return hookResponse;
      await hookResponse.body?.cancel().catch(() => undefined);
    }

    const envelope = await journal.getOrCreate(idempotencyKey, requestFingerprint, async () => {
      const payload = await options.client.createPaymentPayload(required);
      const headers = httpClient.encodePaymentSignatureHeader(payload);
      const paymentSignature = headers["PAYMENT-SIGNATURE"];
      if (!paymentSignature) throw new Error("The x402 payment header is invalid");
      return newPaymentEnvelope(payload, paymentSignature, options.signer);
    });
    return sendEnvelope(paymentRequest, envelope, idempotencyKey, requestFingerprint);
  };
}

export { PaymentIdempotencyRequiredError, PaymentReconciliationRequiredError };
