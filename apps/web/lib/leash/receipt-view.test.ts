import { randomUUID } from "node:crypto";

import { describe, expect, it } from "vitest";

import { receiptView } from "./receipt-view";

const hash = `0x${"a".repeat(64)}`;

function receipt(
  overrides: Partial<Parameters<typeof receiptView>[0]> = {},
): Parameters<typeof receiptView>[0] {
  return {
    amountAtomic: "420000",
    amountUsd: "0.420000",
    asset: "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913",
    capAtomicAtAttempt: "1000000",
    committedAtomicBefore: "500000",
    createdAt: new Date("2026-07-17T10:00:00.123Z"),
    id: randomUUID(),
    intendedNetwork: null,
    network: "eip155:8453",
    origin: { clientName: "Claude Code", toolName: "search", transport: "mcp" },
    payTo: "0x1111111111111111111111111111111111111111",
    reason: null,
    resourceHost: "api.example.test",
    resourceUrl: "https://api.example.test/search",
    settledAt: new Date("2026-07-17T10:00:01.000Z"),
    status: "settled",
    txHash: hash,
    ...overrides,
  };
}

describe("receipt API view", () => {
  it("renders exact per-receipt evidence and the correct Base explorer", () => {
    expect(receiptView(receipt())).toMatchObject({
      amountAtomic: "420000",
      amountDisplay: "$0.42",
      amountUsd: "0.420000",
      asset: "USDC",
      capContext: {
        capAtomic: "1000000",
        committedBeforeAtomic: "500000",
        projectedAfterAtomic: "920000",
      },
      createdAt: "2026-07-17T10:00:00.123Z",
      explorer: {
        href: `https://basescan.org/tx/${hash}`,
        label: "View on Basescan",
      },
      network: { id: "eip155:8453", label: "Base", target: false },
      origin: { clientName: "Claude Code", toolName: "search", transport: "mcp" },
      resourceUrl: "https://api.example.test/search",
      settledAt: "2026-07-17T10:00:01.000Z",
      status: "settled",
      txHash: hash,
    });
  });

  it("labels a blocked target network and never fabricates a hash or explorer", () => {
    expect(
      receiptView(
        receipt({
          intendedNetwork: "eip155:42161",
          network: "eip155:42161",
          reason: "LEASH_CAP_EXCEEDED",
          settledAt: null,
          status: "blocked",
          txHash: null,
        }),
      ),
    ).toMatchObject({
      explorer: null,
      network: { id: "eip155:42161", label: "Arbitrum", target: true },
      reason: "LEASH_CAP_EXCEEDED",
      settledAt: null,
      status: "blocked",
      txHash: null,
    });
  });

  it("links a real failed transaction hash without calling the receipt settled", () => {
    expect(
      receiptView(
        receipt({
          reason: "invalid_exact_evm_transaction_failed",
          settledAt: null,
          status: "failed",
          txHash: hash,
        }),
      ),
    ).toMatchObject({
      explorer: { href: `https://basescan.org/tx/${hash}`, label: "View on Basescan" },
      reason: "invalid_exact_evm_transaction_failed",
      settledAt: null,
      status: "failed",
      txHash: hash,
    });
  });

  it("uses an honest unavailable resource label for legacy rows", () => {
    expect(
      receiptView(
        receipt({
          capAtomicAtAttempt: null,
          committedAtomicBefore: null,
          origin: null,
          resourceHost: null,
          resourceUrl: null,
        }),
      ),
    ).toMatchObject({
      capContext: null,
      origin: null,
      resourceUrl: null,
    });
  });
});
