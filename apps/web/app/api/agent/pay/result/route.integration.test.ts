import { randomBytes, randomUUID } from "node:crypto";
import { createServer } from "node:http";

import { NextRequest } from "next/server";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { issueLeashKey } from "../../../../../lib/auth/leash-key";
import { createDatabase } from "../../../../../lib/db/client";
import { agents, capCycles, receipts, users } from "../../../../../lib/db/schema";
import { closeServerDatabase } from "../../../../../lib/db/server";
import { POST } from "./route";
import {
  agentAddress,
  authorizationValidBefore,
  baseUsdc,
  nonce,
  payTo,
  rpcBlock,
  rpcReceipt,
  rpcTransaction,
  transaction,
} from "./route.integration-support";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required for pay-result route tests");
const connection = createDatabase(databaseUrl, 2);
const originalRpcUrl = process.env.BASE_RPC_URL;
const finalizedHash = `0x${"ef".repeat(32)}`;

async function provision() {
  const [user] = await connection.db
    .insert(users)
    .values({ email: `${randomUUID()}@example.test`, magicIssuer: `did:ethr:${randomUUID()}` })
    .returning({ id: users.id });
  if (!user) throw new Error("Expected user");
  const [agent] = await connection.db
    .insert(agents)
    .values({
      agentAddress,
      name: "Result route",
      ownerId: user.id,
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
      asset: baseUsdc,
      authorizationNonce: nonce,
      authorizationValidBefore,
      cycleId: cycle.id,
      network: "eip155:8453",
      payTo,
      requestFingerprint: randomBytes(32).toString("hex"),
    })
    .returning({ id: receipts.id });
  if (!receipt) throw new Error("Expected receipt");
  return { agentId: agent.id, receiptId: receipt.id, secret: key.secret };
}

function observation(receiptId: string) {
  return {
    outcome: "observed",
    paymentResponse: {
      network: "eip155:8453",
      payer: agentAddress,
      success: true,
      transaction,
    },
    receiptId,
  };
}

function failedObservation(receiptId: string) {
  return {
    outcome: "observed",
    paymentResponse: {
      errorReason: "invalid_exact_evm_transaction_failed",
      network: "eip155:8453",
      payer: agentAddress,
      success: false,
      transaction,
    },
    receiptId,
  };
}

function request(secret: string | null, body: unknown) {
  return new NextRequest("http://localhost/api/agent/pay/result", {
    body: JSON.stringify(body),
    headers: {
      ...(secret ? { authorization: `Bearer ${secret}` } : {}),
      "content-type": "application/json",
    },
    method: "POST",
  });
}

describe("POST /api/agent/pay/result", () => {
  let finalizedBlockNumber = 2;
  let includeAuthorization = false;
  let reverted = false;
  const server = createServer(async (incoming, response) => {
    const chunks: Buffer[] = [];
    for await (const chunk of incoming) chunks.push(Buffer.from(chunk));
    const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    response.setHeader("content-type", "application/json");
    response.end(
      JSON.stringify({
        id: body.id,
        jsonrpc: "2.0",
        result:
          body.method === "eth_chainId"
            ? "0x2105"
            : body.method === "eth_getBlockByNumber"
              ? body.params[0] === "finalized"
                ? rpcBlock(finalizedBlockNumber, finalizedHash)
                : rpcBlock(Number(BigInt(body.params[0])))
              : body.method === "eth_getTransactionByHash"
                ? rpcTransaction()
                : rpcReceipt(includeAuthorization, !reverted),
      }),
    );
  });

  beforeAll(async () => {
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Expected TCP listener");
    process.env.BASE_RPC_URL = `http://127.0.0.1:${address.port}`;
  });

  beforeEach(async () => {
    finalizedBlockNumber = 2;
    includeAuthorization = false;
    reverted = false;
    await connection.client`truncate table users cascade`;
  });

  afterAll(async () => {
    if (originalRpcUrl === undefined) delete process.env.BASE_RPC_URL;
    else process.env.BASE_RPC_URL = originalRpcUrl;
    await closeServerDatabase();
    await connection.client.end();
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  });

  it("uses a generic 401 and rejects client-declared failure without releasing pending spend", async () => {
    const pending = await provision();
    expect((await POST(request(null, observation(pending.receiptId)))).status).toBe(401);

    const response = await POST(
      request(pending.secret, { outcome: "failed", receiptId: pending.receiptId }),
    );
    expect(response.status).toBe(400);
    const [stored] = await connection.db.select({ status: receipts.status }).from(receipts);
    expect(stored?.status).toBe("pending");
  });

  it("keeps a resource claim pending when the exact authorization-use proof is absent", async () => {
    const pending = await provision();
    const response = await POST(request(pending.secret, observation(pending.receiptId)));

    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toEqual({
      receiptId: pending.receiptId,
      status: "pending",
      verified: false,
    });
  });

  it("settles from real RPC proof and handles the same callback idempotently", async () => {
    const pending = await provision();
    includeAuthorization = true;

    const first = await POST(request(pending.secret, observation(pending.receiptId)));
    const second = await POST(request(pending.secret, observation(pending.receiptId)));
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    const [stored] = await connection.db
      .select({ status: receipts.status, txHash: receipts.txHash })
      .from(receipts);
    expect(stored).toEqual({ status: "settled", txHash: transaction });
  });

  it("returns 202 until a successful receipt is in the finalized canonical chain", async () => {
    const pending = await provision();
    includeAuthorization = true;
    finalizedBlockNumber = 0;

    const early = await POST(request(pending.secret, observation(pending.receiptId)));
    expect(early.status).toBe(202);
    await expect(early.json()).resolves.toMatchObject({ status: "pending", verified: false });

    finalizedBlockNumber = 2;
    const finalized = await POST(request(pending.secret, observation(pending.receiptId)));
    expect(finalized.status).toBe(200);
    await expect(finalized.json()).resolves.toMatchObject({ status: "settled", verified: true });
  });

  it("records a mined reverted authorization call as failed with its real hash", async () => {
    const pending = await provision();
    reverted = true;

    const response = await POST(request(pending.secret, failedObservation(pending.receiptId)));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      receiptId: pending.receiptId,
      status: "failed",
      verified: true,
    });
    const [stored] = await connection.db
      .select({ reason: receipts.reason, status: receipts.status, txHash: receipts.txHash })
      .from(receipts);
    expect(stored).toEqual({
      reason: "invalid_exact_evm_transaction_failed",
      status: "failed",
      txHash: transaction,
    });
  });

  it("returns 202 for a reverted authorization call until its block is finalized", async () => {
    const pending = await provision();
    reverted = true;
    finalizedBlockNumber = 0;

    const early = await POST(request(pending.secret, failedObservation(pending.receiptId)));
    expect(early.status).toBe(202);
    await expect(early.json()).resolves.toMatchObject({ status: "pending", verified: false });

    finalizedBlockNumber = 2;
    const finalized = await POST(request(pending.secret, failedObservation(pending.receiptId)));
    expect(finalized.status).toBe(200);
    await expect(finalized.json()).resolves.toMatchObject({ status: "failed", verified: true });
  });
});
