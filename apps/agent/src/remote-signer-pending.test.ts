import type { PaymentResponseContext } from "@x402/core/client";
import { privateKeyToAccount } from "viem/accounts";
import { describe, expect, it } from "vitest";

import { LeashRemoteSigner } from "./remote-signer.js";

const nowSeconds = 1_784_271_300;
const account = privateKeyToAccount(`0x${"33".repeat(32)}`);
const transaction = `0x${"ef".repeat(32)}`;

function signerRequest() {
  return {
    domain: {
      chainId: 8453,
      name: "USD Coin",
      verifyingContract: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
      version: "2",
    },
    message: {
      from: account.address,
      nonce: `0x${"34".repeat(32)}`,
      to: "0x1111111111111111111111111111111111111111",
      validAfter: 0n,
      validBefore: BigInt(nowSeconds + 60),
      value: 25_000n,
    },
    primaryType: "TransferWithAuthorization",
    types: {
      TransferWithAuthorization: [
        { name: "from", type: "address" },
        { name: "to", type: "address" },
        { name: "value", type: "uint256" },
        { name: "validAfter", type: "uint256" },
        { name: "validBefore", type: "uint256" },
        { name: "nonce", type: "bytes32" },
      ],
    },
  };
}

function paymentContext(signature: `0x${string}`): PaymentResponseContext {
  const requirements = {
    amount: "25000",
    asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    extra: { name: "USD Coin", version: "2" },
    maxTimeoutSeconds: 60,
    network: "eip155:8453" as const,
    payTo: "0x1111111111111111111111111111111111111111",
    scheme: "exact",
  };
  return {
    paymentPayload: { accepted: requirements, payload: { signature }, x402Version: 2 },
    requirements,
    settleResponse: {
      network: "eip155:8453",
      payer: account.address,
      success: true,
      transaction,
    },
  };
}

async function signedReporter(fetch: typeof globalThis.fetch) {
  const request = signerRequest();
  const signature = await account.signTypedData(
    request as unknown as Parameters<typeof account.signTypedData>[0],
  );
  let signRequests = 0;
  const signer = new LeashRemoteSigner({
    address: account.address,
    apiBaseUrl: "https://tab.example.test/",
    apiKey: "leash_sk_secret",
    fetch: async (input, init) => {
      if (new URL(input.toString()).pathname === "/api/agent/sign") {
        signRequests += 1;
        return Response.json({ receiptId: "receipt-pending", signature });
      }
      return fetch(input, init);
    },
    nowSeconds: () => nowSeconds,
    paymentProfile: "mainnet",
    reportAttempts: 3,
    reportRetryDelayMs: 0,
    reportTimeoutMs: 50,
  });
  await signer.signTypedData(request);
  return { signRequests: () => signRequests, signature, signer };
}

describe("Leash pending settlement observation retries", () => {
  it("retries a 202 acknowledgement to its bound and retains correlation while pending", async () => {
    let attempts = 0;
    const { signRequests, signature, signer } = await signedReporter(async () => {
      attempts += 1;
      return Response.json(
        { receiptId: "receipt-pending", status: "pending", verified: false },
        { status: 202 },
      );
    });

    await signer.reportPaymentObservation(paymentContext(signature));
    await signer.flushPaymentObservations();

    expect(attempts).toBe(3);
    expect(signRequests()).toBe(1);
    expect(signer.receiptIdForSignature(signature)).toBe("receipt-pending");
  });

  it("clears correlation when a later bounded retry receives verified proof", async () => {
    let attempts = 0;
    const { signRequests, signature, signer } = await signedReporter(async () => {
      attempts += 1;
      return attempts < 3
        ? Response.json(
            { receiptId: "receipt-pending", status: "pending", verified: false },
            { status: 202 },
          )
        : Response.json({ receiptId: "receipt-pending", status: "settled", verified: true });
    });

    await signer.reportPaymentObservation(paymentContext(signature));
    await signer.flushPaymentObservations();

    expect(attempts).toBe(3);
    expect(signRequests()).toBe(1);
    expect(signer.receiptIdForSignature(signature)).toBeNull();
  });
});
