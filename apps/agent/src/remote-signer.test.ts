import type { PaymentResponseContext } from "@x402/core/client";
import { privateKeyToAccount } from "viem/accounts";
import { describe, expect, it, vi } from "vitest";

import { LeashRemoteSigner, type RemoteSignerError } from "./remote-signer.js";

const nowSeconds = 1_784_271_300;
const account = privateKeyToAccount(`0x${"11".repeat(32)}`);
const otherAccount = privateKeyToAccount(`0x${"22".repeat(32)}`);
const transaction = `0x${"cd".repeat(32)}`;

function signWith(signer: typeof account, request: ReturnType<typeof validSignerRequest>) {
  return signer.signTypedData(request as unknown as Parameters<typeof signer.signTypedData>[0]);
}

function validSignerRequest() {
  return {
    domain: {
      chainId: 8453,
      name: "USD Coin",
      verifyingContract: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
      version: "2",
    },
    message: {
      from: account.address,
      nonce: `0x${"12".repeat(32)}`,
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
  return {
    paymentPayload: {
      accepted: {
        amount: "25000",
        asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
        extra: { name: "USD Coin", version: "2" },
        maxTimeoutSeconds: 60,
        network: "eip155:8453",
        payTo: "0x1111111111111111111111111111111111111111",
        scheme: "exact",
      },
      payload: { signature },
      x402Version: 2,
    },
    requirements: {
      amount: "25000",
      asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
      extra: { name: "USD Coin", version: "2" },
      maxTimeoutSeconds: 60,
      network: "eip155:8453",
      payTo: "0x1111111111111111111111111111111111111111",
      scheme: "exact",
    },
    settleResponse: {
      network: "eip155:8453",
      payer: account.address,
      success: true,
      transaction,
    },
  };
}

function signerWithFetch(fetch: typeof globalThis.fetch) {
  return new LeashRemoteSigner({
    address: account.address,
    apiBaseUrl: "https://tab.example.test/",
    apiKey: "leash_sk_secret",
    fetch,
    nowSeconds: () => nowSeconds,
    reportRetryDelayMs: 1,
    reportTimeoutMs: 10,
  });
}

describe("Leash remote signer authorization gate", () => {
  it("posts only an exact EIP-3009 native-USDC authority and verifies its signature", async () => {
    const signerRequest = validSignerRequest();
    const signature = await signWith(account, signerRequest);
    const fetch = vi.fn(async (_input: Request | string | URL, init?: RequestInit) => {
      expect(init?.headers).toMatchObject({ authorization: "Bearer leash_sk_secret" });
      expect(JSON.parse(String(init?.body))).toEqual({
        amount: "25000",
        asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
        network: "eip155:8453",
        payTo: "0x1111111111111111111111111111111111111111",
        signerRequest: {
          ...signerRequest,
          message: {
            ...signerRequest.message,
            validAfter: "0",
            validBefore: String(nowSeconds + 60),
            value: "25000",
          },
        },
      });
      return Response.json({ receiptId: "receipt-1", signature });
    });
    const signer = signerWithFetch(fetch);

    await expect(signer.signTypedData(signerRequest)).resolves.toBe(signature);
    expect(signer.receiptIdForSignature(signature)).toBe("receipt-1");
    expect(signer.receiptIdForSignature(signature)).toBe("receipt-1");
  });

  it.each([
    [
      "Permit2",
      (request: ReturnType<typeof validSignerRequest>) =>
        (request.primaryType = "PermitTransferFrom"),
    ],
    [
      "partial EIP-3009 types",
      (request: ReturnType<typeof validSignerRequest>) =>
        request.types.TransferWithAuthorization.pop(),
    ],
    [
      "another token",
      (request: ReturnType<typeof validSignerRequest>) =>
        (request.domain.verifyingContract = "0x3333333333333333333333333333333333333333"),
    ],
    [
      "another payer",
      (request: ReturnType<typeof validSignerRequest>) =>
        (request.message.from = otherAccount.address),
    ],
    [
      "a zero amount",
      (request: ReturnType<typeof validSignerRequest>) => (request.message.value = 0n),
    ],
    [
      "a non-canonical amount",
      (request: ReturnType<typeof validSignerRequest>) =>
        (request.message.value = "025000" as never),
    ],
    [
      "a short nonce",
      (request: ReturnType<typeof validSignerRequest>) => (request.message.nonce = "0x12"),
    ],
    [
      "a nonzero validAfter",
      (request: ReturnType<typeof validSignerRequest>) => (request.message.validAfter = 1n),
    ],
    [
      "an expired validBefore",
      (request: ReturnType<typeof validSignerRequest>) =>
        (request.message.validBefore = BigInt(nowSeconds)),
    ],
    [
      "an overlong validBefore",
      (request: ReturnType<typeof validSignerRequest>) =>
        (request.message.validBefore = BigInt(nowSeconds + 601)),
    ],
  ])("rejects %s before contacting /sign", async (_label, mutate) => {
    const request = validSignerRequest();
    mutate(request);
    const fetch = vi.fn(async () => Response.json({}));
    const signer = signerWithFetch(fetch);

    await expect(signer.signTypedData(request)).rejects.toMatchObject({
      code: "INVALID_SIGNER_REQUEST",
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("rejects a well-shaped signature that does not recover the configured signer", async () => {
    const signerRequest = validSignerRequest();
    const forgedSignature = await signWith(otherAccount, signerRequest);
    const signer = signerWithFetch(async () =>
      Response.json({ receiptId: "receipt-forged", signature: forgedSignature }),
    );

    await expect(signer.signTypedData(signerRequest)).rejects.toMatchObject({
      code: "INVALID_SIGNER_RESPONSE",
      status: 502,
    } satisfies Partial<RemoteSignerError>);
    expect(signer.receiptIdForSignature(forgedSignature)).toBeNull();
  });

  it("preserves a fail-closed backend error code without inventing a signature", async () => {
    const signer = signerWithFetch(async () =>
      Response.json(
        { error: { code: "SIGNER_NOT_CONFIGURED", message: "Signer is not configured." } },
        { status: 409 },
      ),
    );

    await expect(signer.signTypedData(validSignerRequest())).rejects.toMatchObject({
      code: "SIGNER_NOT_CONFIGURED",
      status: 409,
    } satisfies Partial<RemoteSignerError>);
  });
});

describe("Leash payment observation reporting", () => {
  it("treats forged-but-shaped resource metadata as observed and keeps its receipt", async () => {
    const signerRequest = validSignerRequest();
    const signature = await signWith(account, signerRequest);
    const resultBodies: unknown[] = [];
    const signer = signerWithFetch(async (input, init) => {
      if (new URL(input.toString()).pathname === "/api/agent/sign") {
        return Response.json({ receiptId: "receipt-observed", signature });
      }
      resultBodies.push(JSON.parse(String(init?.body)));
      return new Response(null, { status: 204 });
    });
    await signer.signTypedData(signerRequest);

    await expect(
      signer.reportPaymentObservation(paymentContext(signature)),
    ).resolves.toBeUndefined();
    await signer.flushPaymentObservations();

    expect(resultBodies).toEqual([
      {
        outcome: "observed",
        paymentResponse: {
          network: "eip155:8453",
          payer: account.address,
          success: true,
          transaction,
        },
        receiptId: "receipt-observed",
      },
    ]);
    expect(signer.receiptIdForSignature(signature)).toBe("receipt-observed");
  });

  it("does not reject or lose correlation when the result endpoint returns 5xx", async () => {
    const signerRequest = validSignerRequest();
    const signature = await signWith(account, signerRequest);
    let reportAttempts = 0;
    const signer = signerWithFetch(async (input) => {
      if (new URL(input.toString()).pathname === "/api/agent/sign") {
        return Response.json({ receiptId: "receipt-outage", signature });
      }
      reportAttempts += 1;
      return Response.json({ error: { code: "OUTAGE", message: "offline" } }, { status: 503 });
    });
    await signer.signTypedData(signerRequest);

    await expect(
      signer.reportPaymentObservation(paymentContext(signature)),
    ).resolves.toBeUndefined();
    await signer.flushPaymentObservations();

    expect(signer.receiptIdForSignature(signature)).toBe("receipt-outage");
    expect(reportAttempts).toBe(3);
  });

  it("clears correlation only after the Tab server acknowledges on-chain proof", async () => {
    const signerRequest = validSignerRequest();
    const signature = await signWith(account, signerRequest);
    const signer = signerWithFetch(async (input) =>
      new URL(input.toString()).pathname === "/api/agent/sign"
        ? Response.json({ receiptId: "receipt-proven", signature })
        : Response.json({ receiptId: "receipt-proven", status: "settled", verified: true }),
    );
    await signer.signTypedData(signerRequest);

    await signer.reportPaymentObservation(paymentContext(signature));
    await signer.flushPaymentObservations();

    expect(signer.receiptIdForSignature(signature)).toBeNull();
  });

  it("returns immediately when reporting hangs and bounds the background attempt", async () => {
    const signerRequest = validSignerRequest();
    const signature = await signWith(account, signerRequest);
    const signer = signerWithFetch(async (input) => {
      if (new URL(input.toString()).pathname === "/api/agent/sign") {
        return Response.json({ receiptId: "receipt-timeout", signature });
      }
      return new Promise<Response>(() => undefined);
    });
    await signer.signTypedData(signerRequest);

    await expect(
      signer.reportPaymentObservation(paymentContext(signature)),
    ).resolves.toBeUndefined();
    await signer.flushPaymentObservations();

    expect(signer.receiptIdForSignature(signature)).toBe("receipt-timeout");
  });
});
