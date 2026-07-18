import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { createDatabase } from "../db/client";
import { x402ResourceSettlementAttempts, x402ResourceSettlements } from "../db/schema";
import {
  beginX402SettlementAttempt,
  findX402SettlementAttempt,
  saveX402SettlementAttemptResult,
} from "./x402-settlement-attempt-store";
import { commitVerifiedX402ResourceSettlement } from "./x402-settlement-convergence";
import type { X402TestnetSettlement, X402TestnetSettlementAttempt } from "./x402-testnet-resource";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required for settlement attempt tests");
const connection = createDatabase(databaseUrl, 2);
const fingerprint = "1".repeat(64);
const payer = "0x2000000000000000000000000000000000000002";
const payee = "0x1000000000000000000000000000000000000001";
const nonce = `0x${"12".repeat(32)}` as const;
const transactionHash = `0x${"ab".repeat(32)}` as const;

function attempt(): X402TestnetSettlementAttempt {
  return {
    amount: "1000",
    asset: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
    authorizationValidAfter: "0",
    authorizationValidBefore: "2000000000",
    endpoint: "https://tab.example/api/x402/testnet",
    facilitatorUrl: "https://x402.org/facilitator",
    network: "eip155:84532",
    nonce,
    payee,
    payer,
    testFunds: true,
  };
}

function settlement(): X402TestnetSettlement {
  return {
    ...attempt(),
    facilitatorResponse: {
      amount: "1000",
      network: "eip155:84532",
      payer,
      success: true,
      transaction: transactionHash,
    },
    transactionHash,
  };
}

describe("x402 settlement write-ahead attempts", () => {
  beforeEach(async () => {
    await connection.db.delete(x402ResourceSettlementAttempts);
    await connection.db.delete(x402ResourceSettlements);
  });
  afterAll(() => connection.client.end());

  it("persists only public identity and a payment fingerprint before settlement", async () => {
    const first = await beginX402SettlementAttempt(
      connection.db,
      attempt(),
      fingerprint,
      BigInt(123),
    );
    expect(first).toMatchObject({ created: true, attempt: { transactionHash: null } });
    const [row] = await connection.db.select().from(x402ResourceSettlementAttempts);
    expect(row).toMatchObject({
      facilitatorResponse: null,
      paymentFingerprint: fingerprint,
      startBlock: "123",
      txHash: null,
    });
    expect(JSON.stringify(row)).not.toContain("signature");

    await expect(
      beginX402SettlementAttempt(connection.db, attempt(), fingerprint, BigInt(124)),
    ).resolves.toMatchObject({ created: false });
    await expect(
      beginX402SettlementAttempt(connection.db, attempt(), "2".repeat(64), BigInt(124)),
    ).rejects.toThrow("conflicts with durable evidence");
  });

  it("attaches the genuine settle result without replacing the write-ahead identity", async () => {
    await beginX402SettlementAttempt(connection.db, attempt(), fingerprint, BigInt(123));
    await saveX402SettlementAttemptResult(connection.db, settlement(), fingerprint);

    await expect(
      findX402SettlementAttempt(connection.db, { network: "eip155:84532", nonce, payer }),
    ).resolves.toMatchObject({
      facilitatorResponse: settlement().facilitatorResponse,
      paymentFingerprint: fingerprint,
      startBlock: "123",
      transactionHash,
    });
  });

  it("rejects incomplete non-null facilitator evidence at the database boundary", async () => {
    await beginX402SettlementAttempt(connection.db, attempt(), fingerprint, BigInt(123));

    await expect(
      connection.client`
        update x402_resource_settlement_attempts
        set tx_hash = ${transactionHash},
            facilitator_response = ${JSON.stringify({ success: true })}::jsonb
        where payment_fingerprint = ${fingerprint}
      `,
    ).rejects.toMatchObject({ code: "23514" });

    await expect(
      findX402SettlementAttempt(connection.db, { network: "eip155:84532", nonce, payer }),
    ).resolves.toMatchObject({ facilitatorResponse: null, transactionHash: null });
  });

  it("serializes write-ahead creation against a concurrent terminal commit", async () => {
    await Promise.all([
      beginX402SettlementAttempt(connection.db, attempt(), fingerprint, BigInt(123)),
      commitVerifiedX402ResourceSettlement(connection.db, settlement(), fingerprint),
    ]);

    await expect(connection.db.select().from(x402ResourceSettlements)).resolves.toHaveLength(1);
    await expect(connection.db.select().from(x402ResourceSettlementAttempts)).resolves.toEqual([]);
  });
});
