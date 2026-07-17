import { randomBytes, randomUUID } from "node:crypto";

import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { createDatabase } from "../db/client";
import { reserveSignRequest } from "./sign-store";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required for resource provenance tests");

const connection = createDatabase(databaseUrl, 3);
const agentAddress = "0x2222222222222222222222222222222222222222";
const payTo = "0x1111111111111111111111111111111111111111";
const baseUsdc = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const nowSeconds = 1_784_271_300;

beforeEach(async () => {
  await connection.client`truncate table users cascade`;
});

afterAll(async () => {
  await connection.client.end();
});

async function provision(capCents: string) {
  const [owner] = await connection.client<{ id: string }[]>`
    insert into users (email, magic_issuer)
    values (${`${randomUUID()}@example.test`}, ${`did:ethr:${randomUUID()}`})
    returning id
  `;
  if (!owner) throw new Error("Expected an owner");
  const [agent] = await connection.client<{ id: string }[]>`
    insert into agents (owner_id, name, status, signer_subject, agent_address)
    values (
      ${owner.id}, 'Resource provenance', 'provisioned',
      ${`leash:${randomUUID()}`}, ${agentAddress}
    ) returning id
  `;
  if (!agent) throw new Error("Expected an agent");
  const [key] = await connection.client<{ id: string }[]>`
    insert into leash_keys (agent_id, hashed_key, prefix, last4)
    values (${agent.id}, ${randomBytes(32).toString("hex")}, 'leash_sk_', 'a1B2')
    returning id
  `;
  await connection.client`
    insert into cap_cycles (agent_id, started_at)
    values (${agent.id}, ${new Date((nowSeconds - 60) * 1_000).toISOString()}::timestamptz)
  `;
  await connection.client`
    insert into caps (agent_id, amount_usd_cents, frequency)
    values (${agent.id}, ${capCents}, 'daily')
  `;
  if (!key) throw new Error("Expected a key");
  return { agentId: agent.id, keyId: key.id };
}

function signBody(resourceUrl: string, nonce = randomBytes(32).toString("hex")) {
  return {
    amount: "25000",
    asset: baseUsdc,
    network: "eip155:8453",
    origin: { clientName: "Claude Code", toolName: "search", transport: "mcp" },
    payTo,
    resourceUrl,
    signerRequest: {
      domain: {
        chainId: 8453,
        name: "USD Coin",
        verifyingContract: baseUsdc,
        version: "2",
      },
      message: {
        from: agentAddress,
        nonce: `0x${nonce}`,
        to: payTo,
        validAfter: "0",
        validBefore: String(nowSeconds + 300),
        value: "25000",
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

describe("receipt resource provenance persistence", () => {
  it.each([
    ["pending", "100"],
    ["blocked", "1"],
  ] as const)("persists sanitized provenance on a new %s receipt", async (status, capCents) => {
    const identity = await provision(capCents);
    const result = await reserveSignRequest(connection.db, {
      ...identity,
      body: signBody(
        "MCP://receipt-user:receipt-password@PAYMENTS.Example.TEST/tool/search?api_key=receipt-secret#fragment-secret",
      ),
      nowSeconds,
    });

    expect(result.kind).toBe(status);
    const [stored] = await connection.client<
      { origin: unknown; resource_host: string; resource_url: string; status: string }[]
    >`
      select status, origin, resource_url, resource_host from receipts where id = ${result.receiptId}
    `;
    expect(stored).toEqual({
      origin: { clientName: "Claude Code", toolName: "search", transport: "mcp" },
      resource_host: "payments.example.test",
      resource_url: "mcp://payments.example.test/tool/search",
      status,
    });
    expect(JSON.stringify(stored)).not.toMatch(
      /receipt-user|receipt-password|receipt-secret|fragment-secret/,
    );
  });

  it("preserves the first resource when an idempotent nonce is replayed", async () => {
    const identity = await provision("100");
    const nonce = randomBytes(32).toString("hex");
    const first = await reserveSignRequest(connection.db, {
      ...identity,
      body: signBody("https://FIRST.Example.TEST/pay?secret=first", nonce),
      nowSeconds,
    });
    const replay = await reserveSignRequest(connection.db, {
      ...identity,
      body: signBody("https://second.example.test/other?secret=second", nonce),
      nowSeconds,
    });

    expect(replay).toMatchObject({ receiptId: first.receiptId, replayed: true });
    const [stored] = await connection.client<{ resource_host: string; resource_url: string }[]>`
      select resource_url, resource_host from receipts where id = ${first.receiptId}
    `;
    expect(stored).toEqual({
      resource_host: "first.example.test",
      resource_url: "https://first.example.test/pay",
    });
  });
});
