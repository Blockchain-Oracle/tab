import type { FacilitatorClient } from "@x402/core/server";
import type {
  PaymentPayload,
  PaymentRequirements,
  SettleResponse,
  SupportedResponse,
  VerifyResponse,
} from "@x402/core/types";
import { describe, expect, it, vi } from "vitest";

import { fingerprintX402Payment } from "./x402-payment-fingerprint";
import type { DurableX402Attempt } from "./x402-settlement-attempt-store";
import {
  BASE_SEPOLIA_USDC,
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
const requirements: PaymentRequirements = {
  amount: "1000",
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
      value: "1000",
    },
    signature: `0x${"11".repeat(65)}`,
  },
  x402Version: 2,
};
const result: SettleResponse = {
  amount: "1000",
  network: X402_TESTNET_NETWORK,
  payer,
  success: true,
  transaction,
};
const config: X402TestnetResourceConfig = {
  amount: "1000",
  asset: BASE_SEPOLIA_USDC,
  facilitatorUrl: X402_TESTNET_FACILITATOR,
  network: X402_TESTNET_NETWORK,
  payee,
  resourceUrl: "https://tab.example/api/x402/testnet",
};

function settlement(): X402TestnetSettlement {
  return {
    amount: "1000",
    asset: BASE_SEPOLIA_USDC,
    authorizationValidAfter: "0",
    authorizationValidBefore: "2000000000",
    endpoint: config.resourceUrl,
    facilitatorResponse: result,
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

class Delegate implements FacilitatorClient {
  getSupported = vi.fn(
    async (): Promise<SupportedResponse> => ({
      extensions: [],
      kinds: [{ network: X402_TESTNET_NETWORK, scheme: "exact", x402Version: 2 }],
      signers: {},
    }),
  );
  settle = vi.fn(async (): Promise<SettleResponse> => result);
  verify = vi.fn(async (): Promise<VerifyResponse> => ({ isValid: true, payer }));
}

function dependencies() {
  let storedAttempt: DurableX402Attempt | null = null;
  return {
    beginAttempt: vi.fn(async () => {
      storedAttempt = attempt();
      return { attempt: storedAttempt, created: true };
    }),
    commitVerified: vi.fn(async () => undefined),
    loadAttempt: vi.fn(async () => storedAttempt),
    loadFinal: vi.fn(
      async () => null as { paymentFingerprint: string; settlement: X402TestnetSettlement } | null,
    ),
    loadRetryable: vi.fn(
      async () => null as { paymentFingerprint: string; settlement: X402TestnetSettlement } | null,
    ),
    noteAttemptRetry: vi.fn(async () => undefined),
    persistAttemptResult: vi.fn(async () => {
      storedAttempt = {
        ...attempt(),
        facilitatorResponse: result,
        transactionHash: transaction,
      };
    }),
    persistRetryable: vi.fn(async () => undefined),
    recoverAttempt: vi.fn(async () => ({ settlement: settlement(), status: "verified" as const })),
    signatureVerifier: vi.fn(async () => true),
    verifySettlement: vi.fn(async () => ({ status: "verified" as const })),
  };
}

describe("durable x402 facilitator recovery", () => {
  it("writes the attempt before the first and only upstream settlement", async () => {
    const delegate = new Delegate();
    const deps = dependencies();
    const order: string[] = [];
    deps.beginAttempt.mockImplementationOnce(async () => {
      order.push("write-ahead");
      return { attempt: attempt(), created: true };
    });
    delegate.settle.mockImplementationOnce(async () => {
      order.push("facilitator");
      return result;
    });
    deps.persistAttemptResult.mockImplementationOnce(async () => {
      order.push("durable-result");
    });
    deps.commitVerified.mockImplementationOnce(async () => {
      order.push("commit");
    });

    const client = new VerifiedX402Facilitator(delegate, config, deps);
    await expect(client.settle(payload, requirements)).resolves.toEqual(result);
    expect(order).toEqual(["write-ahead", "facilitator", "durable-result", "commit"]);
    expect(delegate.settle).toHaveBeenCalledOnce();
  });

  it("recovers a crash-ambiguous attempt from chain evidence without reusing the facilitator", async () => {
    const delegate = new Delegate();
    const deps = dependencies();
    deps.loadAttempt.mockResolvedValue(attempt());
    const client = new VerifiedX402Facilitator(delegate, config, deps);

    await expect(client.verify(payload, requirements)).resolves.toMatchObject({ isValid: true });
    await expect(client.settle(payload, requirements)).resolves.toMatchObject({ success: true });

    expect(deps.recoverAttempt).toHaveBeenCalled();
    expect(deps.persistAttemptResult).toHaveBeenCalledWith(
      settlement(),
      fingerprintX402Payment(payload),
    );
    expect(delegate.verify).not.toHaveBeenCalled();
    expect(delegate.settle).not.toHaveBeenCalled();
  });

  it("replays terminal success after a lost paid response without asking for another payment", async () => {
    const delegate = new Delegate();
    const deps = dependencies();
    deps.loadFinal.mockResolvedValue({
      paymentFingerprint: fingerprintX402Payment(payload),
      settlement: settlement(),
    });
    const client = new VerifiedX402Facilitator(delegate, config, deps);

    await expect(client.verify(payload, requirements)).resolves.toMatchObject({ isValid: true });
    await expect(client.settle(payload, requirements)).resolves.toEqual(result);

    expect(deps.commitVerified).toHaveBeenCalledWith(settlement(), fingerprintX402Payment(payload));
    expect(delegate.verify).not.toHaveBeenCalled();
    expect(delegate.settle).not.toHaveBeenCalled();
  });

  it("requires local signature recovery even when a terminal fingerprint matches", async () => {
    const delegate = new Delegate();
    const deps = dependencies();
    deps.signatureVerifier.mockResolvedValue(false);
    deps.loadFinal.mockResolvedValue({
      paymentFingerprint: fingerprintX402Payment(payload),
      settlement: settlement(),
    });
    const client = new VerifiedX402Facilitator(delegate, config, deps);

    await expect(client.verify(payload, requirements)).rejects.toMatchObject({
      code: "X402_SETTLEMENT_REPLAY_CONFLICT",
    });
    expect(delegate.verify).not.toHaveBeenCalled();
  });
});
