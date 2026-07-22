import { afterEach, describe, expect, it } from "vitest";

import { verifyTestTransfer } from "./verify-test";
import { fakeTxHash, startReceiptStub } from "./verify-test-support";

const TOKEN = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";
const PAYER = "0x9999999999999999999999999999999999999999";
const RECEIVER = "0x1111111111111111111111111111111111111111";

const originalRpcUrl = process.env.BASE_SEPOLIA_RPC_URL;
let stopStub: (() => Promise<void>) | undefined;

afterEach(async () => {
  if (originalRpcUrl === undefined) delete process.env.BASE_SEPOLIA_RPC_URL;
  else process.env.BASE_SEPOLIA_RPC_URL = originalRpcUrl;
  await stopStub?.();
  stopStub = undefined;
});

async function stubWith(transfer: { from: string; to: string; token: string; value: bigint }) {
  const stub = await startReceiptStub(transfer);
  stopStub = stub.close;
  process.env.BASE_SEPOLIA_RPC_URL = stub.url;
}

describe("Base Sepolia test-settlement verification", () => {
  it("verifies a matching USDC transfer and returns canonical evidence", async () => {
    await stubWith({ from: PAYER, to: RECEIVER, token: TOKEN, value: BigInt("7250000") });
    const hash = fakeTxHash();

    const verdict = await verifyTestTransfer({
      amountAtomic: "7250000",
      payerAddress: PAYER,
      receiver: RECEIVER,
      tokenAddress: TOKEN,
      transactionId: hash,
    });

    expect(verdict).toEqual({
      outcome: "verified",
      tokenChanges: [
        { amountAtomic: "7250000", chainId: 84532, receiver: RECEIVER, tokenAddress: TOKEN },
      ],
      txHash: hash,
    });
  });

  it.each([
    ["amount", { value: BigInt("7249999") }],
    ["receiver", { to: "0x3333333333333333333333333333333333333333" }],
    ["payer", { from: "0x4444444444444444444444444444444444444444" }],
    ["token", { token: "0x5555555555555555555555555555555555555555" }],
  ])("rejects a transfer with mismatched %s", async (_label, override) => {
    await stubWith({
      from: PAYER,
      to: RECEIVER,
      token: TOKEN,
      value: BigInt("7250000"),
      ...override,
    });

    const verdict = await verifyTestTransfer({
      amountAtomic: "7250000",
      payerAddress: PAYER,
      receiver: RECEIVER,
      tokenAddress: TOKEN,
      transactionId: fakeTxHash(),
    });

    expect(verdict.outcome).toBe("invalid");
  });
});
