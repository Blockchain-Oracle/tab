import { randomBytes, randomUUID } from "node:crypto";
import { createServer } from "node:http";

import { eq } from "drizzle-orm";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { issueLeashKey } from "../../../../../lib/auth/leash-key";
import { createDatabase } from "../../../../../lib/db/client";
import { agents, capCycles, receipts, users } from "../../../../../lib/db/schema";
import { closeServerDatabase } from "../../../../../lib/db/server";
import { POST } from "./route";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required for pay-reconcile route tests");
const connection = createDatabase(databaseUrl, 2);
const originalRpcUrl = process.env.BASE_SEPOLIA_RPC_URL;
const validBeforeSeconds = 1_784_400_300;
const nonce = `0x${"12".repeat(32)}`;
const baseSepoliaUsdc = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";
const payTo = "0x1111111111111111111111111111111111111111";
const blockHash = `0x${"ab".repeat(32)}`;
const transaction = `0x${"cd".repeat(32)}`;
const rpcSecret = "rpc-query-credential-must-not-escape";

async function provision(address = "0x2222222222222222222222222222222222222222") {
  const [user] = await connection.db
    .insert(users)
    .values({ email: `${randomUUID()}@example.test`, magicIssuer: `did:ethr:${randomUUID()}` })
    .returning({ id: users.id });
  if (!user) throw new Error("Expected user");
  const [agent] = await connection.db
    .insert(agents)
    .values({
      agentAddress: address,
      name: "Reconcile route",
      ownerId: user.id,
      paymentProfile: "base_sepolia_integration",
      signerSubject: `leash:${randomUUID()}`,
    })
    .returning({ id: agents.id });
  if (!agent) throw new Error("Expected agent");
  const key = await issueLeashKey(connection.db, { agentId: agent.id });
  const [cycle] = await connection.db
    .insert(capCycles)
    .values({ agentId: agent.id, startedAt: new Date() })
    .returning({ id: capCycles.id });
  if (!cycle) throw new Error("Expected cycle");
  const [receipt] = await connection.db
    .insert(receipts)
    .values({
      agentId: agent.id,
      amountAtomic: "25000",
      amountUsd: "0.025000",
      asset: baseSepoliaUsdc,
      authorizationNonce: nonce,
      authorizationValidBefore: new Date(validBeforeSeconds * 1_000),
      cycleId: cycle.id,
      network: "eip155:84532",
      payTo,
      requestFingerprint: randomBytes(32).toString("hex"),
    })
    .returning({ id: receipts.id });
  if (!receipt) throw new Error("Expected receipt");
  return { agentId: agent.id, receiptId: receipt.id, secret: key.secret };
}

function request(secret: string | null, body: unknown) {
  return new NextRequest("http://localhost/api/agent/pay/reconcile", {
    body: JSON.stringify(body),
    headers: {
      ...(secret ? { authorization: `Bearer ${secret}` } : {}),
      "content-type": "application/json",
    },
    method: "POST",
  });
}

describe("POST /api/agent/pay/reconcile", () => {
  let chainId = 84_532;
  let finalizedTimestamp = validBeforeSeconds;
  let rpcUnavailable = false;
  let used = false;
  const calls: unknown[][] = [];
  const server = createServer(async (incoming, response) => {
    const chunks: Buffer[] = [];
    for await (const chunk of incoming) chunks.push(Buffer.from(chunk));
    const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (rpcUnavailable) {
      response.statusCode = 503;
      response.end(rpcSecret);
      return;
    }
    response.setHeader("content-type", "application/json");
    if (Array.isArray(body)) {
      response.end(
        JSON.stringify([
          { id: 1, jsonrpc: "2.0", result: `0x${chainId.toString(16)}` },
          {
            id: 2,
            jsonrpc: "2.0",
            result: {
              hash: blockHash,
              number: "0x123",
              timestamp: `0x${finalizedTimestamp.toString(16)}`,
            },
          },
        ]),
      );
      return;
    }
    calls.push(body.params);
    response.end(
      JSON.stringify({
        id: body.id,
        jsonrpc: "2.0",
        result: `0x${(used ? "1" : "0").padStart(64, "0")}`,
      }),
    );
  });

  beforeAll(async () => {
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Expected TCP listener");
    process.env.BASE_SEPOLIA_RPC_URL = `http://127.0.0.1:${address.port}/?key=${rpcSecret}`;
  });

  beforeEach(async () => {
    chainId = 84_532;
    finalizedTimestamp = validBeforeSeconds;
    rpcUnavailable = false;
    used = false;
    calls.length = 0;
    await connection.client`truncate table users cascade`;
  });

  afterAll(async () => {
    if (originalRpcUrl === undefined) delete process.env.BASE_SEPOLIA_RPC_URL;
    else process.env.BASE_SEPOLIA_RPC_URL = originalRpcUrl;
    await closeServerDatabase();
    await connection.client.end();
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  });

  it("authenticates first and accepts only the exact UUID body", async () => {
    const pending = await provision();
    expect((await POST(request(null, { receiptId: pending.receiptId }))).status).toBe(401);
    for (const body of [
      { receiptId: "not-a-uuid" },
      { receiptId: pending.receiptId, signature: "forbidden" },
    ]) {
      const response = await POST(request(pending.secret, body));
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({
        error: {
          code: "INVALID_PAYMENT_RECONCILIATION",
          message: "The payment reconciliation request is invalid.",
        },
      });
    }
  });

  it("does not reveal whether another agent owns a receipt", async () => {
    const pending = await provision();
    const foreign = await provision("0x3333333333333333333333333333333333333333");
    const wrongAgent = await POST(request(foreign.secret, { receiptId: pending.receiptId }));
    const missing = await POST(request(pending.secret, { receiptId: randomUUID() }));
    expect(wrongAgent.status).toBe(404);
    expect(missing.status).toBe(404);
  });

  it("fails closed for used, pre-finality, wrong-chain, and unavailable RPC states", async () => {
    const pending = await provision();
    for (const configure of [
      () => {
        used = true;
      },
      () => {
        finalizedTimestamp = validBeforeSeconds - 1;
      },
      () => {
        chainId = 1;
      },
      () => {
        rpcUnavailable = true;
      },
    ]) {
      used = false;
      chainId = 84_532;
      finalizedTimestamp = validBeforeSeconds;
      rpcUnavailable = false;
      configure();
      const response = await POST(request(pending.secret, { receiptId: pending.receiptId }));
      expect(response.status).toBe(202);
      const body = await response.json();
      expect(body).toEqual({ receiptId: pending.receiptId, status: "pending", verified: false });
      expect(JSON.stringify(body)).not.toContain(rpcSecret);
    }
  });

  it("terminalizes exact finalized-unused proof idempotently with an EIP-1898 call", async () => {
    const pending = await provision();
    const first = await POST(request(pending.secret, { receiptId: pending.receiptId }));
    const second = await POST(request(pending.secret, { receiptId: pending.receiptId }));
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    await expect(first.json()).resolves.toEqual({
      receiptId: pending.receiptId,
      status: "failed",
      verified: true,
    });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.[0]).toMatchObject({ to: baseSepoliaUsdc });
    expect(calls[0]?.[1]).toEqual({ blockHash, requireCanonical: true });
  });

  it("reconciles a verified reverted transaction without erasing its evidence", async () => {
    const pending = await provision();
    await connection.db
      .update(receipts)
      .set({
        reason: "invalid_exact_evm_transaction_failed",
        settlementResponse: {
          errorReason: "invalid_exact_evm_transaction_failed",
          network: "eip155:84532",
          payer: "0x2222222222222222222222222222222222222222",
          proof: "reverted_matching_eip3009_call",
          success: false,
          transaction,
        },
        status: "failed",
        txHash: transaction,
      })
      .where(eq(receipts.id, pending.receiptId));

    const response = await POST(request(pending.secret, { receiptId: pending.receiptId }));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      receiptId: pending.receiptId,
      status: "failed",
      verified: true,
    });
    const [stored] = await connection.db
      .select({
        reason: receipts.reason,
        response: receipts.settlementResponse,
        txHash: receipts.txHash,
      })
      .from(receipts)
      .where(eq(receipts.id, pending.receiptId));
    expect(stored).toMatchObject({
      reason: "AUTHORIZATION_EXPIRED",
      response: { transaction },
      txHash: transaction,
    });
  });

  it("returns a conflict for a different terminal outcome", async () => {
    const pending = await provision();
    await connection.db
      .update(receipts)
      .set({ reason: "FLOAT_EMPTY", status: "failed" })
      .where(eq(receipts.id, pending.receiptId));
    const response = await POST(request(pending.secret, { receiptId: pending.receiptId }));
    expect(response.status).toBe(409);
    expect(calls).toHaveLength(0);
  });
});
