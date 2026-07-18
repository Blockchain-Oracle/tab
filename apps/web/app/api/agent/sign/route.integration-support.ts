import { randomBytes, randomUUID } from "node:crypto";
import { createServer } from "node:http";

import { NextRequest } from "next/server";

import { issueLeashKey } from "../../../../lib/auth/leash-key";
import { createDatabase } from "../../../../lib/db/client";
import { agents, capCycles, caps, users } from "../../../../lib/db/schema";
import { closeServerDatabase } from "../../../../lib/db/server";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required for sign route tests");

export const connection = createDatabase(databaseUrl, 3);
export const agentAddress = "0x2222222222222222222222222222222222222222";
const payTo = "0x1111111111111111111111111111111111111111";
const baseUsdc = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";

export async function provision(
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

export function signBody(amount = "25000") {
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
        validBefore: String(Math.floor(Date.now() / 1_000) + 300),
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

export function request(secret: string | null, body: unknown, raw = false) {
  return new NextRequest("http://localhost/api/agent/sign", {
    body: raw ? String(body) : JSON.stringify(body),
    headers: {
      ...(secret ? { authorization: `Bearer ${secret}` } : {}),
      "content-type": "application/json",
    },
    method: "POST",
  });
}

export function createRpcHarness() {
  const originalRpcUrl = process.env.BASE_RPC_URL;
  let liveBalance = BigInt(1_000_000);
  let unavailable = false;
  const methods: string[] = [];
  const server = createServer(async (incoming, response) => {
    const chunks: Buffer[] = [];
    for await (const chunk of incoming) chunks.push(Buffer.from(chunk));
    const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    methods.push(body.method);
    response.setHeader("content-type", "application/json");
    if (unavailable) {
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
        result:
          body.method === "eth_chainId"
            ? "0x2105"
            : `0x${liveBalance.toString(16).padStart(64, "0")}`,
      }),
    );
  });

  return {
    methods,
    async reset() {
      liveBalance = BigInt(1_000_000);
      unavailable = false;
      methods.length = 0;
      await connection.client`truncate table users cascade`;
    },
    setBalance(value: bigint) {
      liveBalance = value;
    },
    setUnavailable(value: boolean) {
      unavailable = value;
    },
    async start() {
      await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
      const address = server.address();
      if (!address || typeof address === "string") throw new Error("Expected TCP listener");
      process.env.BASE_RPC_URL = `http://127.0.0.1:${address.port}`;
    },
    async stop() {
      if (originalRpcUrl === undefined) delete process.env.BASE_RPC_URL;
      else process.env.BASE_RPC_URL = originalRpcUrl;
      await closeServerDatabase();
      await connection.client.end();
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    },
  };
}
