import { randomBytes, randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { createDatabase, type Database } from "../db/client";
import { notifications, receipts } from "../db/schema";
import { reserveSignRequest } from "./sign-store";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required for sign notification tests");

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

async function provision(capCents = "100") {
  const [owner] = await connection.client<{ id: string }[]>`
    insert into users (email, magic_issuer)
    values (${`${randomUUID()}@example.test`}, ${`did:ethr:${randomUUID()}`}) returning id
  `;
  if (!owner) throw new Error("Expected owner");
  const [agent] = await connection.client<{ id: string }[]>`
    insert into agents (owner_id, name, signer_subject, agent_address)
    values (${owner.id}, 'Notification test', ${`leash:${randomUUID()}`}, ${agentAddress})
    returning id
  `;
  if (!agent) throw new Error("Expected agent");
  const [key] = await connection.client<{ id: string }[]>`
    insert into leash_keys (agent_id, hashed_key, prefix, last4)
    values (${agent.id}, ${randomBytes(32).toString("hex")}, 'leash_sk_', 'a1B2')
    returning id
  `;
  const [cycle] = await connection.client<{ id: string }[]>`
    insert into cap_cycles (agent_id, started_at)
    values (${agent.id}, ${new Date((nowSeconds - 60) * 1_000).toISOString()}::timestamptz)
    returning id
  `;
  await connection.client`
    insert into caps (agent_id, amount_usd_cents, frequency)
    values (${agent.id}, ${capCents}, 'daily')
  `;
  if (!key || !cycle) throw new Error("Expected key and cycle");
  return { agentId: agent.id, cycleId: cycle.id, keyId: key.id };
}

function signBody(amount: string, resourceUrl: string, nonce = randomBytes(32).toString("hex")) {
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
        nonce: `0x${nonce}`,
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

async function insertHistorical(
  identity: Awaited<ReturnType<typeof provision>>,
  status: "pending" | "settled" | "blocked",
  resourceHost: string,
) {
  const settled = status === "settled";
  const blocked = status === "blocked";
  const txHash = settled ? `0x${randomBytes(32).toString("hex")}` : null;
  await connection.client`
    insert into receipts (
      agent_id, cycle_id, status, reason, amount_atomic, amount_usd, asset, network,
      intended_network, pay_to, resource_url, resource_host, authorization_nonce,
      request_fingerprint, authorization_valid_before, tx_hash, settlement_response, settled_at
    ) values (
      ${identity.agentId}, ${identity.cycleId}, ${status},
      ${blocked ? "LEASH_CAP_EXCEEDED" : null}, '1', '0.000001', ${baseUsdc}, 'eip155:8453',
      ${blocked ? "eip155:8453" : null}, ${payTo}, ${`https://${resourceHost}/old`},
      ${resourceHost}, ${`0x${randomBytes(32).toString("hex")}`},
      ${randomBytes(32).toString("hex")}, now() + interval '5 minutes',
      ${txHash},
      ${settled ? JSON.stringify({ success: true, transaction: txHash, verified: true }) : null}::jsonb,
      ${settled ? new Date().toISOString() : null}::timestamptz
    )
  `;
}

describe("transactional notifications from signer reservation", () => {
  it("keeps committed spend separate from the blocked attempted amount and replays once", async () => {
    const identity = await provision();
    const resourceUrl = "https://api.vendor.test/pay";
    await reserveSignRequest(connection.db, {
      ...identity,
      body: signBody("600000", resourceUrl),
      nowSeconds,
    });
    await reserveSignRequest(connection.db, {
      ...identity,
      body: signBody("400000", resourceUrl),
      nowSeconds,
    });
    const nonce = randomBytes(32).toString("hex");
    const body = signBody("1", resourceUrl, nonce);
    const blocked = await reserveSignRequest(connection.db, {
      ...identity,
      body,
      nowSeconds,
    });
    const replay = await reserveSignRequest(connection.db, {
      ...identity,
      body: signBody("1", "https://replay-ignored.vendor.test/pay", nonce),
      nowSeconds,
    });

    expect(replay).toEqual(blocked);
    const rows = await connection.db
      .select()
      .from(notifications)
      .where(eq(notifications.type, "cap_blocked"));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      metadata: {
        attemptedAtomic: "1",
        capAtomic: "1000000",
        committedAtomic: "1000000",
      },
      receiptId: blocked.receiptId,
      sticky: true,
      tier: "3",
    });
    const domains = await connection.db
      .select()
      .from(notifications)
      .where(eq(notifications.type, "unusual_domain"));
    expect(domains).toHaveLength(1);
    expect(domains[0]?.resourceHost).toBe("api.vendor.test");
  });

  it("emits one normalized unusual-domain event under concurrent first use", async () => {
    const identity = await provision("200");
    const results = await Promise.all([
      reserveSignRequest(connection.db, {
        ...identity,
        body: signBody("250000", "https://API.Vendor.TEST/pay?key=one"),
        nowSeconds,
      }),
      reserveSignRequest(connection.db, {
        ...identity,
        body: signBody("250000", "https://api.vendor.test/other?key=two"),
        nowSeconds,
      }),
    ]);

    const rows = await connection.db
      .select()
      .from(notifications)
      .where(eq(notifications.type, "unusual_domain"));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      metadata: { resourceHost: "api.vendor.test" },
      resourceHost: "api.vendor.test",
      tier: "2",
    });
    expect(results.map((result) => result.receiptId)).toContain(rows[0]?.receiptId);
  });

  it.each([
    "pending",
    "settled",
    "blocked",
  ] as const)("treats a real historical %s receipt as prior domain use", async (status) => {
    const identity = await provision("200");
    await insertHistorical(identity, status, "known.vendor.test");

    await reserveSignRequest(connection.db, {
      ...identity,
      body: signBody("250000", "https://KNOWN.VENDOR.TEST/new"),
      nowSeconds,
    });

    const rows = await connection.db
      .select()
      .from(notifications)
      .where(eq(notifications.type, "unusual_domain"));
    expect(rows).toEqual([]);
  });

  it("rolls receipt, audit event, and both notifications back together", async () => {
    const identity = await provision("1");
    await expect(
      connection.db.transaction(async (transaction) => {
        const blocked = await reserveSignRequest(transaction as unknown as Database, {
          ...identity,
          body: signBody("25000", "https://rollback.vendor.test/pay"),
          nowSeconds,
        });
        expect(blocked.kind).toBe("blocked");
        expect(await transaction.select().from(notifications)).toHaveLength(2);
        throw new Error("rollback reservation");
      }),
    ).rejects.toThrow("rollback reservation");

    expect(await connection.db.select().from(receipts)).toEqual([]);
    expect(await connection.db.select().from(notifications)).toEqual([]);
    const [eventCount] = await connection.client<
      { count: string }[]
    >`select count(*) from agent_events`;
    expect(eventCount?.count).toBe("0");
  });
});
