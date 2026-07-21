import { randomBytes, randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { createDatabase } from "../db/client";
import { agents, capCycles, notifications, receipts, users } from "../db/schema";
import {
  emitCap75,
  emitCapBlocked,
  emitCapLoweredHalt,
  emitUnusualDomain,
  resolveActiveCapHalt,
} from "./notifier";
import { canonicalResourceIdentity } from "./resource-identity";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required for notifier integration tests");

const connection = createDatabase(databaseUrl, 8);
const baseUsdc = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const payTo = "0x1111111111111111111111111111111111111111";

beforeEach(async () => {
  await connection.client`truncate table users cascade`;
});

afterAll(async () => {
  await connection.client.end();
});

async function provision(label: string) {
  const [owner] = await connection.db
    .insert(users)
    .values({
      email: `${label}-${randomUUID()}@example.test`,
      magicIssuer: `did:ethr:${randomUUID()}`,
    })
    .returning({ id: users.id });
  if (!owner) throw new Error("Expected owner");
  const [agent] = await connection.db
    .insert(agents)
    .values({ ownerId: owner.id, name: `${label} agent`, signerSubject: `leash:${randomUUID()}` })
    .returning({ id: agents.id });
  if (!agent) throw new Error("Expected agent");
  const [cycle] = await connection.db
    .insert(capCycles)
    .values({ agentId: agent.id, startedAt: new Date("2026-07-17T00:00:00.000Z") })
    .returning({ id: capCycles.id });
  if (!cycle) throw new Error("Expected cycle");
  return { agentId: agent.id, cycleId: cycle.id };
}

async function insertReceipt(
  identity: Awaited<ReturnType<typeof provision>>,
  options: { blocked?: boolean; resourceHost?: string } = {},
) {
  const [row] = await connection.db
    .insert(receipts)
    .values({
      agentId: identity.agentId,
      amountAtomic: "100000",
      amountUsd: "0.100000",
      asset: baseUsdc,
      authorizationNonce: `0x${randomBytes(32).toString("hex")}`,
      authorizationValidBefore: new Date("2030-01-01T00:00:00.000Z"),
      cycleId: identity.cycleId,
      intendedNetwork: options.blocked ? "eip155:8453" : null,
      network: "eip155:8453",
      payTo,
      reason: options.blocked ? "CAP_EXCEEDED" : null,
      requestFingerprint: randomBytes(32).toString("hex"),
      resourceHost: options.resourceHost,
      resourceUrl: options.resourceHost ? `https://${options.resourceHost}/paid` : undefined,
      status: options.blocked ? "blocked" : "pending",
    })
    .returning({ id: receipts.id });
  if (!row) throw new Error("Expected receipt");
  return row.id;
}

describe("transactional Agent notifier with real PostgreSQL", () => {
  it("emits cap_75 once per cycle under concurrent transactions", async () => {
    const identity = await provision("cap-75");
    const now = new Date("2026-07-17T00:01:00.000Z");
    const options = {
      ...identity,
      capAtomic: "1000000",
      committedAtomic: "750000",
      now,
    };

    const [first, replay] = await Promise.all([
      connection.db.transaction((tx) => emitCap75(tx, options)),
      connection.db.transaction((tx) => emitCap75(tx, options)),
    ]);

    expect(replay.id).toBe(first.id);
    const rows = await connection.db
      .select()
      .from(notifications)
      .where(eq(notifications.agentId, identity.agentId));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      createdAt: now,
      eventKey: `cap_75:${identity.cycleId}`,
      metadata: { capAtomic: "1000000", committedAtomic: "750000", thresholdPercent: 75 },
      sticky: false,
      tier: "2",
      type: "cap_75",
    });
  });

  it("emits an unusual domain once per agent and links its receipt", async () => {
    const identity = await provision("domain");
    const resourceHost = "api.vendor.test";
    const resourceUrl = `https://${resourceHost}/paid`;
    const { resourceKey } = canonicalResourceIdentity(resourceUrl, resourceHost);
    const receiptId = await insertReceipt(identity, { resourceHost });
    const options = {
      ...identity,
      now: new Date("2026-07-17T00:02:00.000Z"),
      receiptId,
      resourceHost,
      resourceKey,
      resourceUrl,
    };

    const [first, replay] = await Promise.all([
      connection.db.transaction((tx) => emitUnusualDomain(tx, options)),
      connection.db.transaction((tx) => emitUnusualDomain(tx, options)),
    ]);

    expect(replay.id).toBe(first.id);
    expect(first).toMatchObject({
      eventKey: `unusual_domain:${resourceKey}`,
      metadata: { resourceHost, resourceUrl },
      receiptId,
      resourceHost,
      resourceKey,
      sticky: false,
      tier: "2",
      type: "unusual_domain",
    });
    expect(await connection.db.select().from(notifications)).toHaveLength(1);
  });

  it("emits one unresolved cap-blocked T3 episode linked to the blocked receipt", async () => {
    const identity = await provision("blocked");
    const receiptId = await insertReceipt(identity, { blocked: true });
    const options = {
      ...identity,
      attemptedAtomic: "1",
      capAtomic: "1000000",
      committedAtomic: "1000000",
      now: new Date("2026-07-17T00:03:00.000Z"),
      receiptId,
    };

    const [first, replay] = await Promise.all([
      connection.db.transaction((tx) => emitCapBlocked(tx, options)),
      connection.db.transaction((tx) => emitCapBlocked(tx, options)),
    ]);

    expect(replay.id).toBe(first.id);
    expect(first).toMatchObject({
      eventKey: `cap_blocked:${receiptId}`,
      metadata: {
        attemptedAtomic: "1",
        capAtomic: "1000000",
        committedAtomic: "1000000",
      },
      receiptId,
      resolvedAt: null,
      sticky: true,
      tier: "3",
      type: "cap_blocked",
    });
    expect(await connection.db.select().from(notifications)).toHaveLength(1);
  });

  it("shares one active cap-halt episode and resolves it only at the remedial timestamp", async () => {
    const identity = await provision("lowered");
    const receiptId = await insertReceipt(identity, { blocked: true });
    const loweredAt = new Date("2026-07-17T00:04:00.000Z");
    const lowered = await connection.db.transaction((tx) =>
      emitCapLoweredHalt(tx, {
        ...identity,
        capAtomic: "800000",
        committedAtomic: "900000",
        now: loweredAt,
      }),
    );
    const blockedReplay = await connection.db.transaction((tx) =>
      emitCapBlocked(tx, {
        ...identity,
        attemptedAtomic: "1",
        capAtomic: "800000",
        committedAtomic: "900000",
        now: new Date("2026-07-17T00:05:00.000Z"),
        receiptId,
      }),
    );
    expect(blockedReplay.id).toBe(lowered.id);
    expect(lowered).toMatchObject({
      eventKey: `cap_lowered_halt:${identity.cycleId}:${loweredAt.toISOString()}`,
      metadata: { capAtomic: "800000", committedAtomic: "900000" },
      sticky: true,
      tier: "3",
      type: "cap_lowered_halt",
    });

    const resolvedAt = new Date("2026-07-17T00:06:00.000Z");
    const resolved = await connection.db.transaction((tx) =>
      resolveActiveCapHalt(tx, { agentId: identity.agentId, now: resolvedAt }),
    );
    expect(resolved?.resolvedAt).toEqual(resolvedAt);
    await expect(
      connection.db.transaction((tx) =>
        resolveActiveCapHalt(tx, { agentId: identity.agentId, now: resolvedAt }),
      ),
    ).resolves.toBeUndefined();

    const nextAt = new Date("2026-07-17T00:07:00.000Z");
    const [next, competing] = await Promise.all([
      connection.db.transaction((tx) =>
        emitCapBlocked(tx, {
          ...identity,
          attemptedAtomic: "1",
          capAtomic: "800000",
          committedAtomic: "900000",
          now: nextAt,
          receiptId,
        }),
      ),
      connection.db.transaction((tx) =>
        emitCapLoweredHalt(tx, {
          ...identity,
          capAtomic: "800000",
          committedAtomic: "900000",
          now: nextAt,
        }),
      ),
    ]);
    expect(next.id).not.toBe(lowered.id);
    expect(competing.id).toBe(next.id);
    const episodes = await connection.db
      .select({ resolvedAt: notifications.resolvedAt })
      .from(notifications)
      .where(eq(notifications.agentId, identity.agentId));
    expect(episodes.filter((episode) => episode.resolvedAt === null)).toHaveLength(1);
  });

  it("propagates unique failures outside the expected idempotency constraint", async () => {
    const identity = await provision("unexpected");
    await connection.db.insert(notifications).values({
      ...identity,
      eventKey: `cap_75:${identity.cycleId}`,
      metadata: {},
      sticky: false,
      tier: "2",
      type: "float_low",
    });

    await expect(
      connection.db.transaction((tx) =>
        emitCap75(tx, {
          ...identity,
          capAtomic: "1000000",
          committedAtomic: "750000",
          now: new Date("2026-07-17T00:08:00.000Z"),
        }),
      ),
    ).rejects.toMatchObject({
      cause: { code: "23505", constraint_name: "notifications_agent_event_key_unique" },
    });
  });

  it("participates in the caller transaction rollback", async () => {
    const identity = await provision("rollback");
    await expect(
      connection.db.transaction(async (tx) => {
        await emitCap75(tx, {
          ...identity,
          capAtomic: "1000000",
          committedAtomic: "750000",
          now: new Date("2026-07-17T00:09:00.000Z"),
        });
        throw new Error("roll back business transaction");
      }),
    ).rejects.toThrow("roll back business transaction");
    expect(await connection.db.select().from(notifications)).toEqual([]);
  });
});
