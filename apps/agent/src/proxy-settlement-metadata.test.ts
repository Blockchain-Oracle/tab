import { describe, expect, it } from "vitest";

import { readMcpSettlementMetadata } from "./proxy.js";

const transaction = `0x${"43".repeat(32)}`;

describe("MCP seller settlement metadata boundary", () => {
  it("accepts only the exact x402 settlement response shape", () => {
    const exact = {
      network: "eip155:8453",
      payer: "0x1111111111111111111111111111111111111111",
      success: true,
      transaction,
    };
    expect(readMcpSettlementMetadata({ _meta: { "x402/payment-response": exact } })).toEqual(exact);
    expect(
      readMcpSettlementMetadata(
        { _meta: { "x402/payment-response": { ...exact, amount: "25000" } } },
        { amount: "25000", network: "eip155:8453" },
      ),
    ).toEqual(exact);
    expect(
      readMcpSettlementMetadata(
        { _meta: { "x402/payment-response": { ...exact, amount: "25001" } } },
        { amount: "25000", network: "eip155:8453" },
      ),
    ).toBeNull();
    expect(
      readMcpSettlementMetadata({
        _meta: {
          "x402/payment-response": {
            network: "eip155:8453",
            success: true,
            transaction,
          },
        },
      }),
    ).toBeNull();
    expect(
      readMcpSettlementMetadata({
        _meta: { "x402/payment-response": { ...exact, trusted: true } },
      }),
    ).toBeNull();
  });
});
