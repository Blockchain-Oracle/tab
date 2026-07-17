import { randomBytes, randomUUID } from "node:crypto";

import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { createDatabase } from "../db/client";
import { completePreSigningChecks, reserveSignRequest, type SignGateError } from "./sign-store";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required for sign-store tests");

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

async function provision(
  options: {
    capCents?: string | null;
    status?: "provisioned" | "paused" | "frozen" | "cancelled" | "nuked";
  } = {},
) {
  const [owner] = await connection.client<{ id: string }[]>`
    insert into users (email, magic_issuer)
    values (${`${randomUUID()}@example.test`}, ${`did:ethr:${randomUUID()}`})
    returning id
  `;
  if (!owner) throw new Error("Expected an owner");
  const [agent] = await connection.client<{ id: string }[]>`
    insert into agents (owner_id, name, status, signer_subject, agent_address)
    values (
      ${owner.id}, 'Sign test', ${options.status ?? "provisioned"},
      ${`leash:${randomUUID()}`}, ${agentAddress}
    ) returning id
  `;
  if (!agent) throw new Error("Expected an agent");
  const [key] = await connection.client<{ id: string }[]>`
    insert into leash_keys (agent_id, hashed_key, prefix, last4)
    values (${agent.id}, ${randomBytes(32).toString("hex")}, 'leash_sk_', 'a1B2')
    returning id
  `;
  const [cycle] = await connection.client<{ id: string }[]>`
    insert into cap_cycles (agent_id, started_at)
    values (${agent.id}, now() - interval '1 minute') returning id
  `;
  if (!key || !cycle) throw new Error("Expected key and cycle");
  if (options.capCents !== null) {
    await connection.client`
      insert into caps (agent_id, amount_usd_cents, frequency)
      values (${agent.id}, ${options.capCents ?? "100"}, 'daily')
    `;
  }
  return { agentId: agent.id, cycleId: cycle.id, keyId: key.id };
}

function signBody(amount = "250000", nonce = randomBytes(32).toString("hex")) {
  return {
    amount,
    asset: baseUsdc,
    network: "eip155:8453",
    origin: { clientName: "Claude Code", toolName: "search", transport: "mcp" },
    payTo,
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

async function insertCommitted(
  agentId: string,
  cycleId: string,
  status: "pending" | "settled" | "failed" | "blocked",
  amount: string,
) {
  const terminal = status === "settled";
  const blocked = status === "blocked";
  await connection.client`
    insert into receipts (
      agent_id, cycle_id, status, reason, amount_atomic, amount_usd, asset, network,
      intended_network, pay_to, authorization_nonce, request_fingerprint,
      authorization_valid_before, origin, tx_hash, settlement_response, settled_at
    ) values (
      ${agentId}, ${cycleId}, ${status},
      ${status === "failed" ? "FLOAT_EMPTY" : blocked ? "LEASH_CAP_EXCEEDED" : null},
      ${amount}, ${amount}::numeric / 1000000, ${baseUsdc}, 'eip155:8453',
      ${blocked ? "eip155:8453" : null}, ${payTo},
      ${`0x${randomBytes(32).toString("hex")}`}, ${randomBytes(32).toString("hex")},
      now() + interval '5 minutes', null,
      ${terminal ? `0x${randomBytes(32).toString("hex")}` : null},
      ${terminal ? JSON.stringify({ verified: true }) : null}::jsonb,
      ${terminal ? new Date().toISOString() : null}::timestamptz
    )
  `;
}

describe("atomic hosted-signer reservation gate", () => {
  it.each([
    ["paused", "AGENT_PAUSED"],
    ["frozen", "AGENT_FROZEN"],
    ["cancelled", "AGENT_CANCELLED"],
    ["nuked", "AGENT_CANCELLED"],
  ] as const)("rejects %s before parsing an invalid request", async (status, code) => {
    const identity = await provision({ status });
    await expect(
      reserveSignRequest(connection.db, {
        ...identity,
        body: { invalid: true },
        nowSeconds,
      }),
    ).rejects.toMatchObject({ code, status: 423 } satisfies Partial<SignGateError>);
    const [count] = await connection.client<{ count: string }[]>`select count(*) from receipts`;
    expect(count?.count).toBe("0");
  });

  it("counts pending and settled only, allows exact cap, then writes a blocked attempt", async () => {
    const identity = await provision({ capCents: "100" });
    await insertCommitted(identity.agentId, identity.cycleId, "settled", "300000");
    await insertCommitted(identity.agentId, identity.cycleId, "pending", "300000");
    await insertCommitted(identity.agentId, identity.cycleId, "failed", "900000");
    await insertCommitted(identity.agentId, identity.cycleId, "blocked", "900000");

    const exact = await reserveSignRequest(connection.db, {
      ...identity,
      body: signBody("400000"),
      nowSeconds,
    });
    expect(exact).toMatchObject({ kind: "pending", replayed: false });
    const blocked = await reserveSignRequest(connection.db, {
      ...identity,
      body: signBody("1"),
      nowSeconds,
    });
    expect(blocked).toMatchObject({ code: "LEASH_CAP_EXCEEDED", kind: "blocked" });

    const [stored] = await connection.client<{ intended_network: string; status: string }[]>`
      select status, intended_network from receipts where id = ${blocked.receiptId}
    `;
    expect(stored).toEqual({ intended_network: "eip155:8453", status: "blocked" });
  });

  it("serializes concurrent requests so only one can reserve the remaining cap", async () => {
    const identity = await provision({ capCents: "50" });
    const results = await Promise.all(
      [signBody("300000"), signBody("300000")].map((body) =>
        reserveSignRequest(connection.db, { ...identity, body, nowSeconds }),
      ),
    );
    expect(results.map((result) => result.kind).sort()).toEqual(["blocked", "pending"]);
  });

  it("reuses an identical nonce reservation without double-counting it", async () => {
    const identity = await provision();
    const body = signBody();
    const first = await reserveSignRequest(connection.db, { ...identity, body, nowSeconds });
    const second = await reserveSignRequest(connection.db, { ...identity, body, nowSeconds });
    expect(second).toMatchObject({ kind: "pending", receiptId: first.receiptId, replayed: true });
    const [count] = await connection.client<{ count: string }[]>`select count(*) from receipts`;
    expect(count?.count).toBe("1");
  });

  it("fails safely before signing when pending floats overcommit or the signer is blocked", async () => {
    const identity = await provision({ capCents: "200" });
    const first = await reserveSignRequest(connection.db, {
      ...identity,
      body: signBody("600000"),
      nowSeconds,
    });
    const second = await reserveSignRequest(connection.db, {
      ...identity,
      body: signBody("600000"),
      nowSeconds,
    });
    if (first.kind !== "pending" || second.kind !== "pending") throw new Error("Expected pending");

    await expect(
      completePreSigningChecks(connection.db, {
        ...identity,
        liveBalanceAtomic: BigInt(1_000_000),
        receiptId: second.receiptId,
        signerAvailable: true,
      }),
    ).resolves.toMatchObject({ code: "FLOAT_EMPTY", kind: "failed" });
    await expect(
      completePreSigningChecks(connection.db, {
        ...identity,
        liveBalanceAtomic: BigInt(1_000_000),
        receiptId: first.receiptId,
        signerAvailable: false,
      }),
    ).resolves.toMatchObject({ code: "SIGNER_NOT_CONFIGURED", kind: "failed" });
  });
});
