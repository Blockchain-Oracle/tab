import { afterEach, describe, expect, it, vi } from "vitest";

import { executePayment, PaymentExecutionBlockedError } from "./execute";

describe("payment execution boundary", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("fails before creating, authorizing, or sending a transaction while the spike is incomplete", async () => {
    vi.stubEnv("NEXT_PUBLIC_SPIKE_COMPLETE", "false");
    const createTransferTransaction = vi.fn();
    const signAuthorization = vi.fn();
    const signRootHash = vi.fn();
    const sendTransaction = vi.fn();

    await expect(
      executePayment({
        amount: "12.00",
        ownerAddress: "0x1111111111111111111111111111111111111111",
        receiver: "0x2222222222222222222222222222222222222222",
        signer: { signAuthorization, signRootHash },
        token: {
          address: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
          chainId: 42161,
        },
        universalAccount: { createTransferTransaction, sendTransaction },
      }),
    ).rejects.toBeInstanceOf(PaymentExecutionBlockedError);

    expect(createTransferTransaction).not.toHaveBeenCalled();
    expect(signAuthorization).not.toHaveBeenCalled();
    expect(signRootHash).not.toHaveBeenCalled();
    expect(sendTransaction).not.toHaveBeenCalled();
  });

  it("uses the three-argument Particle path and returns only a real resolved result", async () => {
    vi.stubEnv("NEXT_PUBLIC_SPIKE_COMPLETE", "true");
    const rootHash = `0x${"ab".repeat(32)}`;
    const userOpHash = `0x${"cd".repeat(32)}`;
    const authorizationSignature = `0x${"11".repeat(65)}`;
    const rootSignature = `0x${"22".repeat(65)}`;
    const transaction = {
      receiver: "0x2222222222222222222222222222222222222222",
      rootHash,
      sender: "0x1111111111111111111111111111111111111111",
      smartAccountOptions: {
        ownerAddress: "0x1111111111111111111111111111111111111111",
        senderAddress: "0x1111111111111111111111111111111111111111",
      },
      tag: "transfer_v2",
      userOps: [
        {
          chainId: 42161,
          eip7702Auth: {
            address: "0x3333333333333333333333333333333333333333",
            chainId: 42161,
            nonce: 7,
          },
          eip7702Delegated: false,
          userOp: { sender: "0x1111111111111111111111111111111111111111" },
          userOpHash,
        },
      ],
    };
    const tokenChanges = { totalPaidAmountInUSD: "12.00" };
    const createTransferTransaction = vi.fn().mockResolvedValue(transaction);
    const signAuthorization = vi.fn().mockResolvedValue(authorizationSignature);
    const signRootHash = vi.fn().mockResolvedValue(rootSignature);
    const sendTransaction = vi.fn().mockResolvedValue({
      tokenChanges,
      transactionId: "real-particle-transaction-id",
    });

    await expect(
      executePayment({
        amount: "12.00",
        ownerAddress: "0x1111111111111111111111111111111111111111",
        receiver: "0x2222222222222222222222222222222222222222",
        signer: { signAuthorization, signRootHash },
        token: {
          address: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
          chainId: 42161,
        },
        universalAccount: { createTransferTransaction, sendTransaction },
      }),
    ).resolves.toEqual({ tokenChanges, transactionId: "real-particle-transaction-id" });

    expect(createTransferTransaction).toHaveBeenCalledWith({
      amount: "12.00",
      receiver: "0x2222222222222222222222222222222222222222",
      token: {
        address: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
        chainId: 42161,
      },
    });
    expect(signAuthorization).toHaveBeenCalledWith({
      address: "0x3333333333333333333333333333333333333333",
      chainId: 42161,
      nonce: 7,
      userOpHash,
    });
    expect(signRootHash).toHaveBeenCalledWith(
      rootHash,
      "0x1111111111111111111111111111111111111111",
    );
    expect(sendTransaction).toHaveBeenCalledWith(transaction, rootSignature, [
      { signature: authorizationSignature, userOpHash },
    ]);
  });
});
