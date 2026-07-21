import { describe, expect, it, vi } from "vitest";

import type { RemoteSignerError } from "./remote-signer.js";
import {
  account,
  failedPaymentContext,
  nowSeconds,
  otherAccount,
  paymentContext,
  signerWithFetch,
  signWith,
  transaction,
  validSignerRequest,
} from "./remote-signer.test-support.js";

describe("Agent remote signer authorization gate", () => {
  it("posts only an exact EIP-3009 native-USDC authority and verifies its signature", async () => {
    const signerRequest = validSignerRequest();
    const signature = await signWith(account, signerRequest);
    const fetch = vi.fn(async (_input: Request | string | URL, init?: RequestInit) => {
      expect(init?.headers).toMatchObject({ authorization: "Bearer agent_sk_secret" });
      expect(JSON.parse(String(init?.body))).toEqual({
        amount: "25000",
        asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
        network: "eip155:8453",
        payTo: "0x1111111111111111111111111111111111111111",
        resourceUrl: "https://tool.example.test:8443/search",
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

describe("Agent expired authorization reconciliation", () => {
  it("accepts only an exact verified server acknowledgement", async () => {
    const requests: Array<{ body: unknown; redirect: RequestInit["redirect"] }> = [];
    const signer = signerWithFetch(async (input, init) => {
      expect(new URL(input.toString()).pathname).toBe("/api/agent/pay/reconcile");
      requests.push({ body: JSON.parse(String(init?.body)), redirect: init?.redirect });
      return Response.json({ receiptId: "receipt-expired", status: "failed", verified: true });
    });

    await expect(signer.reconcileExpiredPayment("receipt-expired")).resolves.toBe(true);
    expect(requests).toEqual([{ body: { receiptId: "receipt-expired" }, redirect: "error" }]);
  });

  it("fails closed on pending, malformed, unavailable, or mismatched acknowledgements", async () => {
    for (const response of [
      Response.json(
        { receiptId: "receipt-expired", status: "pending", verified: false },
        { status: 202 },
      ),
      Response.json({ receiptId: "another-receipt", status: "failed", verified: true }),
      Response.json({ receiptId: "receipt-expired", status: "failed", verified: "yes" }),
      Response.json({ error: { code: "OUTAGE" } }, { status: 503 }),
    ]) {
      const signer = signerWithFetch(async () => response.clone());
      await expect(signer.reconcileExpiredPayment("receipt-expired")).resolves.toBe(false);
    }
  });
});

describe("Agent payment observation reporting", () => {
  it("treats forged-but-shaped resource metadata as observed and keeps its receipt", async () => {
    const signerRequest = validSignerRequest();
    const signature = await signWith(account, signerRequest);
    const resultBodies: unknown[] = [];
    const signer = signerWithFetch(async (input, init) => {
      if (new URL(input.toString()).pathname === "/api/agent/sign") {
        return Response.json({ receiptId: "receipt-observed", signature });
      }
      expect(init?.redirect).toBe("error");
      resultBodies.push(JSON.parse(String(init?.body)));
      return new Response(null, { status: 204 });
    });
    await signer.signTypedData(signerRequest);

    await expect(signer.reportPaymentObservation(paymentContext(signature))).resolves.toEqual({
      status: "ignored",
      verified: false,
    });
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

  it("reports a failed settle response when x402 supplies a real transaction hash", async () => {
    const signerRequest = validSignerRequest();
    const signature = await signWith(account, signerRequest);
    const resultBodies: unknown[] = [];
    const signer = signerWithFetch(async (input, init) => {
      if (new URL(input.toString()).pathname === "/api/agent/sign") {
        return Response.json({ receiptId: "receipt-failed", signature });
      }
      const result = JSON.parse(String(init?.body));
      resultBodies.push(result);
      return Response.json({
        receiptId: "receipt-failed",
        status: result.paymentResponse.success ? "settled" : "failed",
        verified: true,
      });
    });
    await signer.signTypedData(signerRequest);

    await signer.reportPaymentObservation(failedPaymentContext(signature));
    await signer.flushPaymentObservations();

    expect(resultBodies).toEqual([
      {
        outcome: "observed",
        paymentResponse: {
          errorMessage: "Transaction reverted after broadcast.",
          errorReason: "invalid_exact_evm_transaction_failed",
          network: "eip155:8453",
          payer: account.address,
          success: false,
          transaction,
        },
        receiptId: "receipt-failed",
      },
    ]);
    expect(signer.receiptIdForSignature(signature)).toBe("receipt-failed");

    await signer.reportPaymentObservation(paymentContext(signature));
    await signer.flushPaymentObservations();
    expect(resultBodies).toHaveLength(2);
    expect(resultBodies[1]).toMatchObject({ paymentResponse: { success: true } });
    expect(signer.receiptIdForSignature(signature)).toBeNull();
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

    await expect(signer.reportPaymentObservation(paymentContext(signature))).resolves.toEqual({
      status: "ignored",
      verified: false,
    });
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

  it("bounds reporting when the result request ignores cancellation", async () => {
    const signerRequest = validSignerRequest();
    const signature = await signWith(account, signerRequest);
    const signer = signerWithFetch(async (input) => {
      if (new URL(input.toString()).pathname === "/api/agent/sign") {
        return Response.json({ receiptId: "receipt-timeout", signature });
      }
      return new Promise<Response>(() => undefined);
    });
    await signer.signTypedData(signerRequest);

    await expect(signer.reportPaymentObservation(paymentContext(signature))).resolves.toEqual({
      status: "ignored",
      verified: false,
    });
    await signer.flushPaymentObservations();

    expect(signer.receiptIdForSignature(signature)).toBe("receipt-timeout");
  });
});
