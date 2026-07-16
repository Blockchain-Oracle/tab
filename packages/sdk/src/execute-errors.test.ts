import { afterEach, describe, expect, it, vi } from "vitest";

import { executePayment, type InvalidPaymentExecutionError } from "./execute";

describe("payment execution failures", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("treats an empty resolved evidence object as an unknown post-broadcast result", async () => {
    vi.stubEnv("NEXT_PUBLIC_SPIKE_COMPLETE", "true");
    const sendTransaction = vi.fn().mockResolvedValue({
      tokenChanges: {},
      transactionId: "particle-transaction-id",
    });

    await expect(
      executePayment({
        amount: "12.00",
        ownerAddress: "0x1111111111111111111111111111111111111111",
        receiver: "0x2222222222222222222222222222222222222222",
        signer: {
          signAuthorization: vi.fn(),
          signRootHash: vi.fn().mockResolvedValue(`0x${"22".repeat(65)}`),
        },
        token: {
          address: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
          chainId: 42161,
        },
        universalAccount: {
          createTransferTransaction: vi.fn().mockResolvedValue({
            receiver: "0x2222222222222222222222222222222222222222",
            rootHash: `0x${"ab".repeat(32)}`,
            sender: "0x1111111111111111111111111111111111111111",
            smartAccountOptions: {
              ownerAddress: "0x1111111111111111111111111111111111111111",
              senderAddress: "0x1111111111111111111111111111111111111111",
            },
            tag: "transfer_v2",
            userOps: [],
          }),
          sendTransaction,
        },
      }),
    ).rejects.toMatchObject({ broadcastStarted: true });
  });

  it("preserves Particle error details and retry safety before broadcasting", async () => {
    vi.stubEnv("NEXT_PUBLIC_SPIKE_COMPLETE", "true");
    const providerFailure = Object.assign(new Error("quote unavailable"), {
      code: -32_001,
      data: { reason: "quote_unavailable" },
    });
    const sendTransaction = vi.fn();

    await expect(
      executePayment({
        amount: "12.00",
        ownerAddress: "0x1111111111111111111111111111111111111111",
        receiver: "0x2222222222222222222222222222222222222222",
        signer: { signAuthorization: vi.fn(), signRootHash: vi.fn() },
        token: {
          address: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
          chainId: 42161,
        },
        universalAccount: {
          createTransferTransaction: vi.fn().mockRejectedValue(providerFailure),
          sendTransaction,
        },
      }),
    ).rejects.toMatchObject({
      broadcastStarted: false,
      phase: "prepare",
      providerCode: -32_001,
      providerData: { reason: "quote_unavailable" },
    } satisfies Partial<InvalidPaymentExecutionError>);
    expect(sendTransaction).not.toHaveBeenCalled();
  });

  it("rejects a Particle transfer whose returned authority differs from the intent", async () => {
    vi.stubEnv("NEXT_PUBLIC_SPIKE_COMPLETE", "true");
    const ownerAddress = "0x1111111111111111111111111111111111111111";
    const receiver = "0x2222222222222222222222222222222222222222";
    const signRootHash = vi.fn().mockResolvedValue(`0x${"22".repeat(65)}`);
    const sendTransaction = vi.fn();

    await expect(
      executePayment({
        amount: "12.00",
        ownerAddress,
        receiver,
        signer: { signAuthorization: vi.fn(), signRootHash },
        token: {
          address: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
          chainId: 42161,
        },
        universalAccount: {
          createTransferTransaction: vi.fn().mockResolvedValue({
            receiver: "0x3333333333333333333333333333333333333333",
            rootHash: `0x${"ab".repeat(32)}`,
            sender: ownerAddress,
            smartAccountOptions: { ownerAddress, senderAddress: ownerAddress },
            tag: "transfer_v2",
            userOps: [],
          }),
          sendTransaction,
        },
      }),
    ).rejects.toMatchObject({ broadcastStarted: false, phase: "prepare" });
    expect(signRootHash).not.toHaveBeenCalled();
    expect(sendTransaction).not.toHaveBeenCalled();
  });
});
