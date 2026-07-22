import { randomBytes } from "node:crypto";

import { verifyTypedData } from "viem";
import { vi } from "vitest";

vi.mock("server-only", () => ({}));

import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { createDatabase } from "../db/client";
import { MagicExpressError } from "./magic-express";
import { TabSignerClient } from "./tab-signer";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required for tab-signer tests");

const connection = createDatabase(databaseUrl, 1);
const client = new TabSignerClient(connection.db);

function subject() {
  return `agent_${randomBytes(24).toString("base64url")}`;
}

const typedData = {
  domain: {
    chainId: 84532,
    name: "USD Coin",
    verifyingContract: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
    version: "2",
  },
  message: {
    from: "0x0000000000000000000000000000000000000001",
    to: "0x0000000000000000000000000000000000000002",
    validAfter: BigInt("0"),
    validBefore: BigInt("4102444800"),
    value: BigInt("1000000"),
    nonce: `0x${"11".repeat(32)}`,
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
} as const;

describe("Tab-hosted agent signer", () => {
  beforeEach(async () => {
    await connection.client`truncate table agent_signers`;
  });

  afterAll(async () => {
    await connection.client.end();
  });

  it("provisions once per subject and signs verifiably", async () => {
    const sub = subject();
    const address = await client.getOrCreateWallet(sub);
    expect(address).toMatch(/^0x[0-9a-fA-F]{40}$/);
    // idempotent
    expect(await client.getOrCreateWallet(sub)).toBe(address);

    const { signature } = await client.signTypedData({
      address: address as `0x${string}`,
      subject: sub,
      typedData,
    });
    expect(
      await verifyTypedData({ ...typedData, address: address as `0x${string}`, signature }),
    ).toBe(true);
  });

  it("refuses to sign for a mismatched address or unknown subject", async () => {
    const sub = subject();
    const address = await client.getOrCreateWallet(sub);

    await expect(
      client.signTypedData({
        address: "0x000000000000000000000000000000000000dEaD",
        subject: sub,
        typedData,
      }),
    ).rejects.toMatchObject({ code: "SIGNER_IDENTITY_MISMATCH" });

    await expect(
      client.signTypedData({ address: address as `0x${string}`, subject: subject(), typedData }),
    ).rejects.toThrowError(MagicExpressError);
  });

  it("never returns or stores the plaintext key", async () => {
    const sub = subject();
    await client.getOrCreateWallet(sub);
    const [row] = await connection.client`select * from agent_signers`;
    expect(JSON.stringify(row)).not.toMatch(/0x[0-9a-f]{64}/i);
  });
});
