import { encodePaymentRequiredHeader } from "@x402/core/http";
import type { PaymentRequired } from "@x402/core/types";
import { describe, expect, it } from "vitest";

import { detectHttpPaymentRequired, detectMcpPaymentRequired } from "./detect.js";

const paymentRequired = {
  accepts: [
    {
      amount: "25000",
      asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
      extra: { name: "USD Coin", version: "2" },
      maxTimeoutSeconds: 60,
      network: "eip155:8453",
      payTo: "0x1111111111111111111111111111111111111111",
      scheme: "exact",
    },
  ],
  resource: { url: "https://resource.example.test/paid" },
  x402Version: 2,
} satisfies PaymentRequired;

describe("MCP payment-required detection", () => {
  it("detects the structured tool-result surface", () => {
    expect(
      detectMcpPaymentRequired({
        content: [{ text: JSON.stringify(paymentRequired), type: "text" }],
        isError: true,
        structuredContent: paymentRequired,
      }),
    ).toEqual(paymentRequired);
  });

  it("detects SEP-1036 -32042 errors, including namespaced x402 data", () => {
    expect(
      detectMcpPaymentRequired({
        code: -32042,
        data: { paymentMethods: ["x402"], x402: paymentRequired },
        message: "Payment required",
      }),
    ).toEqual(paymentRequired);
  });

  it("does not classify ordinary tool errors as payment challenges", () => {
    expect(
      detectMcpPaymentRequired({
        content: [{ text: "upstream failed", type: "text" }],
        isError: true,
      }),
    ).toBeNull();
  });
});

describe("HTTP payment-required detection", () => {
  it("decodes the v2 PAYMENT-REQUIRED header without consuming the response", async () => {
    const response = new Response("protected", {
      headers: { "PAYMENT-REQUIRED": encodePaymentRequiredHeader(paymentRequired) },
      status: 402,
    });

    await expect(detectHttpPaymentRequired(response)).resolves.toEqual(paymentRequired);
    await expect(response.text()).resolves.toBe("protected");
  });

  it("accepts the legacy v1 402 JSON body", async () => {
    const legacy = {
      accepts: [
        {
          asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
          description: "Legacy resource",
          extra: { name: "USD Coin", version: "2" },
          maxAmountRequired: "25000",
          maxTimeoutSeconds: 60,
          mimeType: "application/json",
          network: "base",
          outputSchema: {},
          payTo: "0x1111111111111111111111111111111111111111",
          resource: "https://resource.example.test/legacy",
          scheme: "exact",
        },
      ],
      x402Version: 1,
    };
    const response = Response.json(legacy, { status: 402 });

    await expect(detectHttpPaymentRequired(response)).resolves.toEqual(legacy);
  });
});
