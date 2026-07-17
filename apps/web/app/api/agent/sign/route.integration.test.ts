import { randomBytes, randomUUID } from "node:crypto";
import { createServer } from "node:http";

import { NextRequest } from "next/server";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { issueLeashKey } from "../../../../lib/auth/leash-key";
import { createDatabase } from "../../../../lib/db/client";
import { agents, capCycles, caps, notifications, receipts, users } from "../../../../lib/db/schema";
import { closeServerDatabase } from "../../../../lib/db/server";
import { POST } from "./route";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required for sign route tests");
const connection = createDatabase(databaseUrl, 3);
const agentAddress = "0x2222222222222222222222222222222222222222";
const payTo = "0x1111111111111111111111111111111111111111";
const baseUsdc = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const originalRpcUrl = process.env.BASE_RPC_URL;

async function provision(
  options: { capCents?: string | null; status?: "provisioned" | "paused" | "frozen" } = {},
) {
  const [user] = await connection.db
    .insert(users)
    .values({ email: `${randomUUID()}@example.test`, magicIssuer: `did:ethr:${randomUUID()}` })
    .returning({ id: users.id });
  if (!user) throw new Error("Expected user");
  const [agent] = await connection.db
    .insert(agents)
    .values({
      agentAddress,
      name: "Sign route",
      ownerId: user.id,
      signerSubject: `leash:${randomUUID()}`,
      status: options.status ?? "provisioned",
    })
    .returning({ id: agents.id });
  if (!agent) throw new Error("Expected agent");
  const key = await issueLeashKey(connection.db, { agentId: agent.id });
  const [cycle] = await connection.db
    .insert(capCycles)
    .values({ agentId: agent.id, startedAt: new Date() })
    .returning({ id: capCycles.id });
  if (!cycle) throw new Error("Expected cycle");
  if (options.capCents !== null) {
    await connection.db.insert(caps).values({
      agentId: agent.id,
      amountUsdCents: options.capCents ?? "100",
      frequency: "daily",
    });
  }
  return { agentId: agent.id, secret: key.secret };
}

function signBody(amount = "25000") {
  const validBefore = Math.floor(Date.now() / 1_000) + 300;
  return {
    amount,
    asset: baseUsdc,
    network: "eip155:8453",
    origin: { clientName: "Claude Code", toolName: "search", transport: "mcp" },
    payTo,
    resourceUrl: "mcp://tool/search",
    signerRequest: {
      domain: { chainId: 8453, name: "USD Coin", verifyingContract: baseUsdc, version: "2" },
      message: {
        from: agentAddress,
        nonce: `0x${randomBytes(32).toString("hex")}`,
        to: payTo,
        validAfter: "0",
        validBefore: String(validBefore),
        value: amount,
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
    },
  };
}

function request(secret: string | null, body: unknown, raw = false) {
  return new NextRequest("http://localhost/api/agent/sign", {
    body: raw ? String(body) : JSON.stringify(body),
    headers: {
      ...(secret ? { authorization: `Bearer ${secret}` } : {}),
      "content-type": "application/json",
    },
    method: "POST",
  });
}

describe("POST /api/agent/sign", () => {
  let liveBalance = BigInt(1_000_000);
  let rpcUnavailable = false;
  const rpcMethods: string[] = [];
  const server = createServer(async (incoming, response) => {
    const chunks: Buffer[] = [];
    for await (const chunk of incoming) chunks.push(Buffer.from(chunk));
    const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    rpcMethods.push(body.method);
    response.setHeader("content-type", "application/json");
    if (rpcUnavailable) {
      response.end(
        JSON.stringify({
          error: { code: -32_000, message: "RPC unavailable" },
          id: body.id,
          jsonrpc: "2.0",
        }),
      );
      return;
    }
    response.end(
      JSON.stringify({
        id: body.id,
        jsonrpc: "2.0",
        result: `0x${liveBalance.toString(16).padStart(64, "0")}`,
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
    liveBalance = BigInt(1_000_000);
    rpcUnavailable = false;
    rpcMethods.length = 0;
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

  it("authenticates first and applies the status gate before malformed JSON", async () => {
    const paused = await provision({ status: "paused" });
    const unknown = await POST(request(null, "{", true));
    expect(unknown.status).toBe(401);

    const response = await POST(request(paused.secret, "{", true));
    expect(response.status).toBe(423);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "AGENT_PAUSED" } });
    expect(rpcMethods).toHaveLength(0);
  });

  it("rejects malformed authority and no-cap policy before touching RPC", async () => {
    const configured = await provision();
    expect((await POST(request(configured.secret, { arbitrary: "typed data" }))).status).toBe(400);

    await connection.client`truncate table users cascade`;
    const noCap = await provision({ capCents: null });
    const response = await POST(request(noCap.secret, signBody()));
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "LEASH_CAP_NOT_SET" } });
    expect(rpcMethods).toHaveLength(0);
  });

  it("rejects an oversized uint256 before PostgreSQL can write partial audit state", async () => {
    const identity = await provision();
    const uint256Max = (BigInt(2) ** BigInt(256) - BigInt(1)).toString();
    const response = await POST(request(identity.secret, signBody(uint256Max)));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "INVALID_SIGN_REQUEST" },
    });
    const receiptRows = await connection.db.select({ id: receipts.id }).from(receipts);
    const notificationRows = await connection.db
      .select({ id: notifications.id })
      .from(notifications);
    expect({ notificationRows, receiptRows }).toEqual({ notificationRows: [], receiptRows: [] });
    expect(rpcMethods).toHaveLength(0);
  });

  it("writes cap-exceeded as blocked without reading or signing", async () => {
    const identity = await provision({ capCents: "1" });
    const response = await POST(request(identity.secret, signBody("25000")));

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "LEASH_CAP_EXCEEDED" },
    });
    const [stored] = await connection.db
      .select({ intendedNetwork: receipts.intendedNetwork, status: receipts.status })
      .from(receipts);
    expect(stored).toEqual({ intendedNetwork: "eip155:8453", status: "blocked" });
    expect(rpcMethods).toHaveLength(0);
  });

  it("reads live native-USDC balance and records a proven empty float", async () => {
    const identity = await provision();
    liveBalance = BigInt(0);
    const response = await POST(request(identity.secret, signBody()));

    expect(response.status).toBe(402);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "FLOAT_EMPTY" } });
    const [stored] = await connection.db
      .select({ reason: receipts.reason, status: receipts.status })
      .from(receipts);
    expect(stored).toEqual({ reason: "FLOAT_EMPTY", status: "failed" });
    expect(rpcMethods).toEqual(["eth_call"]);
  });

  it("terminalizes a reservation when RPC fails before any signature can escape", async () => {
    const identity = await provision();
    rpcUnavailable = true;
    const response = await POST(request(identity.secret, signBody()));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "FLOAT_CHECK_UNAVAILABLE" },
    });
    const [stored] = await connection.db
      .select({ reason: receipts.reason, status: receipts.status })
      .from(receipts);
    expect(stored).toEqual({ reason: "FLOAT_CHECK_UNAVAILABLE", status: "failed" });
  });

  it("returns the honest signer block with a failed receipt and no signature or hash", async () => {
    const identity = await provision();
    const response = await POST(request(identity.secret, signBody()));
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body).toMatchObject({ error: { code: "SIGNER_NOT_CONFIGURED" } });
    expect(JSON.stringify(body)).not.toContain("signature");
    const [stored] = await connection.db
      .select({ reason: receipts.reason, status: receipts.status, txHash: receipts.txHash })
      .from(receipts);
    expect(stored).toEqual({ reason: "SIGNER_NOT_CONFIGURED", status: "failed", txHash: null });
  });
});
