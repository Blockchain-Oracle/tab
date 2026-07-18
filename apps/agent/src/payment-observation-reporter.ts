import type { PaymentResponseContext } from "@x402/core/client";
import type { PaymentCorrelations } from "./payment-correlation.js";
import { parsePaymentSettlementObservation } from "./payment-settlement-observation.js";
import { readRemoteSignerJson } from "./remote-signer-http.js";

interface PaymentObservationReporterOptions {
  apiKey: string;
  attempts: number;
  correlations: PaymentCorrelations;
  endpoint: URL;
  fetch: typeof globalThis.fetch;
  retryDelayMs: number;
  timeoutMs: number;
}

export type PaymentObservationResult =
  | { status: "failed"; verified: true }
  | { status: "ignored"; verified: false }
  | { status: "pending"; verified: false }
  | { status: "settled"; verified: true };

type Acknowledgement = Exclude<PaymentObservationResult, { status: "ignored" }> & {
  receiptId: string;
};
type Attempt = { acknowledgement?: Acknowledgement; retry: boolean };

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function acknowledgement(value: unknown, status: number): Acknowledgement | undefined {
  if (!record(value) || Object.keys(value).sort().join(",") !== "receiptId,status,verified") {
    return;
  }
  if (typeof value.receiptId !== "string") return;
  if (status === 202 && value.status === "pending" && value.verified === false) {
    return { receiptId: value.receiptId, status: "pending", verified: false };
  }
  if (
    status === 200 &&
    (value.status === "settled" || value.status === "failed") &&
    value.verified === true
  ) {
    return { receiptId: value.receiptId, status: value.status, verified: true };
  }
  return undefined;
}

export class PaymentObservationReporter {
  readonly #apiKey: string;
  readonly #attempts: number;
  readonly #correlations: PaymentCorrelations;
  readonly #endpoint: URL;
  readonly #fetch: typeof globalThis.fetch;
  readonly #inFlight = new Set<Promise<PaymentObservationResult>>();
  readonly #retryDelayMs: number;
  readonly #timeoutMs: number;

  constructor(options: PaymentObservationReporterOptions) {
    this.#apiKey = options.apiKey;
    this.#attempts = options.attempts;
    this.#correlations = options.correlations;
    this.#endpoint = options.endpoint;
    this.#fetch = options.fetch;
    this.#retryDelayMs = options.retryDelayMs;
    this.#timeoutMs = options.timeoutMs;
  }

  async #attempt(body: unknown): Promise<Attempt> {
    const controller = new AbortController();
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const deadline = new Promise<Attempt>((resolve) => {
      timeout = setTimeout(() => {
        controller.abort();
        resolve({ retry: true });
      }, this.#timeoutMs);
    });
    const request = async () => {
      try {
        const response = await this.#fetch(this.#endpoint, {
          body: JSON.stringify(body),
          headers: {
            accept: "application/json",
            authorization: `Bearer ${this.#apiKey}`,
            "content-type": "application/json",
          },
          method: "POST",
          redirect: "error",
          signal: controller.signal,
        });
        if (!response.ok) {
          return { retry: response.status === 429 || response.status >= 500 };
        }
        if (response.status === 204) return { retry: false };
        const parsed = acknowledgement(
          await readRemoteSignerJson(response, controller.signal),
          response.status,
        );
        return {
          ...(parsed ? { acknowledgement: parsed } : {}),
          retry: parsed?.status === "pending",
        };
      } catch {
        return { retry: true };
      }
    };
    try {
      return await Promise.race([request(), deadline]);
    } finally {
      if (timeout) clearTimeout(timeout);
    }
  }

  async #send(
    body: unknown,
    receiptId: string,
    signature: string,
  ): Promise<PaymentObservationResult> {
    let result: PaymentObservationResult = { status: "ignored", verified: false };
    for (let attempt = 0; attempt < this.#attempts; attempt += 1) {
      const attempted = await this.#attempt(body);
      if (attempted.acknowledgement?.receiptId === receiptId) {
        const verified = attempted.acknowledgement;
        result =
          verified.status === "pending"
            ? { status: "pending", verified: false }
            : verified.status === "settled"
              ? { status: "settled", verified: true }
              : { status: "failed", verified: true };
        if (verified.status === "settled") {
          this.#correlations.deleteIf(signature, receiptId);
        }
        if (verified.status !== "pending") return result;
      }
      if (!attempted.retry || attempt === this.#attempts - 1) return result;
      await new Promise<void>((resolve) => setTimeout(resolve, this.#retryDelayMs * (attempt + 1)));
    }
    return result;
  }

  async report(
    context: PaymentResponseContext,
    address: `0x${string}`,
  ): Promise<PaymentObservationResult> {
    const settlement = parsePaymentSettlementObservation(context.settleResponse, {
      ...(context.paymentPayload.x402Version === 2
        ? { amount: context.paymentPayload.accepted.amount }
        : {}),
      network: context.requirements.network,
      payer: address,
    });
    const signature = context.paymentPayload.payload.signature;
    if (!settlement || typeof signature !== "string" || !/^0x[0-9a-fA-F]{130}$/.test(signature)) {
      return { status: "ignored", verified: false };
    }
    const receiptId = this.#correlations.get(signature);
    if (!receiptId) return { status: "ignored", verified: false };
    const task = this.#send(
      {
        outcome: "observed",
        paymentResponse: {
          ...(settlement.success
            ? {}
            : {
                ...(settlement.errorMessage ? { errorMessage: settlement.errorMessage } : {}),
                errorReason: settlement.errorReason,
              }),
          network: settlement.network,
          payer: settlement.payer,
          success: settlement.success,
          transaction: settlement.transaction,
        },
        receiptId,
      },
      receiptId,
      signature,
    );
    this.#inFlight.add(task);
    try {
      return await task;
    } finally {
      this.#inFlight.delete(task);
    }
  }

  async flush() {
    await Promise.allSettled([...this.#inFlight]);
  }
}
