import type { ClientEvmSigner } from "@x402/evm";
import { isAddress, isAddressEqual, recoverTypedDataAddress } from "viem";

import { validateControlPlaneOrigin } from "./control-plane-origin.js";
import {
  InvalidEip3009AuthorizationError,
  parseExactEip3009Authorization,
  type SignerRequest,
} from "./eip3009-authorization.js";
import { currentPaymentOrigin, currentPaymentResourceUrl } from "./origin-context.js";
import { PaymentCorrelations } from "./payment-correlation.js";
import { PaymentObservationReporter } from "./payment-observation-reporter.js";
import { currentPaymentSignal } from "./payment-signal.js";
import { postRemoteSignerJson, RemoteSignerError } from "./remote-signer-http.js";
import { redactPaymentResourceUrl } from "./resource-url.js";

export { RemoteSignerError } from "./remote-signer-http.js";

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
  paymentProfile: import("./payment-profile.js").PaymentProfile;
  resourceUrl?: () => string | undefined;
  reportAttempts?: number;
  reportRetryDelayMs?: number;
  reportTimeoutMs?: number;
  signal?: () => AbortSignal | undefined;
  signTimeoutMs?: number;
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export class TabRemoteSigner implements ClientEvmSigner {
  readonly address: `0x${string}`;
  readonly #apiKey: string;
  readonly #correlations: PaymentCorrelations;
  readonly #endpoint: URL;
  readonly #fetch: typeof globalThis.fetch;
  readonly #nowSeconds: () => number;
  readonly #observationReporter: PaymentObservationReporter;
  readonly #origin: (() => PaymentOrigin | undefined) | undefined;
  readonly #paymentProfile: import("./payment-profile.js").PaymentProfile;
  readonly #reconcileEndpoint: URL;
  readonly #resourceUrl: (() => string | undefined) | undefined;
  readonly #signal: () => AbortSignal | undefined;
  readonly #signTimeoutMs: number;

  constructor(options: RemoteSignerOptions) {
    if (!isAddress(options.address)) throw new Error("Agent signer address is invalid");
    if (!options.apiKey) throw new Error("TAB_AGENT_KEY is required");
    this.address = options.address;
    this.#apiKey = options.apiKey;
    const apiBaseUrl = validateControlPlaneOrigin(options.apiBaseUrl);
    this.#endpoint = new URL("/api/agent/sign", apiBaseUrl);
    this.#fetch = options.fetch ?? globalThis.fetch;
    this.#nowSeconds = options.nowSeconds ?? (() => Math.floor(Date.now() / 1_000));
    this.#correlations = new PaymentCorrelations(this.#nowSeconds);
    this.#origin = options.origin ?? currentPaymentOrigin;
    this.#paymentProfile = options.paymentProfile;
    this.#resourceUrl = options.resourceUrl ?? currentPaymentResourceUrl;
    const reportAttempts = options.reportAttempts ?? 3;
    const reportRetryDelayMs = options.reportRetryDelayMs ?? 250;
    const reportTimeoutMs = options.reportTimeoutMs ?? 7_500;
    this.#reconcileEndpoint = new URL("/api/agent/pay/reconcile", apiBaseUrl);
    this.#signal = options.signal ?? currentPaymentSignal;
    this.#signTimeoutMs = options.signTimeoutMs ?? 10_000;
    if (
      !Number.isSafeInteger(reportAttempts) ||
      reportAttempts < 1 ||
      !Number.isSafeInteger(reportRetryDelayMs) ||
      reportRetryDelayMs < 0 ||
      !Number.isSafeInteger(reportTimeoutMs) ||
      reportTimeoutMs < 1 ||
      !Number.isSafeInteger(this.#signTimeoutMs) ||
      this.#signTimeoutMs < 1
    ) {
      throw new Error("Agent result-report timeout is invalid");
    }
    this.#observationReporter = new PaymentObservationReporter({
      apiKey: this.#apiKey,
      attempts: reportAttempts,
      correlations: this.#correlations,
      endpoint: new URL("/api/agent/pay/result", apiBaseUrl),
      fetch: this.#fetch,
      retryDelayMs: reportRetryDelayMs,
      timeoutMs: reportTimeoutMs,
    });
  }

  async signTypedData(signerRequest: SignerRequest): Promise<`0x${string}`> {
    let authorization: ReturnType<typeof parseExactEip3009Authorization>;
    try {
      authorization = parseExactEip3009Authorization(signerRequest, {
        address: this.address,
        nowSeconds: this.#nowSeconds(),
        paymentProfile: this.#paymentProfile,
      });
    } catch (error) {
      if (!(error instanceof InvalidEip3009AuthorizationError)) throw error;
      throw new RemoteSignerError("INVALID_SIGNER_REQUEST", "The signer request is invalid.", 400);
    }
    const origin = this.#origin?.();
    const rawResourceUrl = this.#resourceUrl?.();
    const resourceUrl =
      rawResourceUrl === undefined ? undefined : redactPaymentResourceUrl(rawResourceUrl);
    const paymentSignal = this.#signal();
    const body = (await postRemoteSignerJson({
      apiKey: this.#apiKey,
      body: {
        amount: authorization.amount,
        asset: authorization.asset,
        network: authorization.network,
        ...(origin ? { origin } : {}),
        payTo: authorization.payTo,
        ...(resourceUrl ? { resourceUrl } : {}),
        signerRequest: authorization.typedData,
      },
      endpoint: this.#endpoint,
      fetch: this.#fetch,
      ...(paymentSignal ? { signal: paymentSignal } : {}),
      timeoutMs: this.#signTimeoutMs,
    })) as { receiptId?: unknown; signature?: unknown };
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
    this.#correlations.set(
      signature,
      body.receiptId,
      Number(authorization.typedData.message.validBefore),
    );
    return signature;
  }

  receiptIdForSignature(signature: string) {
    return this.#correlations.get(signature);
  }

  restorePaymentCorrelation(signature: string, receiptId: string, validBeforeSeconds: number) {
    this.#correlations.restore(signature, receiptId, validBeforeSeconds);
  }

  async reconcileExpiredPayment(receiptId: string) {
    if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(receiptId)) return false;
    try {
      const signal = this.#signal();
      const acknowledgement = await postRemoteSignerJson({
        apiKey: this.#apiKey,
        body: { receiptId },
        endpoint: this.#reconcileEndpoint,
        fetch: this.#fetch,
        ...(signal ? { signal } : {}),
        timeoutMs: this.#signTimeoutMs,
      });
      return (
        record(acknowledgement) &&
        acknowledgement.receiptId === receiptId &&
        acknowledgement.status === "failed" &&
        acknowledgement.verified === true
      );
    } catch {
      return false;
    }
  }

  reportPaymentObservation(context: import("@x402/core/client").PaymentResponseContext) {
    return this.#observationReporter.report(context, this.address);
  }

  async flushPaymentObservations() {
    await this.#observationReporter.flush();
  }
}
