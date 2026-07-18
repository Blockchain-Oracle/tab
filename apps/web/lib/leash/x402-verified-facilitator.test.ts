import { encodePaymentSignatureHeader } from "@x402/core/http";
import type { FacilitatorClient, HTTPAdapter } from "@x402/core/server";
import type {
  PaymentPayload,
  PaymentRequirements,
  SettleResponse,
  SupportedResponse,
  VerifyResponse,
} from "@x402/core/types";
import { describe, expect, it, vi } from "vitest";

import { fingerprintX402Payment } from "./x402-payment-fingerprint";
import type { X402AuthorizationIdentity } from "./x402-replay-identity";
import type { DurableX402Attempt } from "./x402-settlement-attempt-store";
import type { SettlementProofResult } from "./x402-settlement-proof";
import {
  BASE_SEPOLIA_USDC,
  buildX402TestnetHttpServer,
  X402_TESTNET_AMOUNT,
  X402_TESTNET_FACILITATOR,
  X402_TESTNET_NETWORK,
  type X402TestnetResourceConfig,
  type X402TestnetSettlement,
} from "./x402-testnet-resource";
import { VerifiedX402Facilitator } from "./x402-verified-facilitator";

const payer = "0x2000000000000000000000000000000000000002";
const payee = "0x1000000000000000000000000000000000000001";
const nonce = `0x${"12".repeat(32)}` as const;
const transaction = `0x${"ab".repeat(32)}` as const;
const config: X402TestnetResourceConfig = {
  amount: X402_TESTNET_AMOUNT,
  asset: BASE_SEPOLIA_USDC,
  facilitatorUrl: X402_TESTNET_FACILITATOR,
  network: X402_TESTNET_NETWORK,
  payee,
  resourceUrl: "https://tab.example/api/x402/testnet",
};
const requirements: PaymentRequirements = {
  amount: X402_TESTNET_AMOUNT,
  asset: BASE_SEPOLIA_USDC,
  extra: { name: "USDC", version: "2" },
  maxTimeoutSeconds: 120,
  network: X402_TESTNET_NETWORK,
  payTo: payee,
  scheme: "exact",
};
const payload: PaymentPayload = {
  accepted: requirements,
  payload: {
    authorization: {
      from: payer,
      nonce,
      to: payee,
      validAfter: "0",
      validBefore: "2000000000",
      value: X402_TESTNET_AMOUNT,
    },
    signature: `0x${"11".repeat(65)}`,
  },
  x402Version: 2,
};
const response: SettleResponse = {
  amount: X402_TESTNET_AMOUNT,
  network: X402_TESTNET_NETWORK,
  payer,
  success: true,
  transaction,
};

class Delegate implements FacilitatorClient {
  getSupported = vi.fn(
    async (): Promise<SupportedResponse> => ({
      extensions: [],
      kinds: [{ network: X402_TESTNET_NETWORK, scheme: "exact", x402Version: 2 }],
      signers: {},
    }),
  );
  settle = vi.fn(async (): Promise<SettleResponse> => response);
  verify = vi.fn(async (): Promise<VerifyResponse> => ({ isValid: true, payer }));
}

class PaidAdapter implements HTTPAdapter {
  getAcceptHeader() {
    return "application/json";
  }
  getHeader(name: string) {
    return name.toLowerCase() === "payment-signature"
      ? encodePaymentSignatureHeader(payload)
      : undefined;
  }
  getMethod() {
    return "GET";
  }
  getPath() {
    return "/api/x402/testnet";
  }
  getUrl() {
    return "https://tab.example/api/x402/testnet";
  }
  getUserAgent() {
    return "vitest";
  }
}

function settlement(): X402TestnetSettlement {
  return {
    amount: X402_TESTNET_AMOUNT,
    asset: BASE_SEPOLIA_USDC,
    authorizationValidAfter: "0",
    authorizationValidBefore: "2000000000",
    endpoint: config.resourceUrl,
    facilitatorResponse: response,
    facilitatorUrl: X402_TESTNET_FACILITATOR,
    network: X402_TESTNET_NETWORK,
    nonce,
    payee,
    payer,
    testFunds: true,
    transactionHash: transaction,
  };
}

function attempt(): DurableX402Attempt {
  const {
    facilitatorResponse: _response,
    transactionHash: _transaction,
    ...identity
  } = settlement();
  return {
    ...identity,
    facilitatorResponse: null,
    paymentFingerprint: fingerprintX402Payment(payload),
    startBlock: "100",
    transactionHash: null,
  };
}

function dependencies() {
  return {
    beginAttempt: vi.fn(async () => ({ attempt: attempt(), created: true })),
    commitVerified: vi.fn(
      async (_value: X402TestnetSettlement, _paymentFingerprint: string) => undefined,
    ),
    loadAttempt: vi.fn(async () => null as DurableX402Attempt | null),
    loadFinal: vi.fn(
      async () => null as { paymentFingerprint: string; settlement: X402TestnetSettlement } | null,
    ),
    loadRetryable: vi.fn(
      async (_identity: X402AuthorizationIdentity) =>
        null as { paymentFingerprint: string; settlement: X402TestnetSettlement } | null,
    ),
    persistRetryable: vi.fn(
      async (
        _value: X402TestnetSettlement,
        _retry: {
          attempts: number;
          paymentFingerprint: string;
          reason: "receipt_not_propagated" | "rpc_unavailable";
        },
      ) => undefined,
    ),
    noteAttemptRetry: vi.fn(async () => undefined),
    persistAttemptResult: vi.fn(
      async (_value: X402TestnetSettlement, _paymentFingerprint: string) => undefined,
    ),
    recoverAttempt: vi.fn(async () => ({ status: "pending" as const })),
    signatureVerifier: vi.fn(async () => true),
    sleep: vi.fn(async (_milliseconds: number) => undefined),
    verifySettlement: vi.fn<(_settlement: X402TestnetSettlement) => Promise<SettlementProofResult>>(
      async () => ({ status: "verified" }),
    ),
    verificationDelaysMs: [1, 2] as const,
  };
}

describe("authoritative x402 facilitator decorator", () => {
  it("delegates supported/verify and returns settle success only after proof is committed", async () => {
    const delegate = new Delegate();
    const deps = dependencies();
    const client = new VerifiedX402Facilitator(delegate, config, deps);

    await expect(client.getSupported()).resolves.toEqual(await delegate.getSupported());
    await expect(client.verify(payload, requirements)).resolves.toMatchObject({ isValid: true });
    await expect(client.settle(payload, requirements)).resolves.toEqual(response);

    expect(delegate.settle).toHaveBeenCalledOnce();
    expect(deps.verifySettlement).toHaveBeenCalledWith(settlement());
    expect(deps.commitVerified).toHaveBeenCalledWith(settlement(), fingerprintX402Payment(payload));
    expect(deps.persistRetryable).not.toHaveBeenCalled();
  });

  it("uses bounded backoff, persists retryable public evidence, and prevents a protected 200", async () => {
    const delegate = new Delegate();
    const deps = dependencies();
    deps.verifySettlement.mockResolvedValue({
      reason: "receipt_not_propagated",
      status: "retryable",
    });
    const client = new VerifiedX402Facilitator(delegate, config, deps);
    const server = buildX402TestnetHttpServer(config, {
      facilitator: client,
    });

    const result = await server.processSettlement(payload, requirements);

    expect(result.success).toBe(false);
    if (result.success) throw new Error("Expected settlement failure");
    expect(result.response.status).toBe(402);
    expect(deps.verifySettlement).toHaveBeenCalledTimes(3);
    expect(deps.sleep).toHaveBeenNthCalledWith(1, 1);
    expect(deps.sleep).toHaveBeenNthCalledWith(2, 2);
    expect(deps.persistRetryable).toHaveBeenCalledWith(settlement(), {
      attempts: 3,
      paymentFingerprint: fingerprintX402Payment(payload),
      reason: "receipt_not_propagated",
    });
    expect(deps.commitVerified).not.toHaveBeenCalled();
  });

  it("replays a durable observation through HTTP verify + settle without upstream reuse", async () => {
    const delegate = new Delegate();
    const deps = dependencies();
    deps.loadRetryable.mockResolvedValue({
      paymentFingerprint: fingerprintX402Payment(payload),
      settlement: settlement(),
    });
    const client = new VerifiedX402Facilitator(delegate, config, deps);
    const server = buildX402TestnetHttpServer(config, {
      facilitator: client,
    });
    await server.initialize();

    const verified = await server.processHTTPRequest({
      adapter: new PaidAdapter(),
      method: "GET",
      path: "/api/x402/testnet",
    });
    expect(verified.type).toBe("payment-verified");
    if (verified.type !== "payment-verified") throw new Error("Expected verified payment");
    const settled = await server.processSettlement(
      verified.paymentPayload,
      verified.paymentRequirements,
      verified.declaredExtensions,
    );

    expect(settled.success).toBe(true);
    expect(deps.verifySettlement).toHaveBeenCalledOnce();
    expect(deps.commitVerified).toHaveBeenCalledWith(settlement(), fingerprintX402Payment(payload));
    expect(delegate.verify).not.toHaveBeenCalled();
    expect(delegate.settle).not.toHaveBeenCalled();
  });

  it("does not turn public on-chain evidence into a replay bearer credential", async () => {
    const delegate = new Delegate();
    const deps = dependencies();
    deps.loadRetryable.mockResolvedValue({
      paymentFingerprint: fingerprintX402Payment(payload),
      settlement: settlement(),
    });
    const client = new VerifiedX402Facilitator(delegate, config, deps);
    const changed = structuredClone(payload);
    changed.payload.signature = `0x${"22".repeat(65)}`;

    await expect(client.verify(changed, requirements)).rejects.toMatchObject({
      code: "X402_SETTLEMENT_REPLAY_CONFLICT",
    });
    expect(delegate.verify).not.toHaveBeenCalled();
  });

  it("fails closed on definitive proof mismatch without an authoritative commit", async () => {
    const delegate = new Delegate();
    const deps = dependencies();
    deps.verifySettlement.mockResolvedValue({ reason: "wrong_token", status: "invalid" });
    const client = new VerifiedX402Facilitator(delegate, config, deps);
    const server = buildX402TestnetHttpServer(config, { facilitator: client });

    const result = await server.processSettlement(payload, requirements);

    expect(result.success).toBe(false);
    if (result.success) throw new Error("Expected definitive proof failure");
    expect(result.response.status).toBe(402);
    expect(deps.commitVerified).not.toHaveBeenCalled();
    expect(deps.persistRetryable).not.toHaveBeenCalled();
  });
});
