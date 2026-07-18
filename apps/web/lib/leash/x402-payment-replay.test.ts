import type { PaymentPayload, PaymentRequirements } from "@x402/core/types";
import { privateKeyToAccount } from "viem/accounts";
import { describe, expect, it } from "vitest";

import { verifyX402PaymentSignature } from "./x402-payment-replay";

const account = privateKeyToAccount(`0x${"11".repeat(32)}`);
const attacker = privateKeyToAccount(`0x${"22".repeat(32)}`);
const payee = "0x1000000000000000000000000000000000000001";
const asset = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";
const nonce = `0x${"12".repeat(32)}` as const;
const requirements: PaymentRequirements = {
  amount: "1000",
  asset,
  extra: { name: "USDC", version: "2" },
  maxTimeoutSeconds: 120,
  network: "eip155:84532",
  payTo: payee,
  scheme: "exact",
};
const typedData = {
  domain: { chainId: 84532, name: "USDC", verifyingContract: asset, version: "2" },
  message: {
    from: account.address,
    nonce,
    to: payee,
    validAfter: BigInt(0),
    validBefore: BigInt(2_000_000_000),
    value: BigInt(1_000),
  },
  primaryType: "TransferWithAuthorization" as const,
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
} as const;

async function payload(signer: typeof account): Promise<PaymentPayload> {
  return {
    accepted: requirements,
    payload: {
      authorization: {
        from: account.address,
        nonce,
        to: payee,
        validAfter: "0",
        validBefore: "2000000000",
        value: "1000",
      },
      signature: await signer.signTypedData(typedData),
    },
    x402Version: 2,
  };
}

describe("x402 durable replay signature verification", () => {
  it("recovers the exact EIP-712 signer and rejects a forged replay", async () => {
    await expect(verifyX402PaymentSignature(await payload(account), requirements)).resolves.toBe(
      true,
    );
    await expect(verifyX402PaymentSignature(await payload(attacker), requirements)).resolves.toBe(
      false,
    );
  });
});
