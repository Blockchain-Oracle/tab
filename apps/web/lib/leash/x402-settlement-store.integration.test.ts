import { randomBytes, randomUUID } from "node:crypto";

import { eq, sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { createDatabase } from "../db/client";
import { x402ResourceSettlements } from "../db/schema";
import {
  findFinalX402ResourceSettlement,
  InvalidX402SettlementEvidenceError,
  recordX402ResourceSettlement,
  X402SettlementConflictError,
} from "./x402-settlement-store";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required for x402 settlement tests");

const connection = createDatabase(databaseUrl, 4);
const asset = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";
const payer = "0x1111111111111111111111111111111111111111";
const payee = "0x2222222222222222222222222222222222222222";

function evidence(overrides: Record<string, unknown> = {}) {
  const txHash = `0x${randomBytes(32).toString("hex")}`;
  const network = "eip155:84532" as const;
  return {
    amountAtomic: "1000",
    asset,
    authorizationValidAfter: new Date("1970-01-01T00:00:00.000Z"),
    authorizationValidBefore: new Date("2030-01-01T00:05:00.000Z"),
    endpoint: "https://tab.example.test/api/x402/testnet",
    facilitatorResponse: { network, payer, success: true, transaction: txHash },
    network,
    nonce: `0x${randomBytes(32).toString("hex")}`,
    payee,
    payer,
    paymentFingerprint: "1".repeat(64),
    paymentIdentifier: `payment_${randomUUID()}`,
    settledAt: new Date("2029-12-31T23:59:00.000Z"),
    txHash,
    ...overrides,
  };
}

describe("seller x402 settlement audit ledger", () => {
  beforeEach(async () => {
    await connection.db.delete(x402ResourceSettlements);
  });

  afterAll(async () => {
    await connection.client.end();
  });

  it("persists complete canonical Base Sepolia settlement evidence", async () => {
    const input = evidence();
    const recorded = await recordX402ResourceSettlement(connection.db, input);

    expect(recorded.created).toBe(true);
    expect(recorded.settlement).toMatchObject({
      amountAtomic: "1000",
      asset,
      endpoint: "https://tab.example.test/api/x402/testnet",
      facilitatorUrl: "https://x402.org/facilitator",
      network: "eip155:84532",
      payee,
      payer,
      paymentIdentifier: input.paymentIdentifier,
      testFunds: true,
      txHash: input.txHash,
    });
    expect(recorded.settlement.explorerUrl).toBe(`https://sepolia.basescan.org/tx/${input.txHash}`);
    expect(recorded.settlement.facilitatorResponse).toEqual(input.facilitatorResponse);
  });

  it("records a replay once, including under concurrent delivery", async () => {
    const input = evidence();
    const [first, second] = await Promise.all([
      recordX402ResourceSettlement(connection.db, input),
      recordX402ResourceSettlement(connection.db, input),
    ]);

    expect([first.created, second.created].sort()).toEqual([false, true]);
    expect(first.settlement.id).toBe(second.settlement.id);
    await expect(connection.db.select().from(x402ResourceSettlements)).resolves.toHaveLength(1);
  });

  it("reloads exact terminal-success evidence only when it has a replay fingerprint", async () => {
    const paymentFingerprint = "1".repeat(64);
    const input = evidence({ paymentFingerprint });
    await recordX402ResourceSettlement(connection.db, input);

    await expect(
      findFinalX402ResourceSettlement(connection.db, {
        network: input.network,
        nonce: input.nonce,
        payer: input.payer,
      }),
    ).resolves.toMatchObject({
      paymentFingerprint,
      settlement: { transactionHash: input.txHash },
    });
  });

  it("rejects terminal evidence without a replay fingerprint", async () => {
    await expect(
      recordX402ResourceSettlement(connection.db, evidence({ paymentFingerprint: null })),
    ).rejects.toBeInstanceOf(InvalidX402SettlementEvidenceError);
  });

  it("treats a later observation of the same settled transaction as an idempotent replay", async () => {
    const input = evidence();
    const first = await recordX402ResourceSettlement(connection.db, input);
    const replay = await recordX402ResourceSettlement(connection.db, {
      ...input,
      settledAt: new Date("2030-01-02T00:00:00.000Z"),
    });

    expect(replay).toMatchObject({ created: false, settlement: { id: first.settlement.id } });
    expect(replay.settlement.settledAt).toEqual(input.settledAt);
  });

  it("rejects conflicting evidence for either the transaction or payment identity", async () => {
    const input = evidence();
    await recordX402ResourceSettlement(connection.db, input);

    await expect(
      recordX402ResourceSettlement(connection.db, {
        ...input,
        payee: "0x3333333333333333333333333333333333333333",
      }),
    ).rejects.toBeInstanceOf(X402SettlementConflictError);

    const otherTx = `0x${randomBytes(32).toString("hex")}`;
    await expect(
      recordX402ResourceSettlement(connection.db, {
        ...input,
        facilitatorResponse: {
          ...input.facilitatorResponse,
          transaction: otherTx,
        },
        txHash: otherTx,
      }),
    ).rejects.toBeInstanceOf(X402SettlementConflictError);
  });

  it("rejects a non-canonical amount before reaching PostgreSQL", async () => {
    await expect(
      recordX402ResourceSettlement(connection.db, evidence({ amountAtomic: "2000" })),
    ).rejects.toBeInstanceOf(InvalidX402SettlementEvidenceError);
  });

  it("bounds facilitator evidence by UTF-8 bytes before reaching PostgreSQL", async () => {
    const input = evidence();
    await expect(
      recordX402ResourceSettlement(connection.db, {
        ...input,
        facilitatorResponse: {
          ...input.facilitatorResponse,
          extension: "😀".repeat(9_000),
        },
      }),
    ).rejects.toBeInstanceOf(InvalidX402SettlementEvidenceError);
  });

  it("fails closed at the database boundary for non-testnet or fabricated evidence", async () => {
    const input = evidence({ paymentIdentifier: null });
    const insert = (values: Partial<typeof x402ResourceSettlements.$inferInsert>) =>
      connection.db.insert(x402ResourceSettlements).values({
        amountAtomic: input.amountAtomic,
        asset: input.asset,
        authorizationValidAfter: input.authorizationValidAfter,
        authorizationValidBefore: input.authorizationValidBefore,
        endpoint: input.endpoint,
        explorerUrl: `https://sepolia.basescan.org/tx/${input.txHash}`,
        facilitatorResponse: input.facilitatorResponse,
        facilitatorUrl: "https://x402.org/facilitator",
        network: input.network,
        nonce: input.nonce,
        payee: input.payee,
        payer: input.payer,
        paymentFingerprint: input.paymentFingerprint,
        settledAt: input.settledAt,
        testFunds: true,
        txHash: input.txHash,
        ...values,
      });

    for (const invalid of [
      { asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" },
      { facilitatorUrl: "https://example.test/facilitator" },
      { network: "eip155:8453" as const },
      { testFunds: false },
      { explorerUrl: "https://example.test/fabricated" },
      { endpoint: "https://tab.example.test/api/not-canonical" },
      { facilitatorResponse: { ...input.facilitatorResponse, success: false } },
    ]) {
      await expect(insert(invalid)).rejects.toMatchObject({ cause: { code: "23514" } });
    }

    await insert({});
    await expect(
      connection.client`
        update x402_resource_settlements
        set payment_fingerprint = null
        where tx_hash = ${input.txHash}
      `,
    ).rejects.toMatchObject({ code: "23502" });
    const [stored] = await connection.db
      .select({ id: x402ResourceSettlements.id })
      .from(x402ResourceSettlements)
      .where(eq(x402ResourceSettlements.txHash, input.txHash));
    expect(stored?.id).toBeDefined();
    const [count] = await connection.db
      .select({ value: sql<number>`count(*)::int` })
      .from(x402ResourceSettlements);
    expect(count?.value).toBe(1);
  });
});
