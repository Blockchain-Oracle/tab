import type { PaymentResponseContext } from "@x402/core/client";
import type { ClientEvmSigner } from "@x402/evm";
import { isAddress } from "viem";

import { currentPaymentOrigin } from "./origin-context.js";
import { ARBITRUM_NETWORK, BASE_NETWORK } from "./routing.js";

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
  origin?: () => PaymentOrigin | undefined;
}

interface SignerRequest {
  domain: Record<string, unknown>;
  message: Record<string, unknown>;
  primaryType: string;
  types: Record<string, unknown>;
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

function stringValue(value: unknown, field: string) {
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "number" && Number.isSafeInteger(value)) return String(value);
  if (typeof value === "string" && value.length > 0) return value;
  throw new RemoteSignerError("INVALID_SIGNER_REQUEST", `${field} is invalid.`, 400);
}

function networkFromChainId(value: unknown) {
  const chainId = stringValue(value, "domain.chainId");
  if (chainId === "8453") return BASE_NETWORK;
  if (chainId === "42161") return ARBITRUM_NETWORK;
  throw new RemoteSignerError("UNSUPPORTED_NETWORK", "The signing network is unsupported.", 400);
}

function addressValue(value: unknown, field: string) {
  if (typeof value !== "string" || !isAddress(value)) {
    throw new RemoteSignerError("INVALID_SIGNER_REQUEST", `${field} is invalid.`, 400);
  }
  return value;
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
  readonly #origin: (() => PaymentOrigin | undefined) | undefined;
  readonly #resultEndpoint: URL;
  readonly #receiptBySignature = new Map<string, string>();

  constructor(options: RemoteSignerOptions) {
    if (!isAddress(options.address)) throw new Error("Leash signer address is invalid");
    if (!options.apiKey) throw new Error("LEASH_API_KEY is required");
    this.address = options.address;
    this.#apiKey = options.apiKey;
    this.#endpoint = new URL("/api/agent/sign", options.apiBaseUrl);
    this.#fetch = options.fetch ?? globalThis.fetch;
    this.#origin = options.origin ?? currentPaymentOrigin;
    this.#resultEndpoint = new URL("/api/agent/pay/result", options.apiBaseUrl);
  }

  async signTypedData(signerRequest: SignerRequest): Promise<`0x${string}`> {
    const network = networkFromChainId(signerRequest.domain.chainId);
    const amount = stringValue(signerRequest.message.value, "message.value");
    const payTo = addressValue(signerRequest.message.to, "message.to");
    const asset = addressValue(signerRequest.domain.verifyingContract, "domain.verifyingContract");
    const origin = this.#origin?.();
    const response = await this.#fetch(this.#endpoint, {
      body: jsonBody({
        amount,
        asset,
        network,
        ...(origin ? { origin } : {}),
        payTo,
        signerRequest,
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
    this.#receiptBySignature.set(body.signature, body.receiptId);
    return body.signature as `0x${string}`;
  }

  takeReceiptId(signature: string) {
    const receiptId = this.#receiptBySignature.get(signature) ?? null;
    this.#receiptBySignature.delete(signature);
    return receiptId;
  }

  async reportSettledPayment(context: PaymentResponseContext) {
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
      return;
    }
    const receiptId = this.#receiptBySignature.get(signature);
    if (!receiptId) return;

    const response = await this.#fetch(this.#resultEndpoint, {
      body: JSON.stringify({ outcome: "settled", paymentResponse: settlement, receiptId }),
      headers: { authorization: `Bearer ${this.#apiKey}`, "content-type": "application/json" },
      method: "POST",
    });
    if (!response.ok) throw await responseError(response);
    this.#receiptBySignature.delete(signature);
  }
}
