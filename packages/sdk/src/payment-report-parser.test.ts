import { describe, expect, it } from "vitest";

import { parsePaymentReport } from "./checkout-parsers";
import type { PaymentIntent } from "./checkout-types";

const paymentId = "1d15cc1f-30a7-4f28-9d33-b93f4fd806aa";
const transactionId = `0x${"cd".repeat(32)}`;
const intent: PaymentIntent = {
  amount: "12.00",
  currency: "USD",
  mode: "test",
  receiver: "0x1111111111111111111111111111111111111111",
  token: {
    address: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
    chainId: 84532,
  },
};

function settledResponse() {
  return {
    payment: {
      id: paymentId,
      reportedTransactionId: transactionId,
      status: "settled",
      tokenChanges: [
        {
          amountAtomic: "12000000",
          chainId: 84532,
          receiver: intent.receiver,
          tokenAddress: intent.token.address,
        },
      ],
      verification: { method: "rpc", verifiedAt: "2026-07-16T12:00:00.000Z" },
    },
    testMode: {
      message: "Sandbox settlement — real USDC on Base Sepolia.",
      network: "eip155:84532",
    },
  };
}

describe("payment report parser", () => {
  it("validates but preserves the exact canonical server tokenChanges object", () => {
    const response = settledResponse();

    expect(parsePaymentReport(response, paymentId, transactionId, intent)).toBe(response);
  });

  it.each([
    ["amount", { amountAtomic: "11999999" }],
    ["chain", { chainId: 8453 }],
    ["receiver", { receiver: "0x2222222222222222222222222222222222222222" }],
    ["token", { tokenAddress: "0x3333333333333333333333333333333333333333" }],
  ])("rejects a server settlement with mismatched %s authority", (_label, change) => {
    const response = settledResponse();
    const [tokenChange] = response.payment.tokenChanges;
    if (!tokenChange) throw new Error("Expected canonical token change fixture");
    Object.assign(tokenChange, change);

    expect(() => parsePaymentReport(response, paymentId, transactionId, intent)).toThrowError(
      expect.objectContaining({ code: "INVALID_PAYMENT_REPORT" }),
    );
  });

  it("rejects non-canonical timestamps and unexpected response fields", () => {
    const timestamp = settledResponse();
    timestamp.payment.verification.verifiedAt = "July 16, 2026";
    const extraField = settledResponse() as ReturnType<typeof settledResponse> & {
      candidate?: true;
    };
    extraField.candidate = true;

    for (const response of [timestamp, extraField]) {
      expect(() => parsePaymentReport(response, paymentId, transactionId, intent)).toThrowError(
        expect.objectContaining({ code: "INVALID_PAYMENT_REPORT" }),
      );
    }
  });
});
