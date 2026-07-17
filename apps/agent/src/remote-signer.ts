import type { PaymentResponseContext } from "@x402/core/client";
import type { ClientEvmSigner } from "@x402/evm";
import { isAddress, isAddressEqual, recoverTypedDataAddress } from "viem";

import {
  InvalidEip3009AuthorizationError,
  parseExactEip3009Authorization,
  type SignerRequest,
} from "./eip3009-authorization.js";
import { currentPaymentOrigin } from "./origin-context.js";

export interface PaymentOrigin {
  clientName: string;
  toolName: string;
  transport: "http" | "mcp";
}

interface RemoteSignerOptions {
  address: `0x${string}`;
  apiBaseUrl: string;
  apiKey: string;
  fetch?: typeof globalThis.fetch;
  nowSeconds?: () => number;
  origin?: () => PaymentOrigin | undefined;
  reportAttempts?: number;
  reportRetryDelayMs?: number;
  reportTimeoutMs?: number;
}

export class RemoteSignerError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "RemoteSignerError";
  }
}

function jsonBody(value: unknown) {
  return JSON.stringify(value, (_key, field) =>
    typeof field === "bigint" ? field.toString() : field,
  );
}

async function responseError(response: Response) {
  try {
    const body = (await response.json()) as { error?: { code?: unknown; message?: unknown } };
    if (typeof body.error?.code === "string" && typeof body.error.message === "string") {
      return new RemoteSignerError(body.error.code, body.error.message, response.status);
    }
  } catch {
    // The status still fails closed below when an upstream body is not JSON.
  }
  return new RemoteSignerError(
    "SIGNER_REQUEST_FAILED",
    "The signer request failed.",
    response.status,
  );
}

export class LeashRemoteSigner implements ClientEvmSigner {
  readonly address: `0x${string}`;
  readonly #apiKey: string;
  readonly #endpoint: URL;
  readonly #fetch: typeof globalThis.fetch;
  readonly #inFlightObservations = new Set<Promise<void>>();
  readonly #nowSeconds: () => number;
  readonly #origin: (() => PaymentOrigin | undefined) | undefined;
  readonly #reportAttempts: number;
  readonly #reportRetryDelayMs: number;
  readonly #reportTimeoutMs: number;
  readonly #resultEndpoint: URL;
  readonly #receiptBySignature = new Map<string, string>();

  constructor(options: RemoteSignerOptions) {
    if (!isAddress(options.address)) throw new Error("Leash signer address is invalid");
    if (!options.apiKey) throw new Error("LEASH_API_KEY is required");
    this.address = options.address;
    this.#apiKey = options.apiKey;
    this.#endpoint = new URL("/api/agent/sign", options.apiBaseUrl);
    this.#fetch = options.fetch ?? globalThis.fetch;
    this.#nowSeconds = options.nowSeconds ?? (() => Math.floor(Date.now() / 1_000));
    this.#origin = options.origin ?? currentPaymentOrigin;
    this.#reportAttempts = options.reportAttempts ?? 3;
    this.#reportRetryDelayMs = options.reportRetryDelayMs ?? 250;
    this.#reportTimeoutMs = options.reportTimeoutMs ?? 2_000;
    if (
      !Number.isSafeInteger(this.#reportAttempts) ||
      this.#reportAttempts < 1 ||
      !Number.isSafeInteger(this.#reportRetryDelayMs) ||
      this.#reportRetryDelayMs < 0 ||
      !Number.isSafeInteger(this.#reportTimeoutMs) ||
      this.#reportTimeoutMs < 1
    ) {
      throw new Error("Leash result-report timeout is invalid");
    }
    this.#resultEndpoint = new URL("/api/agent/pay/result", options.apiBaseUrl);
  }

  async signTypedData(signerRequest: SignerRequest): Promise<`0x${string}`> {
    let authorization: ReturnType<typeof parseExactEip3009Authorization>;
    try {
      authorization = parseExactEip3009Authorization(signerRequest, {
        address: this.address,
        nowSeconds: this.#nowSeconds(),
      });
    } catch (error) {
      if (!(error instanceof InvalidEip3009AuthorizationError)) throw error;
      throw new RemoteSignerError("INVALID_SIGNER_REQUEST", "The signer request is invalid.", 400);
    }
    const origin = this.#origin?.();
    const response = await this.#fetch(this.#endpoint, {
      body: jsonBody({
        amount: authorization.amount,
        asset: authorization.asset,
        network: authorization.network,
        ...(origin ? { origin } : {}),
        payTo: authorization.payTo,
        signerRequest: authorization.typedData,
      }),
      headers: { authorization: `Bearer ${this.#apiKey}`, "content-type": "application/json" },
      method: "POST",
    });
    if (!response.ok) throw await responseError(response);

    const body = (await response.json()) as { receiptId?: unknown; signature?: unknown };
    if (
      typeof body.receiptId !== "string" ||
      typeof body.signature !== "string" ||
      !/^0x[0-9a-fA-F]{130}$/.test(body.signature)
    ) {
      throw new RemoteSignerError(
        "INVALID_SIGNER_RESPONSE",
        "The signer response is invalid.",
        502,
      );
    }
    const signature = body.signature as `0x${string}`;
    try {
      const recovered = await recoverTypedDataAddress({
        ...authorization.typedData,
        signature,
      });
      if (!isAddressEqual(recovered, this.address)) throw new Error("Signer mismatch");
    } catch {
      throw new RemoteSignerError(
        "INVALID_SIGNER_RESPONSE",
        "The signer response is invalid.",
        502,
      );
    }
    this.#receiptBySignature.set(signature.toLowerCase(), body.receiptId);
    return signature;
  }

  receiptIdForSignature(signature: string) {
    return this.#receiptBySignature.get(signature.toLowerCase()) ?? null;
  }

  async #sendObservationAttempt(body: unknown) {
    const controller = new AbortController();
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const deadline = new Promise<null>((resolve) => {
      timeout = setTimeout(() => {
        controller.abort();
        resolve(null);
      }, this.#reportTimeoutMs);
    });
    try {
      const response = await Promise.race([
        this.#fetch(this.#resultEndpoint, {
          body: JSON.stringify(body),
          headers: { authorization: `Bearer ${this.#apiKey}`, "content-type": "application/json" },
          method: "POST",
          signal: controller.signal,
        }),
        deadline,
      ]);
      if (!response) return { retry: true, verified: false };
      if (!response.ok) {
        return {
          retry: response.status === 429 || response.status >= 500,
          verified: false,
        };
      }
      if (response.status === 204) return { retry: false, verified: false };
      try {
        const acknowledgement = (await response.json()) as {
          receiptId?: unknown;
          status?: unknown;
          verified?: unknown;
        };
        const acknowledgedReceipt =
          typeof acknowledgement.receiptId === "string" ? acknowledgement.receiptId : undefined;
        return {
          retry:
            response.status === 202 &&
            acknowledgement.status === "pending" &&
            acknowledgement.verified === false &&
            acknowledgedReceipt !== undefined,
          verified:
            response.status === 200 &&
            acknowledgement.verified === true &&
            acknowledgement.status === "settled" &&
            acknowledgedReceipt !== undefined,
          verifiedReceiptId: acknowledgedReceipt,
        };
      } catch {
        return { retry: false, verified: false };
      }
    } catch {
      return { retry: true, verified: false };
    } finally {
      if (timeout) clearTimeout(timeout);
    }
  }

  async #sendObservation(body: unknown, receiptId: string, signature: string) {
    for (let attempt = 0; attempt < this.#reportAttempts; attempt += 1) {
      const result = await this.#sendObservationAttempt(body);
      if (result.verified && result.verifiedReceiptId === receiptId) {
        const normalizedSignature = signature.toLowerCase();
        if (this.#receiptBySignature.get(normalizedSignature) === receiptId) {
          this.#receiptBySignature.delete(normalizedSignature);
        }
        return;
      }
      if (!result.retry || attempt === this.#reportAttempts - 1) return;
      await new Promise<void>((resolve) =>
        setTimeout(resolve, this.#reportRetryDelayMs * (attempt + 1)),
      );
    }
  }

  reportPaymentObservation(context: PaymentResponseContext): Promise<void> {
    const settlement = context.settleResponse;
    const signature = context.paymentPayload.payload.signature;
    if (
      settlement?.success !== true ||
      typeof signature !== "string" ||
      settlement.network !== context.requirements.network ||
      !isAddress(settlement.payer ?? "") ||
      settlement.payer?.toLowerCase() !== this.address.toLowerCase() ||
      !/^0x[0-9a-fA-F]{64}$/.test(settlement.transaction)
    ) {
      return Promise.resolve();
    }
    const receiptId = this.#receiptBySignature.get(signature.toLowerCase());
    if (!receiptId) return Promise.resolve();

    const task = this.#sendObservation(
      {
        outcome: "observed",
        paymentResponse: {
          network: settlement.network,
          payer: settlement.payer,
          success: true,
          transaction: settlement.transaction,
        },
        receiptId,
      },
      receiptId,
      signature,
    );
    this.#inFlightObservations.add(task);
    void task.finally(() => this.#inFlightObservations.delete(task));
    return Promise.resolve();
  }

  async flushPaymentObservations() {
    await Promise.allSettled([...this.#inFlightObservations]);
  }
}
