import { randomBytes, randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { createDatabase } from "../db/client";
import {
  notifications,
  receipts,
  x402ResourceSettlementObservations,
  x402ResourceSettlements,
} from "../db/schema";
import { readOwnerReceipt } from "./receipt-store";
import { commitVerifiedX402ResourceSettlement } from "./x402-settlement-convergence";
import {
  findRetryableX402ResourceSettlement,
  saveRetryableX402ResourceSettlement,
} from "./x402-settlement-outbox";
import { X402SettlementConflictError } from "./x402-settlement-store";
import {
  BASE_SEPOLIA_USDC,
  X402_TESTNET_AMOUNT,
  X402_TESTNET_FACILITATOR,
  X402_TESTNET_NETWORK,
  type X402TestnetSettlement,
} from "./x402-testnet-resource";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required for convergence tests");

const connection = createDatabase(databaseUrl, 4);
const payer = "0x2000000000000000000000000000000000000002";
const payee = "0x1000000000000000000000000000000000000001";
const paymentFingerprint = "ab".repeat(32);

function evidence(overrides: Partial<X402TestnetSettlement> = {}): X402TestnetSettlement {
  const transactionHash = `0x${randomBytes(32).toString("hex")}` as const;
  return {
    amount: X402_TESTNET_AMOUNT,
    asset: BASE_SEPOLIA_USDC,
    authorizationValidAfter: "0",
    authorizationValidBefore: "2000000000",
    endpoint: "https://tab.example/api/x402/testnet",
    facilitatorResponse: {
      amount: X402_TESTNET_AMOUNT,
      network: X402_TESTNET_NETWORK,
      payer,
      success: true,
      transaction: transactionHash,
    },
    facilitatorUrl: X402_TESTNET_FACILITATOR,
    network: X402_TESTNET_NETWORK,
    nonce: `0x${randomBytes(32).toString("hex")}`,
    payee,
    payer,
    testFunds: true,
    transactionHash,
    ...overrides,
  };
}

async function pendingControlReceipt(settlement: X402TestnetSettlement) {
  const [owner] = await connection.client<{ id: string }[]>`
    insert into users (email, magic_issuer)
    values (${`${randomUUID()}@example.test`}, ${`did:ethr:${randomUUID()}`}) returning id
  `;
  if (!owner) throw new Error("Expected owner");
  const [agent] = await connection.client<{ id: string }[]>`
    insert into agents (owner_id, name, payment_profile, signer_subject, agent_address)
    values (
      ${owner.id}, 'Seller convergence', 'base_sepolia_integration',
      ${`leash:${randomUUID()}`}, ${settlement.payer}
    ) returning id
  `;
  if (!agent) throw new Error("Expected agent");
  const [cycle] = await connection.client<{ id: string }[]>`
    insert into cap_cycles (agent_id, started_at)
    values (${agent.id}, now() - interval '1 minute') returning id
  `;
  if (!cycle) throw new Error("Expected cycle");
  await connection.client`
    insert into caps (agent_id, amount_usd_cents, frequency) values (${agent.id}, 1, 'daily')
  `;
  const priorHash = `0x${randomBytes(32).toString("hex")}`;
  await connection.client`
    insert into receipts (
      agent_id, cycle_id, status, amount_atomic, amount_usd, asset, network, pay_to,
      authorization_nonce, request_fingerprint, authorization_valid_before,
      settlement_response, tx_hash, settled_at
    ) values (
      ${agent.id}, ${cycle.id}, 'settled', 6500, 0.0065, ${BASE_SEPOLIA_USDC},
      ${X402_TESTNET_NETWORK}, ${settlement.payee}, ${`0x${randomBytes(32).toString("hex")}`},
      ${randomBytes(32).toString("hex")}, now() + interval '5 minutes',
      ${JSON.stringify({ success: true, transaction: priorHash })}::jsonb, ${priorHash}, now()
    )
  `;
  const [receipt] = await connection.client<{ id: string }[]>`
    insert into receipts (
      agent_id, cycle_id, amount_atomic, amount_usd, asset, network, pay_to,
      authorization_nonce, request_fingerprint, authorization_valid_before
    ) values (
      ${agent.id}, ${cycle.id}, ${settlement.amount}, ${settlement.amount}::numeric / 1000000,
      ${settlement.asset}, ${settlement.network}, ${settlement.payee}, ${settlement.nonce},
      ${randomBytes(32).toString("hex")},
      to_timestamp(${settlement.authorizationValidBefore}::numeric)
    ) returning id
  `;
  if (!receipt) throw new Error("Expected receipt");
  return { agentId: agent.id, cycleId: cycle.id, ownerId: owner.id, receiptId: receipt.id };
}

beforeEach(async () => {
  await connection.client`truncate table users cascade`;
  await connection.db.delete(x402ResourceSettlementObservations);
  await connection.db.delete(x402ResourceSettlements);
});

afterAll(async () => {
  await connection.client.end();
});

describe("durable seller settlement convergence", () => {
  it("stores retryable evidence outside the authoritative ledger and reloads it after restart", async () => {
    const settlement = evidence();

    await saveRetryableX402ResourceSettlement(connection.db, settlement, {
      attempts: 3,
      paymentFingerprint,
      reason: "receipt_not_propagated",
    });

    expect(await connection.db.select().from(x402ResourceSettlements)).toEqual([]);
    expect(await connection.db.select().from(x402ResourceSettlementObservations)).toHaveLength(1);
    await expect(
      findRetryableX402ResourceSettlement(connection.db, {
        network: settlement.network,
        nonce: settlement.nonce,
        payer: settlement.payer,
      }),
    ).resolves.toEqual({ paymentFingerprint, settlement });
  });

  it("promotes a reverified observation and converges receipt, cap alert, and dashboard feed", async () => {
    const settlement = evidence();
    const control = await pendingControlReceipt(settlement);
    await saveRetryableX402ResourceSettlement(connection.db, settlement, {
      attempts: 3,
      paymentFingerprint,
      reason: "receipt_not_propagated",
    });

    const committed = await commitVerifiedX402ResourceSettlement(
      connection.db,
      settlement,
      paymentFingerprint,
    );

    expect(committed.settlement.receiptId).toBe(control.receiptId);
    expect(await connection.db.select().from(x402ResourceSettlementObservations)).toEqual([]);
    const [receipt] = await connection.db
      .select()
      .from(receipts)
      .where(eq(receipts.id, control.receiptId));
    expect(receipt).toMatchObject({
      status: "settled",
      txHash: settlement.transactionHash,
    });
    await expect(
      readOwnerReceipt(connection.db, { ownerId: control.ownerId, receiptId: control.receiptId }),
    ).resolves.toMatchObject({ status: "settled", txHash: settlement.transactionHash });
    expect(await connection.db.select().from(notifications)).toEqual([
      expect.objectContaining({
        agentId: control.agentId,
        cycleId: control.cycleId,
        type: "cap_75",
      }),
    ]);
  });

  it("records a verified seller-only settlement when no exact receipt matches", async () => {
    const settlement = evidence();
    const committed = await commitVerifiedX402ResourceSettlement(
      connection.db,
      settlement,
      "2".repeat(64),
    );

    expect(committed.settlement.receiptId).toBeNull();
    expect(await connection.db.select().from(receipts)).toEqual([]);
  });

  it("rejects a second transaction for the same payer authorization nonce", async () => {
    const first = evidence();
    await commitVerifiedX402ResourceSettlement(connection.db, first, "3".repeat(64));
    const conflicting = evidence({ nonce: first.nonce });

    await expect(
      commitVerifiedX402ResourceSettlement(connection.db, conflicting, "3".repeat(64)),
    ).rejects.toBeInstanceOf(X402SettlementConflictError);
    expect(await connection.db.select().from(x402ResourceSettlements)).toHaveLength(1);
  });
});
