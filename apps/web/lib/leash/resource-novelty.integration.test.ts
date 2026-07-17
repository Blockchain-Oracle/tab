import { randomBytes, randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { createDatabase, type Database } from "../db/client";
import { notifications, receipts } from "../db/schema";
import { reserveSignRequest } from "./sign-store";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required for resource novelty tests");

const connection = createDatabase(databaseUrl, 4);
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

async function provision() {
  const [owner] = await connection.client<{ id: string }[]>`
    insert into users (email, magic_issuer)
    values (${`${randomUUID()}@example.test`}, ${`did:ethr:${randomUUID()}`}) returning id
  `;
  if (!owner) throw new Error("Expected owner");
  const [agent] = await connection.client<{ id: string }[]>`
    insert into agents (owner_id, name, signer_subject, agent_address)
    values (${owner.id}, 'Novelty test', ${`leash:${randomUUID()}`}, ${agentAddress}) returning id
  `;
  if (!agent) throw new Error("Expected agent");
  const [key] = await connection.client<{ id: string }[]>`
    insert into leash_keys (agent_id, hashed_key, prefix, last4)
    values (${agent.id}, ${randomBytes(32).toString("hex")}, 'leash_sk_', 'a1B2') returning id
  `;
  const [cycle] = await connection.client<{ id: string }[]>`
    insert into cap_cycles (agent_id, started_at)
    values (${agent.id}, ${new Date((nowSeconds - 60) * 1_000).toISOString()}::timestamptz)
    returning id
  `;
  await connection.client`
    insert into caps (agent_id, amount_usd_cents, frequency) values (${agent.id}, '1000', 'daily')
  `;
  if (!key || !cycle) throw new Error("Expected key and cycle");
  return { agentId: agent.id, cycleId: cycle.id, keyId: key.id };
}

function signBody(resourceUrl: string) {
  const amount = "25000";
  return {
    amount,
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
        nonce: `0x${randomBytes(32).toString("hex")}`,
        to: payTo,
        validAfter: "0",
        validBefore: String(nowSeconds + 300),
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

async function unusualDomains() {
  return connection.db.select().from(notifications).where(eq(notifications.type, "unusual_domain"));
}

async function insertHistoricalMcp(
  identity: Awaited<ReturnType<typeof provision>>,
  resourceUrl: string,
) {
  await connection.client`
    insert into receipts (
      agent_id, cycle_id, amount_atomic, amount_usd, asset, network, pay_to,
      resource_url, resource_host, authorization_nonce, request_fingerprint,
      authorization_valid_before
    ) values (
      ${identity.agentId}, ${identity.cycleId}, '1', '0.000001', ${baseUsdc},
      'eip155:8453', ${payTo}, ${resourceUrl}, 'tool',
      ${`0x${randomBytes(32).toString("hex")}`}, ${randomBytes(32).toString("hex")},
      ${new Date((nowSeconds + 300) * 1_000).toISOString()}::timestamptz
    )
  `;
}

describe("resource novelty identity", () => {
  it("treats canonical MCP tool URLs as distinct while replaying each URL once", async () => {
    const identity = await provision();
    await reserveSignRequest(connection.db, {
      ...identity,
      body: signBody("mcp://tool/search?secret=one"),
      nowSeconds,
    });
    await reserveSignRequest(connection.db, {
      ...identity,
      body: signBody("mcp://tool/export?secret=two"),
      nowSeconds,
    });
    await reserveSignRequest(connection.db, {
      ...identity,
      body: signBody("MCP://user:pass@TOOL/search#replay"),
      nowSeconds,
    });

    const rows = await unusualDomains();
    expect(rows).toHaveLength(2);
    expect(new Set(rows.map((row) => row.resourceHost))).toEqual(new Set(["tool"]));
    expect(new Set(rows.map((row) => row.metadata.resourceUrl))).toEqual(
      new Set(["mcp://tool/search", "mcp://tool/export"]),
    );
    expect(rows.map((row) => row.resourceKey)).toEqual([
      expect.stringMatching(/^[0-9a-f]{64}$/),
      expect.stringMatching(/^[0-9a-f]{64}$/),
    ]);
    expect(new Set(rows.map((row) => row.resourceKey))).toHaveProperty("size", 2);
    expect(rows.every((row) => row.eventKey === `unusual_domain:${row.resourceKey}`)).toBe(true);
    expect(JSON.stringify(rows)).not.toMatch(/secret|user|pass/);
    const linked = await connection.db
      .select({ resourceUrl: receipts.resourceUrl })
      .from(receipts)
      .where(eq(receipts.agentId, identity.agentId));
    expect(new Set(linked.map((row) => row.resourceUrl))).toEqual(
      new Set(["mcp://tool/search", "mcp://tool/export"]),
    );
  });

  it("deduplicates concurrent HTTP paths by normalized host", async () => {
    const identity = await provision();
    await Promise.all([
      reserveSignRequest(connection.db, {
        ...identity,
        body: signBody("https://API.Vendor.TEST/pay?secret=one"),
        nowSeconds,
      }),
      reserveSignRequest(connection.db, {
        ...identity,
        body: signBody("https://api.vendor.test/export?secret=two"),
        nowSeconds,
      }),
    ]);

    expect(await unusualDomains()).toHaveLength(1);
  });

  it("uses the full canonical MCP URL when checking historical receipts", async () => {
    const identity = await provision();
    await insertHistoricalMcp(identity, "mcp://tool/search");

    await reserveSignRequest(connection.db, {
      ...identity,
      body: signBody("mcp://tool/search"),
      nowSeconds,
    });
    expect(await unusualDomains()).toEqual([]);

    await reserveSignRequest(connection.db, {
      ...identity,
      body: signBody("mcp://tool/export"),
      nowSeconds,
    });
    expect(await unusualDomains()).toEqual([
      expect.objectContaining({
        metadata: { resourceHost: "tool", resourceUrl: "mcp://tool/export" },
        resourceHost: "tool",
      }),
    ]);
  });

  it("rolls the resource identity and linked receipt back together", async () => {
    const identity = await provision();
    await expect(
      connection.db.transaction(async (transaction) => {
        await reserveSignRequest(transaction as unknown as Database, {
          ...identity,
          body: signBody("mcp://tool/rollback"),
          nowSeconds,
        });
        expect(
          await transaction
            .select()
            .from(notifications)
            .where(eq(notifications.type, "unusual_domain")),
        ).toHaveLength(1);
        throw new Error("rollback novelty");
      }),
    ).rejects.toThrow("rollback novelty");

    expect(await unusualDomains()).toEqual([]);
    expect(await connection.db.select().from(receipts)).toEqual([]);
  });
});
