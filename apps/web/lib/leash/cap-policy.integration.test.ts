import { randomBytes } from "node:crypto";

import { asc, eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { capCycles, caps, notifications } from "../db/schema";
import {
  LeashAgentNotFoundError,
  readOwnerCap,
  resetOwnerCapCycle,
  setOwnerCap,
} from "./cap-policy";
import { connection, insertReceipt, provision } from "./cap-policy.integration-support";

beforeEach(async () => {
  await connection.client`truncate table users cascade`;
});

afterAll(async () => {
  await connection.client.end();
});

describe("owner-scoped cap policy with real PostgreSQL", () => {
  it("creates the first real cap and cycle, then reads exact zero usage", async () => {
    const identity = await provision("first");
    const now = new Date("2026-07-17T00:00:00.000Z");

    const created = await setOwnerCap(connection.db, {
      ...identity,
      amountUsdCents: "1000",
      frequency: "daily",
      now,
    });

    expect(created).toMatchObject({
      agentId: identity.agentId,
      cap: { amountUsdCents: "1000", frequency: "daily" },
      cycle: { startedAt: now },
      halted: false,
      spend: { committedAtomic: "0", pendingAtomic: "0", settledAtomic: "0" },
    });
    await expect(readOwnerCap(connection.db, { ...identity, now })).resolves.toEqual(created);
  });

  it("retains the cycle on amount-only changes and halts immediately below committed spend", async () => {
    const identity = await provision("lower");
    const started = await setOwnerCap(connection.db, {
      ...identity,
      amountUsdCents: "200",
      frequency: "daily",
      now: new Date("2026-07-17T00:00:00.000Z"),
    });
    await insertReceipt(identity, started.cycle.id, "settled", "700000");
    await insertReceipt(identity, started.cycle.id, "pending", "200000");
    await insertReceipt(identity, started.cycle.id, "failed", "900000");
    await insertReceipt(identity, started.cycle.id, "blocked", "900000");

    const lowered = await setOwnerCap(connection.db, {
      ...identity,
      amountUsdCents: "80",
      frequency: "daily",
      now: new Date("2026-07-17T01:00:00.000Z"),
    });
    expect(lowered).toMatchObject({
      cycle: { id: started.cycle.id },
      halted: true,
      spend: {
        blockedReceiptCount: 1,
        committedAtomic: "900000",
        pendingAtomic: "200000",
        settledAtomic: "700000",
      },
    });
    const activeAlerts = await connection.db
      .select({ resolvedAt: notifications.resolvedAt, type: notifications.type })
      .from(notifications)
      .where(eq(notifications.agentId, identity.agentId));
    expect(activeAlerts).toEqual([{ resolvedAt: null, type: "cap_lowered_halt" }]);

    const raised = await setOwnerCap(connection.db, {
      ...identity,
      amountUsdCents: "100",
      frequency: "daily",
      now: new Date("2026-07-17T02:00:00.000Z"),
    });
    expect(raised).toMatchObject({ cycle: { id: started.cycle.id }, halted: false });
    const [resolved] = await connection.db
      .select({ resolvedAt: notifications.resolvedAt })
      .from(notifications)
      .where(eq(notifications.agentId, identity.agentId));
    expect(resolved?.resolvedAt).toEqual(new Date("2026-07-17T02:00:00.000Z"));
  });

  it("keeps matching reverted-call evidence committed for the cycle after validBefore", async () => {
    const identity = await provision("reverted");
    const now = new Date("2026-07-17T00:00:00.000Z");
    const policy = await setOwnerCap(connection.db, {
      ...identity,
      amountUsdCents: "100",
      frequency: "daily",
      now,
    });
    const liveHash = `0x${randomBytes(32).toString("hex")}`;
    const expiredHash = `0x${randomBytes(32).toString("hex")}`;
    await insertReceipt(identity, policy.cycle.id, "failed", "700000", {
      hash: liveHash,
      validBefore: new Date("2026-07-17T01:00:00.000Z"),
    });
    await insertReceipt(identity, policy.cycle.id, "failed", "900000", {
      hash: expiredHash,
      validBefore: now,
    });

    await expect(readOwnerCap(connection.db, { ...identity, now })).resolves.toMatchObject({
      spend: {
        committedAtomic: "1600000",
        pendingAtomic: "0",
        revertedAtomic: "1600000",
        settledAtomic: "0",
      },
    });
    await expect(
      readOwnerCap(connection.db, {
        ...identity,
        now: new Date("2026-07-17T01:00:00.000Z"),
      }),
    ).resolves.toMatchObject({
      spend: {
        committedAtomic: "1600000",
        pendingAtomic: "0",
        revertedAtomic: "1600000",
        settledAtomic: "0",
      },
    });
  });

  it("starts a clean cycle on frequency change and manual reset", async () => {
    const identity = await provision("reset");
    const foreign = await provision("reset-foreign");
    const first = await setOwnerCap(connection.db, {
      ...identity,
      amountUsdCents: "100",
      frequency: "daily",
      now: new Date("2026-07-17T00:00:00.000Z"),
    });
    await insertReceipt(identity, first.cycle.id, "settled", "500000");
    await insertReceipt(identity, first.cycle.id, "blocked", "900000");
    const foreignCycle = await setOwnerCap(connection.db, {
      ...foreign,
      amountUsdCents: "100",
      frequency: "daily",
      now: new Date("2026-07-17T00:00:00.000Z"),
    });
    await insertReceipt(foreign, foreignCycle.cycle.id, "blocked", "900000");

    const weekly = await setOwnerCap(connection.db, {
      ...identity,
      amountUsdCents: "100",
      frequency: "weekly",
      now: new Date("2026-07-17T03:00:00.000Z"),
    });
    expect(weekly).toMatchObject({
      cap: { frequency: "weekly" },
      spend: { blockedReceiptCount: 0, committedAtomic: "0" },
    });
    expect(weekly.cycle.id).not.toBe(first.cycle.id);
    await insertReceipt(identity, weekly.cycle.id, "blocked", "900000");

    const reset = await resetOwnerCapCycle(connection.db, {
      ...identity,
      now: new Date("2026-07-17T04:00:00.000Z"),
    });
    expect(reset.cycle.id).not.toBe(weekly.cycle.id);
    expect(reset.spend).toMatchObject({ blockedReceiptCount: 0, committedAtomic: "0" });
    const history = await connection.db
      .select({ id: capCycles.id, resetReason: capCycles.resetReason })
      .from(capCycles)
      .where(eq(capCycles.agentId, identity.agentId))
      .orderBy(asc(capCycles.startedAt));
    expect(history).toEqual([
      { id: first.cycle.id, resetReason: "frequency_change" },
      { id: weekly.cycle.id, resetReason: "manual" },
      { id: reset.cycle.id, resetReason: null },
    ]);
  });

  it("reports the immutable month-end reset after a persisted short-month rollover", async () => {
    const identity = await provision("month-end");
    await setOwnerCap(connection.db, {
      ...identity,
      amountUsdCents: "100",
      frequency: "monthly",
      now: new Date("2026-01-31T00:00:00.000Z"),
    });

    const february = await readOwnerCap(connection.db, {
      ...identity,
      now: new Date("2026-02-28T00:00:00.000Z"),
    });
    expect(february).toMatchObject({
      cycle: {
        nextResetAt: new Date("2026-03-31T00:00:00.000Z"),
        startedAt: new Date("2026-02-28T00:00:00.000Z"),
      },
    });
  });

  it("re-anchors frequency changes and manual resets exactly at a UTC boundary", async () => {
    const frequencyIdentity = await provision("boundary-frequency");
    await setOwnerCap(connection.db, {
      ...frequencyIdentity,
      amountUsdCents: "100",
      frequency: "daily",
      now: new Date("2026-07-16T00:00:00.000Z"),
    });
    const weekly = await setOwnerCap(connection.db, {
      ...frequencyIdentity,
      amountUsdCents: "100",
      frequency: "weekly",
      now: new Date("2026-07-17T00:00:00.000Z"),
    });
    expect(weekly).toMatchObject({
      cap: { frequency: "weekly" },
      cycle: {
        nextResetAt: new Date("2026-07-24T00:00:00.000Z"),
        startedAt: new Date("2026-07-17T00:00:00.000Z"),
      },
    });

    const manualIdentity = await provision("boundary-manual");
    await setOwnerCap(connection.db, {
      ...manualIdentity,
      amountUsdCents: "100",
      frequency: "daily",
      now: new Date("2026-07-16T00:00:00.000Z"),
    });
    const reset = await resetOwnerCapCycle(connection.db, {
      ...manualIdentity,
      now: new Date("2026-07-17T00:00:00.000Z"),
    });
    expect(reset.cycle).toMatchObject({
      nextResetAt: new Date("2026-07-18T00:00:00.000Z"),
      startedAt: new Date("2026-07-17T00:00:00.000Z"),
    });

    const reasons = await connection.db
      .select({ agentId: capCycles.agentId, resetReason: capCycles.resetReason })
      .from(capCycles)
      .where(eq(capCycles.endedAt, new Date("2026-07-17T00:00:00.000Z")));
    expect(reasons).toEqual(
      expect.arrayContaining([
        { agentId: frequencyIdentity.agentId, resetReason: "frequency_change" },
        { agentId: manualIdentity.agentId, resetReason: "manual" },
      ]),
    );
  });

  it("does not reveal or mutate an agent owned by another user", async () => {
    const owner = await provision("owner");
    const foreign = await provision("foreign");

    await expect(
      setOwnerCap(connection.db, {
        agentId: owner.agentId,
        amountUsdCents: "100",
        frequency: "daily",
        now: new Date("2026-07-17T00:00:00.000Z"),
        ownerId: foreign.ownerId,
      }),
    ).rejects.toBeInstanceOf(LeashAgentNotFoundError);
    expect(await connection.db.select().from(caps)).toEqual([]);
  });
});
