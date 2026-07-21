import { randomBytes, randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { generateLeashKey } from "../auth/leash-key";
import { createDatabase } from "../db/client";
import { agents, capCycles, caps, leashKeys, receipts, users } from "../db/schema";
import { revokeOwnerAgent } from "./revoke-store";
import { completePreSigningChecks } from "./sign-preflight-store";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required for preflight revocation tests");
const connection = createDatabase(databaseUrl, 4);

beforeEach(async () => {
  await connection.client`truncate table users cascade`;
});

afterAll(async () => {
  await connection.client.end();
});

async function pendingPayment(label: string) {
  const [owner] = await connection.db
    .insert(users)
    .values({ email: `${label}-${randomUUID()}@example.test`, magicIssuer: `did:${randomUUID()}` })
    .returning({ id: users.id });
  if (!owner) throw new Error("Expected owner");
  const [agent] = await connection.db
    .insert(agents)
    .values({
      agentAddress: "0x2222222222222222222222222222222222222222",
      name: `${label} agent`,
      ownerId: owner.id,
      signerSubject: `leash:${randomUUID()}`,
    })
    .returning({ id: agents.id, name: agents.name });
  if (!agent) throw new Error("Expected agent");
  const material = generateLeashKey();
  const [key] = await connection.db
    .insert(leashKeys)
    .values({
      agentId: agent.id,
      hashedKey: material.hash,
      last4: material.last4,
      prefix: material.prefix,
    })
    .returning({ id: leashKeys.id });
  const [cycle] = await connection.db
    .insert(capCycles)
    .values({ agentId: agent.id, startedAt: new Date(Date.now() - 60_000) })
    .returning({ id: capCycles.id });
  if (!key || !cycle) throw new Error("Expected policy identity");
  await connection.db.insert(caps).values({
    agentId: agent.id,
    amountUsdCents: "200",
    frequency: "daily",
  });
  const [receipt] = await connection.db
    .insert(receipts)
    .values({
      agentId: agent.id,
      amountAtomic: "250000",
      amountUsd: "0.250000",
      asset: "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913",
      authorizationNonce: `0x${randomBytes(32).toString("hex")}`,
      authorizationValidBefore: new Date(Date.now() + 300_000),
      cycleId: cycle.id,
      network: "eip155:8453",
      payTo: "0x1111111111111111111111111111111111111111",
      requestFingerprint: randomBytes(32).toString("hex"),
    })
    .returning({ id: receipts.id });
  if (!receipt) throw new Error("Expected receipt");
  return {
    agentId: agent.id,
    agentName: agent.name,
    keyId: key.id,
    ownerId: owner.id,
    receiptId: receipt.id,
  };
}

describe("revocation during the live-balance RPC gap", () => {
  it.each([
    "cancel",
    "nuclear",
  ] as const)("terminalizes a pre-sign reservation when %s invalidates the authenticated key", async (action) => {
    const identity = await pendingPayment(action);
    await revokeOwnerAgent(connection.db, {
      action,
      actorSurface: "web",
      agentId: identity.agentId,
      confirmation: action === "cancel" ? "CANCEL" : identity.agentName,
      ownerId: identity.ownerId,
    });

    await expect(
      completePreSigningChecks(connection.db, {
        agentId: identity.agentId,
        keyId: identity.keyId,
        liveBalanceAtomic: BigInt(1_000_000),
        receiptId: identity.receiptId,
        signerAvailable: true,
      }),
    ).resolves.toMatchObject({ code: "INVALID_AGENT_KEY", kind: "failed" });
    const [stored] = await connection.db
      .select({ reason: receipts.reason, status: receipts.status })
      .from(receipts)
      .where(eq(receipts.id, identity.receiptId));
    expect(stored).toEqual({ reason: "INVALID_AGENT_KEY", status: "failed" });
  });
});
